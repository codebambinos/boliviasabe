// Drafts that survive a page reload (SPEC 07): text fields in localStorage, photos in IndexedDB. For inline
// text boxes where the wall comes at «Enviar» (answers, comments). A form registers a getter with
// AuthGate (useDraftSaver), which saves it before the Google redirect; the form reads it on mount.
// It has its own IndexedDB database, so it never collides with another module. Drafts expire after
// 30 minutes. If a storage fails it falls back to memory, and no call ever throws.
export type DraftRecord = { fields: Record<string, unknown>; blobs: Record<string, Blob> };

type StoredFields = { savedAt: number; fields: Record<string, unknown>; blobNames: string[] };

const DB_NAME = 'boliviasabe-drafts';
const STORE = 'blobs';
const MAX_AGE_MS = 30 * 60 * 1000;
const fieldsKey = (key: string) => `bs:draft:${key}:v1`;
const blobKey = (key: string, name: string) => `${key}/${name}`;

const memory = new Map<string, { savedAt: number; draft: DraftRecord }>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>[]): Promise<T[]> {
  const db = await openDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const requests = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(requests.map((request) => request.result));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(key: string, draft: DraftRecord): Promise<void> {
  const savedAt = Date.now();
  memory.set(key, { savedAt, draft });
  const blobNames = Object.keys(draft.blobs);
  try {
    localStorage.setItem(fieldsKey(key), JSON.stringify({ savedAt, fields: draft.fields, blobNames } satisfies StoredFields));
  } catch {
    /* memory copy stays */
  }
  try {
    await inStore('readwrite', (store) => blobNames.map((name) => store.put(draft.blobs[name], blobKey(key, name))));
  } catch {
    /* memory copy stays */
  }
}

/** The saved draft, or null when there is none or it is older than 30 minutes (then it is removed). */
export async function loadDraft(key: string, now = Date.now()): Promise<DraftRecord | null> {
  let stored: StoredFields | null = null;
  try {
    const raw = localStorage.getItem(fieldsKey(key));
    stored = raw ? (JSON.parse(raw) as StoredFields) : null;
  } catch {
    stored = null;
  }
  if (!stored) {
    const kept = memory.get(key);
    if (kept && now - kept.savedAt <= MAX_AGE_MS) return kept.draft;
    memory.delete(key);
    return null;
  }
  if (now - stored.savedAt > MAX_AGE_MS) {
    await clearDraft(key);
    return null;
  }
  const blobs: Record<string, Blob> = {};
  try {
    const values = await inStore<Blob | undefined>('readonly', (store) =>
      stored.blobNames.map((name) => store.get(blobKey(key, name)) as IDBRequest<Blob | undefined>),
    );
    stored.blobNames.forEach((name, i) => {
      if (values[i] instanceof Blob) blobs[name] = values[i];
    });
  } catch {
    const kept = memory.get(key)?.draft.blobs ?? {};
    Object.assign(blobs, kept);
  }
  return { fields: stored.fields, blobs };
}

export async function clearDraft(key: string): Promise<void> {
  const names = memory.get(key) ? Object.keys(memory.get(key)!.draft.blobs) : [];
  memory.delete(key);
  let stored: StoredFields | null = null;
  try {
    const raw = localStorage.getItem(fieldsKey(key));
    stored = raw ? (JSON.parse(raw) as StoredFields) : null;
    localStorage.removeItem(fieldsKey(key));
  } catch {
    /* nothing to clear */
  }
  const all = [...new Set([...names, ...(stored?.blobNames ?? [])])];
  if (all.length === 0) return;
  try {
    await inStore('readwrite', (store) => all.map((name) => store.delete(blobKey(key, name))));
  } catch {
    /* nothing to clear */
  }
}
