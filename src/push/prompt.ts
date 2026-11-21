// «¿Te avisamos…?» after the person's first publication (SPEC 15, wiki #205): once per device, only while the
// permission was never asked (or on an iPhone that still needs the app installed). PushPrompt shows it.
import { useSyncExternalStore } from 'react';
import { pushSupport } from './device';

export type PublishedKind = 'question' | 'answer' | 'sign';

const ASKED_KEY = 'bs.pushAsked';
/** Lets the person see what they published (the new question, the toast) before the sheet rises. */
const DELAY_MS = 1200;

let pending: PublishedKind | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function alreadyAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return true; // no storage (private mode): never nag on every publication
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Called right after a question, an answer or a letrero is published. */
export function askAfterPublish(kind: PublishedKind): void {
  if (alreadyAsked()) return;
  const support = pushSupport();
  const canAsk = support === 'ios-not-installed' || (support === 'ok' && Notification.permission === 'default');
  if (!canAsk) return;
  window.setTimeout(() => {
    if (alreadyAsked()) return;
    markAsked();
    pending = kind;
    notify();
  }, DELAY_MS);
}

export function dismissPrompt(): void {
  pending = null;
  notify();
}

export function usePendingPrompt(): PublishedKind | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => pending,
    () => null,
  );
}
