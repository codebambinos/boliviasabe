// Wiki rules the mock enforces, with the same errors the server will return.
// Source: wiki/reglas-finales.md («Yapitas», «Límites», «Preguntas», «Confianza»).
import { MAX_TAGS } from '../catalog';
import { DataError } from '../errors';
import type { Author, Badge, Id, ReportKind, Tag } from '../types';
import type { UserRec } from './fixtures';
import { store } from './store';

const HOUR = 3600 * 1000;
/** Bolivia is UTC−4 all year (no daylight saving time). */
const BOLIVIA_OFFSET = -4 * HOUR;

export const MAX_QUESTIONS_PER_DAY = 10;
export const MAX_OPEN_WITH_ANSWERS = 3;
export const MAX_REWARDED_SIGNS_PER_DAY = 10;
export const MAX_REWARDED_ANSWERS_PER_QUESTION = 3;
export const MAX_REWARDS_PER_PAIR_PER_DAY = 3;
export const URGENT_COST = 5;
export const URGENT_HOURS = 24;
export const REPORTS_TO_HIDE = 3;

/** Calendar day in Bolivia ("YYYY-MM-DD"): «por día» resets at midnight there. */
export function boliviaDay(date: string | number = Date.now()): string {
  const time = typeof date === 'string' ? Date.parse(date) : date;
  return new Date(time + BOLIVIA_OFFSET).toISOString().slice(0, 10);
}

/** Next midnight in Bolivia as an ISO date (04:00 UTC). */
export function nextBoliviaMidnight(now = Date.now()): string {
  const local = new Date(now + BOLIVIA_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BOLIVIA_OFFSET).toISOString();
}

export const isToday = (iso: string) => boliviaDay(iso) === boliviaDay();

/** Lowercase, no accents: zones and searches are compared this way. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** "Lucía Mamani" → "Lucía M."; a single word is shown as is. */
export function displayName(fullName: string): string {
  const [first, second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second[0].toUpperCase()}.` : first;
}

/** Stars = 1 + 4 × helpful / rated, over the user's answers. Under 3 ratings: «Vecino nuevo». */
export function trustOf(userId: Id): { stars: number | null; badge: Badge } {
  const rated = store.answers.filter((a) => a.authorId === userId && (a.helpful || a.notHelpful));
  if (rated.length < 3) return { stars: null, badge: 'Vecino nuevo' };
  const helpful = rated.filter((a) => a.helpful).length;
  const stars = Math.round((1 + (4 * helpful) / rated.length) * 10) / 10;
  return { stars, badge: stars >= 4.5 && rated.length >= 5 ? 'De confianza' : 'Buen vecino' };
}

export function authorOf(userId: Id): Author {
  const user = findUser(userId);
  return { id: userId, displayName: displayName(user.fullName ?? 'Vecino'), ...trustOf(userId) };
}

export function findUser(userId: Id): UserRec {
  const user = store.users.find((u) => u.id === userId);
  if (!user) throw new DataError('not_found', `User ${userId} not found`);
  return user;
}

export function currentUserId(): Id | null {
  return store.session.userId;
}

/** Signed-in user, or "unauthenticated" for guests. */
export function requireUser(): UserRec {
  const id = currentUserId();
  if (id === null) throw new DataError('unauthenticated', 'Sign in to continue');
  return findUser(id);
}

/** Signed-in user who already saved «Tu barrio». */
export function requireProfile(): UserRec & { fullName: string; city: NonNullable<UserRec['city']>; zone: string } {
  const user = requireUser();
  if (!user.fullName || !user.city || !user.zone) {
    throw new DataError('unauthenticated', 'Complete «Tu barrio» first', { field: 'profile' });
  }
  return user as UserRec & { fullName: string; city: NonNullable<UserRec['city']>; zone: string };
}

export function confirmedBalance(userId: Id): number {
  return store.movements
    .filter((m) => m.userId === userId && m.status === 'confirmed')
    .reduce((sum, m) => sum + m.amount, 0);
}

export function validateLength(field: string, text: string, min: number, max: number): string {
  const value = text.trim();
  if (value.length < min || value.length > max) {
    throw new DataError('validation', `${field} must be ${min} to ${max} characters`, { field });
  }
  return value;
}

export function validateTags(tags: Tag[] = []): Tag[] {
  if (tags.length > MAX_TAGS) throw new DataError('validation', `At most ${MAX_TAGS} tags`, { field: 'tags' });
  return [...tags];
}

export function validateMapsUrl(url?: string): string | null {
  if (!url?.trim()) return null;
  if (!url.trim().startsWith('https://')) {
    throw new DataError('validation', 'Maps link must start with https://', { field: 'mapsUrl' });
  }
  return url.trim();
}

/** Question limits: 10 per day, 3 open with answers, 1 active urgent, balance for urgent. */
export function assertCanAsk(userId: Id, urgent: boolean): void {
  const mine = store.questions.filter((q) => q.authorId === userId);
  if (mine.filter((q) => isToday(q.createdAt)).length >= MAX_QUESTIONS_PER_DAY) {
    throw new DataError('limit', 'Daily question limit reached', { limit: 'questions_per_day', until: nextBoliviaMidnight() });
  }
  const openWithAnswers = mine.filter((q) => q.status === 'open' && store.answers.some((a) => a.questionId === q.id));
  if (openWithAnswers.length >= MAX_OPEN_WITH_ANSWERS) {
    throw new DataError('limit', 'Close one of your questions first', { limit: 'open_questions' });
  }
  if (!urgent) return;
  const active = mine.find((q) => q.urgentUntil && Date.parse(q.urgentUntil) > Date.now());
  if (active) {
    throw new DataError('limit', 'You already have an urgent question', { limit: 'urgent_active', until: active.urgentUntil ?? undefined });
  }
  if (confirmedBalance(userId) < URGENT_COST) {
    throw new DataError('limit', 'Not enough yapitas', { limit: 'insufficient_balance' });
  }
}

export function signsCreatedToday(userId: Id): number {
  return store.signs.filter((s) => s.authorId === userId && isToday(s.createdAt)).length;
}

/** Anti-abuse: at most 3 rewards per day between the same two people. */
export function pairCanBeRewarded(sourceUserId: Id, targetUserId: Id): boolean {
  const today = store.movements.filter(
    (m) => m.userId === targetUserId && m.sourceUserId === sourceUserId && m.amount > 0 && isToday(m.createdAt),
  );
  return today.length < MAX_REWARDS_PER_PAIR_PER_DAY;
}

/** Content reported by 3 different people is hidden for everyone except its author. */
export function isInReview(kind: ReportKind, itemId: Id): boolean {
  const reporters = new Set(store.reports.filter((r) => r.kind === kind && r.itemId === itemId).map((r) => r.userId));
  return reporters.size >= REPORTS_TO_HIDE;
}

/** Hidden for the current viewer: in review (unless it is theirs) or «Ya no quiero ver esto». */
export function isHiddenFor(viewerId: Id | null, kind: ReportKind, itemId: Id, authorId: Id): boolean {
  if (viewerId !== null && store.hidden.some((h) => h.userId === viewerId && h.kind === kind && h.itemId === itemId)) return true;
  return isInReview(kind, itemId) && viewerId !== authorId;
}
