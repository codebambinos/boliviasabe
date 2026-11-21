// Public data types shared by every adapter and every screen.
// IDs are numbers (bigint identity in Postgres) because Stellar memos hold at most 28 bytes.
// Dates are ISO strings in UTC; screens format them in America/La_Paz.
import type { CITIES, REPORT_REASONS, TAGS } from './catalog';

export type Id = number;
export type City = (typeof CITIES)[number];
export type Tag = (typeof TAGS)[number];
export type Badge = 'Vecino nuevo' | 'Buen vecino' | 'De confianza';

/** Public view of a person. `stars` is null while the badge is «Vecino nuevo». */
export type Author = {
  id: Id;
  displayName: string; // "Lucía M."
  stars: number | null;
  badge: Badge;
};

export type Profile = Author & {
  fullName: string;
  city: City;
  zone: string;
};

/**
 * `profile === null` means «Tu barrio» is still pending; `suggestedName` is then the name Google
 * already knows, to prefill the form.
 */
export type Session =
  | { status: 'guest' }
  | { status: 'signed-in'; userId: Id; email: string; profile: Profile | null; suggestedName?: string };

export type Sign = {
  id: Id;
  title: string;
  photoUrl: string;
  /** 480 px thumbnail for the Hoy grid (wiki #142). Falls back to photoUrl while none exists. */
  thumbUrl: string;
  price: string | null;
  city: City;
  zone: string;
  tags: Tag[];
  mapsUrl: string | null;
  author: Author;
  createdAt: string;
  helpfulCount: number;
  myVote: 'helpful' | 'not_helpful' | null;
  savedByMe: boolean;
  isMine: boolean;
  inReview: boolean;
};

export type QuestionStatus = 'open' | 'solved' | 'closed';

export type Question = {
  id: Id;
  text: string;
  photoUrl: string | null;
  city: City;
  zone: string;
  tags: Tag[];
  author: Author;
  createdAt: string;
  urgentUntil: string | null;
  status: QuestionStatus;
  answerCount: number;
  savedByMe: boolean;
  isMine: boolean;
  inReview: boolean;
};

export type Answer = {
  id: Id;
  questionId: Id;
  text: string;
  author: Author;
  createdAt: string;
  helpful: boolean;
  notHelpful: boolean;
  savedByMe: boolean;
  isMine: boolean;
  inReview: boolean;
};

/** 30 items per page. `nextCursor` is null on the last page. */
export type Page<T> = { items: T[]; nextCursor: string | null };

export type RewardReason = 'bienvenida' | 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre' | 'urgente' | 'canje';

/** `amount` is signed: +5 for a reward, −5 for a spend. */
export type Movement = {
  id: Id;
  reason: RewardReason;
  amount: number;
  createdAt: string;
  status: 'confirmed' | 'pending' | 'error';
  txHash: string | null;
  explorerUrl: string | null;
};

/** `balance` counts confirmed movements only (the chain is the source of truth). */
export type Wallet = {
  status: 'preparing' | 'ready' | 'error';
  address: string | null;
  balance: number | null;
};

export type ContentKind = 'sign' | 'question' | 'answer';
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
