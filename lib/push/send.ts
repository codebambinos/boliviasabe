/**
 * Sends one notification as a Web Push (SPEC 15): called by /api/push, which pg_net calls for every new row of
 * `notifications` (0008). Safe to call twice: a notification is claimed by setting `pushed_at` before sending.
 */
import { sendNotification, setVapidDetails } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMessage, turnedOff, type NotificationKind, type PushMessage } from './message.ts';

export type Subscription = { id: number; endpoint: string; p256dh: string; auth: string };

/** Sends to one device. Resolves to the HTTP status (201 when the push service took it). */
export type Sender = (subscription: Subscription, message: PushMessage) => Promise<number>;

export type PushResult = { sent: number; skipped?: 'missing' | 'done' | 'prefs' | 'gone' | 'recent' | 'no_devices' };

type Details = {
  userId: number;
  kind: NotificationKind;
  refId: number;
  pushedAt: string | null;
  prefs: unknown;
  actor: string | null;
  text: string | null;
  zone: string | null;
  url: string | null;
  visible: boolean;
  signPushedRecently: boolean;
};

const VAPID_SUBJECT = 'mailto:boliviasabe.app@gmail.com';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** web-push with the VAPID keys of the environment. */
export function webPushSender(): Sender {
  setVapidDetails(VAPID_SUBJECT, env('VITE_VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  return async (subscription, message) => {
    try {
      const result = await sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(message),
        { TTL: 24 * 60 * 60, urgency: 'high' },
      );
      return result.statusCode;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (typeof status === 'number') return status;
      throw error;
    }
  };
}

export async function sendPush(db: SupabaseClient, notificationId: number, send: Sender): Promise<PushResult> {
  const { data, error } = await db.rpc('push_details', { p_id: notificationId });
  if (error) throw new Error(`push_details: ${error.message}`);
  const details = data as Details | null;
  if (!details) return { sent: 0, skipped: 'missing' };
  if (details.pushedAt) return { sent: 0, skipped: 'done' };

  // Decided before claiming, so the hourly limit of a letrero does not count this very row
  const skip: PushResult['skipped'] = turnedOff(details.prefs, details.kind)
    ? 'prefs'
    : !details.visible || !details.url
      ? 'gone'
      : details.signPushedRecently
        ? 'recent'
        : undefined;

  // Claim it: a second call (a pg_net retry) finds pushed_at set and stops here
  const claim = await db.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', notificationId).is('pushed_at', null).select('id');
  if (claim.error) throw new Error(`notifications: ${claim.error.message}`);
  if (!claim.data?.length) return { sent: 0, skipped: 'done' };
  if (skip) return { sent: 0, skipped: skip };

  const subs = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', details.userId);
  if (subs.error) throw new Error(`push_subscriptions: ${subs.error.message}`);
  const devices = (subs.data ?? []) as Subscription[];
  if (devices.length === 0) return { sent: 0, skipped: 'no_devices' };

  const message = buildMessage({ ...details, url: details.url as string });
  let sent = 0;
  for (const device of devices) {
    try {
      const status = await send(device, message);
      if (status === 404 || status === 410) {
        // The browser dropped this subscription: forget it
        await db.from('push_subscriptions').delete().eq('id', device.id);
      } else if (status >= 200 && status < 300) {
        sent += 1;
      } else {
        console.error(`push: device ${device.id} answered ${status}`);
      }
    } catch (error) {
      console.error(`push: device ${device.id} failed`, error);
    }
  }
  return { sent };
}
