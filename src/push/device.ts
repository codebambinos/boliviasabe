// This device and Web Push (SPEC 15). What the phone allows, turning push on, and forgetting the device when the
// person signs out (wiki #205, #207). The subscription is saved for the account through src/data.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../data/source';
import { isIos, isStandalone } from '../pwa/install';

/** ok: push can be turned on · ios-not-installed: iPhone needs the app on the home screen first (iOS 16.4+). */
export type PushSupport = 'ok' | 'ios-not-installed' | 'unsupported' | 'denied';

/** What Ajustes shows: on for this device, off (can be turned on), or why it cannot be. */
export type PushStatus = 'on' | 'off' | 'denied' | 'ios-not-installed' | 'unsupported';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-not-installed';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID_PUBLIC_KEY) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/** The service worker, when there is one (production builds only, SPEC 16). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function pushStatus(): Promise<PushStatus> {
  const support = pushSupport();
  if (support !== 'ok') return support;
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/**
 * Asks for permission (the browser's dialog, only the first time), subscribes this device and saves it for the
 * signed-in person. Resolves to the new status; rejects with a DataError when saving fails.
 */
export async function enablePush(): Promise<PushStatus> {
  if (pushSupport() !== 'ok') return pushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return pushStatus();
  const reg = await registration();
  if (!reg || !VAPID_PUBLIC_KEY) return 'unsupported';
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = subscription.toJSON();
  await api.push.saveSubscription({ endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' });
  return 'on';
}

/** Cerrar sesión: this device stops receiving the account's notices. Never throws: signing out must go on. */
export async function disablePushOnThisDevice(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await api.push.deleteSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  } catch {
    /* no service worker or push manager: nothing to forget */
  }
}

/** The status for a screen, refreshed when the person comes back to the app (they may have changed the permission). */
export function usePushStatus(): { status: PushStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const refresh = useCallback(() => {
    void pushStatus().then(setStatus, () => setStatus('unsupported'));
  }, []);
  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  return { status, refresh };
}
