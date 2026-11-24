// The action a guest was about to do when «Crea tu cuenta» opened (SPEC 07). Google reloads the page, and
// a closure cannot survive that, so the action is saved as plain data and run again once the person is
// back and signed in. Each task adds its own `kind` and registers its handler in ShellLayout.
// Storage can fail (private mode, full disk): every call swallows the error and the person just
// has to repeat the tap.
export type PendingAction =
  | { kind: 'save-sign'; id: number }
  | { kind: 'vote-sign'; id: number; value: 'helpful' | 'not_helpful' }
  | { kind: 'save-question'; id: number }
  | { kind: 'save-answer'; id: number }
  | { kind: 'send-answer'; questionId: number }
  | { kind: 'send-comment'; answerId: number; questionId: number }
  | { kind: 'open-new-sign' }
  | { kind: 'open-ask'; text: string }
  | { kind: 'redeem-offer'; signId: number; offerId: number };

/** Registered by ShellLayout, which owns what a kind needs (sheets, city, navigation). */
export type PendingHandlers = {
  [K in PendingAction['kind']]?: (action: Extract<PendingAction, { kind: K }>) => void | Promise<void>;
};

export type PendingRecord = {
  resume: PendingAction | null;
  /** Where the person was, to come back to it after Google (which returns to the origin root). */
  path: string;
  reason: string;
  title?: string;
  savedAt: number;
};

const KEY = 'bs:pending:v1';
const MAX_AGE_MS = 10 * 60 * 1000;
const KINDS: readonly PendingAction['kind'][] = ['save-sign', 'vote-sign', 'save-question', 'save-answer', 'send-answer', 'send-comment', 'open-new-sign', 'open-ask', 'redeem-offer'];

export function savePending(record: PendingRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* nothing to restore later */
  }
}

/**
 * Reads the saved action without removing a valid one (the caller removes it once it has run). An
 * old or malformed record is dropped here, so it never lingers. Null when there is nothing to run.
 */
export function peekPending(now = Date.now()): PendingRecord | null {
  let record: PendingRecord | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    record = JSON.parse(raw) as PendingRecord;
  } catch {
    record = null;
  }
  if (!record || typeof record.path !== 'string' || typeof record.savedAt !== 'number' || now - record.savedAt > MAX_AGE_MS) {
    clearPending();
    return null;
  }
  // A kind this version does not know (an older tab saved it): keep the way back, drop the action
  if (record.resume && !KINDS.includes(record.resume.kind)) return { ...record, resume: null };
  return record;
}

export function clearPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
