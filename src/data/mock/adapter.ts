// Mock implementation of DataApi: in-memory, with fake latency and the wiki rules.
import type { DataApi } from '../api';
import { CITIES, PAGE_SIZE } from '../catalog';
import { DataError } from '../errors';
import type { City, Id, Page, Session, Sign } from '../types';
import { mockMode, simulate } from './behavior';
import { LUCIA, fakeAddress, fakeTxHash, type MovementRec, type SignRec } from './fixtures';
import {
  authorOf,
  currentUserId,
  isHiddenFor,
  isInReview,
  normalize,
  pairCanBeRewarded,
  requireProfile,
  requireUser,
  signsCreatedToday,
  MAX_REWARDED_SIGNS_PER_DAY,
  validateLength,
  validateMapsUrl,
  validateTags,
} from './rules';
import { nextId, store } from './store';

const SETTLE_MS = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- shared helpers ----------

/** Offset-based pagination: the cursor is the index of the first item of the next page. */
export function paginate<T>(items: T[], cursor?: string | null): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + PAGE_SIZE;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

/** Settles a pending movement after 2 s: confirmed, or error with ?mock=stellar-error. */
export function settle(movement: MovementRec, outcome: 'confirmed' | 'error'): void {
  setTimeout(() => {
    movement.status = outcome;
    movement.txHash = outcome === 'confirmed' ? fakeTxHash(movement.id + 1000) : null;
  }, SETTLE_MS);
}

/** Adds a reward (+) or spend (−) as pending; it settles like a Stellar payment would. */
export function addMovement(userId: Id, reason: MovementRec['reason'], amount: number, sourceUserId: Id | null): MovementRec {
  const movement: MovementRec = {
    id: nextId('movement'),
    userId,
    reason,
    amount,
    createdAt: new Date().toISOString(),
    status: 'pending',
    txHash: null,
    sourceUserId,
  };
  store.movements.push(movement);
  settle(movement, mockMode === 'stellar-error' ? 'error' : 'confirmed');
  return movement;
}

const matchesSearch = (text: string, search?: string) => !search?.trim() || normalize(text).includes(normalize(search));

// ---------- converters ----------

export function sessionOf(): Session {
  const userId = currentUserId();
  if (userId === null) return { status: 'guest' };
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { status: 'guest' };
  const profile =
    user.fullName && user.city && user.zone
      ? { ...authorOf(user.id), fullName: user.fullName, city: user.city, zone: user.zone }
      : null;
  return { status: 'signed-in', userId: user.id, email: user.email, profile };
}

export function toSign(rec: SignRec): Sign {
  const viewer = currentUserId();
  const votes = store.signVotes.filter((v) => v.signId === rec.id);
  const mine = votes.find((v) => v.userId === viewer);
  return {
    id: rec.id,
    title: rec.title,
    photoUrl: rec.photoUrl,
    price: rec.price,
    city: rec.city,
    zone: rec.zone,
    tags: [...rec.tags],
    mapsUrl: rec.mapsUrl,
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    helpfulCount: votes.filter((v) => v.value === 'helpful').length,
    myVote: mine?.value ?? null,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'sign' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('sign', rec.id),
  };
}

function signScore(rec: SignRec): number {
  const votes = store.signVotes.filter((v) => v.signId === rec.id);
  return votes.filter((v) => v.value === 'helpful').length - votes.filter((v) => v.value === 'not_helpful').length;
}

export function findVisibleSign(id: Id): SignRec {
  const rec = store.signs.find((s) => s.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'sign', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This sign is no longer available');
  }
  return rec;
}

// ---------- auth ----------

/** First «Tu barrio»: the Stellar account is prepared and the +5 welcome is paid. */
function prepareWallet(userId: Id): void {
  const user = store.users.find((u) => u.id === userId);
  if (!user) return;
  user.walletStatus = 'preparing';
  addMovement(userId, 'bienvenida', 5, null); // settles to confirmed at the same time the wallet is ready
  setTimeout(() => {
    user.walletStatus = 'ready';
    user.address = fakeAddress(userId);
  }, SETTLE_MS);
}

export const mockAuth: DataApi['auth'] = {
  getSession: () => simulate(() => sessionOf()),

  /** Fake Google login: always signs in as the seed neighbor «Lucía M.». */
  signInWithGoogle: () =>
    simulate(() => {
      store.session.userId = LUCIA;
      return sessionOf();
    }),

  /** Known email → that user. New email → new user without profile («Tu barrio» pending). */
  signInWithEmail: (email, password) =>
    simulate(() => {
      const clean = email.trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
      if (password.length < 6) throw new DataError('validation', 'Password needs at least 6 characters', { field: 'password' });
      let user = store.users.find((u) => u.email === clean);
      if (!user) {
        user = { id: nextId('user'), email: clean, fullName: null, city: null, zone: null, walletStatus: 'preparing', address: null };
        store.users.push(user);
      }
      store.session.userId = user.id;
      return sessionOf();
    }),

  signOut: () =>
    simulate(() => {
      store.session.userId = null;
      return sessionOf();
    }),

  saveProfile: ({ fullName, city, zone }) =>
    simulate(() => {
      const user = requireUser();
      const name = validateLength('fullName', fullName, 2, 60);
      if (!CITIES.includes(city as City)) throw new DataError('validation', 'Unknown city', { field: 'city' });
      const cleanZone = validateLength('zone', zone, 1, 60);
      const firstTime = user.fullName === null;
      user.fullName = name;
      user.city = city;
      user.zone = cleanZone;
      if (firstTime) prepareWallet(user.id);
      return sessionOf();
    }),
};

// ---------- signs ----------

export const mockSigns: DataApi['signs'] = {
  list: ({ city, search, tags, cursor }) =>
    simulate(() => {
      const viewer = currentUserId();
      const items = store.signs
        .filter((s) => s.city === city)
        .filter((s) => !isHiddenFor(viewer, 'sign', s.id, s.authorId))
        .filter((s) => matchesSearch(`${s.title} ${s.zone}`, search))
        .filter((s) => !tags?.length || s.tags.some((t) => tags.includes(t)))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || signScore(b) - signScore(a))
        .map(toSign);
      return paginate(items, cursor);
    }),

  get: (id) => simulate(() => toSign(findVisibleSign(id))),

  create: (input) =>
    simulate(() => {
      const user = requireProfile();
      const title = validateLength('title', input.title, 3, 80);
      if (!(input.photo instanceof Blob)) throw new DataError('validation', 'A photo is required', { field: 'photo' });
      const tags = validateTags(input.tags);
      const mapsUrl = validateMapsUrl(input.mapsUrl);
      const rewarded = signsCreatedToday(user.id) < MAX_REWARDED_SIGNS_PER_DAY;
      const rec: SignRec = {
        id: nextId('sign'),
        authorId: user.id,
        title,
        photoUrl: URL.createObjectURL(input.photo),
        price: input.price?.trim() || null,
        city: user.city,
        zone: input.zone?.trim() || user.zone,
        tags,
        mapsUrl,
        createdAt: new Date().toISOString(),
      };
      store.signs.push(rec);
      if (rewarded) addMovement(user.id, 'letrero', 1, null);
      return { sign: toSign(rec), rewarded };
    }),

  vote: (id, value) =>
    simulate(() => {
      const user = requireProfile();
      const rec = findVisibleSign(id);
      if (rec.authorId === user.id) throw new DataError('forbidden', 'You cannot vote on your own sign');
      if (store.signVotes.some((v) => v.signId === id && v.userId === user.id)) {
        throw new DataError('forbidden', 'You already voted on this sign');
      }
      store.signVotes.push({ signId: id, userId: user.id, value });
      if (value === 'helpful' && pairCanBeRewarded(user.id, rec.authorId)) {
        addMovement(rec.authorId, 'sirvio-l', 1, user.id);
      }
      return toSign(rec);
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleSign(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own sign');
      store.signs = store.signs.filter((s) => s.id !== id);
      store.signVotes = store.signVotes.filter((v) => v.signId !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'sign' && s.itemId === id));
    }),
};
