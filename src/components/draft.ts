// Saved drafts (wiki › tecnico «Volver a la acción después de Google», #167): text in localStorage,
// photo in IndexedDB. One draft per kind. Every call swallows storage errors (private mode, full
// disk): the form keeps working, only the draft is lost.
import type { Tag } from '../data';

export type DraftKind = 'sign';

export type SignDraft = {
  title: string;
  price: string;
  zone: string;
  tags: Tag[];
  mapsUrl: string;
  detailsOpen: boolean;
  hasPhoto: boolean;
};

type DraftText = { sign: SignDraft };
type Loaded<K extends DraftKind> = { text: DraftText[K] | null; photo: Blob | null; thumb: Blob | null };

const DB_NAME = 'boliviasabe';
const STORE = 'drafts';
const textKey = (kind: DraftKind) => `bs:draft:${kind}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDraft<K extends DraftKind>(kind: K): Promise<Loaded<K>> {
  let text: DraftText[K] | null = null;
  try {
    const raw = localStorage.getItem(textKey(kind));
    text = raw ? (JSON.parse(raw) as DraftText[K]) : null;
  } catch {
    text = null;
  }
  let photo: Blob | null = null;
  let thumb: Blob | null = null;
  if (text?.hasPhoto) {
    try {
      const saved = await withStore<{ photo: Blob; thumb: Blob } | undefined>('readonly', (s) => s.get(kind));
      if (saved?.photo instanceof Blob && saved.thumb instanceof Blob) {
        photo = saved.photo;
        thumb = saved.thumb;
      }
    } catch {
      // No photo; the text still comes back
    }
  }
  return { text, photo, thumb };
}

export function saveDraftText<K extends DraftKind>(kind: K, text: DraftText[K]): void {
  try {
    localStorage.setItem(textKey(kind), JSON.stringify(text));
  } catch {
    // Storage blocked or full
  }
}

export async function saveDraftPhoto(kind: DraftKind, photo: Blob, thumb: Blob): Promise<void> {
  try {
    await withStore('readwrite', (s) => {
      s.put({ photo, thumb }, kind);
    });
  } catch {
    // Storage blocked or full
  }
}

export async function clearDraft(kind: DraftKind): Promise<void> {
  try {
    localStorage.removeItem(textKey(kind));
  } catch {
    // ignore
  }
  try {
    await withStore('readwrite', (s) => {
      s.delete(kind);
    });
  } catch {
    // ignore
  }
}
