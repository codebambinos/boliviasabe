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

/** A comment in the public thread under an answer (one level, up to 500 characters). */
export type Comment = {
  id: Id;
  answerId: Id;
  text: string;
  author: Author;
  createdAt: string;
  isMine: boolean;
  inReview: boolean;
};

/** What each person shares when a contact request is accepted: the account e-mail and, if given, a phone (wiki #182). */
export type ContactDetails = { email: string; phone: string | null };

/** «Pedir contacto» on one answer. Only the asker and the answerer receive it; null for everyone else. */
export type ContactState = {
  requestId: Id;
  status: 'pending' | 'accepted' | 'declined';
  requestedByMe: boolean;
  /** The other person's details, only once accepted. */
  other: ContactDetails | null;
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
  /** The visible thread, oldest first. */
  comments: Comment[];
  contact: ContactState | null;
};

/** 30 items per page. `nextCursor` is null on the last page. */
export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Why a «Me sirvió» or a letrero was saved without yapitas (wiki reglas-finales › Antiabuso, #188-189): 10 letreros a
 * day, the first 3 «Me sirvió» of a question, 3 rewards a day between the same two people.
 */
export type RewardCap = 'signs_per_day' | 'answers_per_question' | 'pair_per_day';

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
  /** A redemption with a partner (SPEC 29): `paid` for the neighbor, `received` for the partner. */
  redemption?: { id: Id; partnerName: string; side: 'paid' | 'received' };
};

/** An active offer of a partner business in the caller's city (SPEC 29). The caller's own offers never come. */
export type Offer = {
  id: Id;
  title: string;
  /** In yapitas. */
  cost: number;
  partner: { name: string; city: string; zone: string };
  /** The caller already redeemed it since the Bolivian midnight (1 per offer per day). */
  redeemedToday: boolean;
};

/** A confirmed redemption: the receipt shown at the counter, for the neighbor (`paid`) or the partner (`received`). */
export type Redemption = {
  id: Id;
  offerTitle: string;
  partnerName: string;
  partnerZone: string;
  cost: number;
  createdAt: string;
  txHash: string;
  side: 'paid' | 'received';
};

/** The own Pollar wallet (SPEC 31). `invited` false hides everything; `address` null means not linked yet. */
export type OwnWalletStatus = {
  invited: boolean;
  network: 'testnet' | 'mainnet';
  /** The YAPITA issuer of that network. */
  issuer: string | null;
  address: string | null;
  /** YAPITA read from Horizon of that network; null while unknown or without a wallet. */
  balance: number | null;
};

/** A mainnet redemption ready to be signed with Pollar. */
export type OwnRedeemStart = { redemptionId: Id; destination: string; amount: string; memo: string; issuer: string };

/** `balance` counts confirmed movements only (the chain is the source of truth). */
export type Wallet = {
  status: 'preparing' | 'ready' | 'error';
  address: string | null;
  balance: number | null;
};

export type ContentKind = 'sign' | 'question' | 'answer';
/** What can be reported or hidden: any content, plus comments (which cannot be saved). */
export type ReportKind = ContentKind | 'comment';
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** The 8 kinds of notice (wiki › flujo-final › 3 · Yo › Avisos, #202, #208). */
export type NoticeKind =
  | 'answer'
  | 'comment'
  | 'helpful'
  | 'sign_helpful'
  | 'contact_request'
  | 'contact_accepted'
  | 'urgent'
  | 'reminder';

/** One row of Avisos, already built (SPEC 22, wiki #214). «Me sirvió» of the same letrero come as one notice. */
export type Notice = {
  /** The newest row of the notice; what `markRead` takes. */
  id: Id;
  kind: NoticeKind;
  /** The newest row's date (ISO). */
  createdAt: string;
  /** False while any row of the notice is unread. */
  read: boolean;
  /** Who caused it (the newest in a group). Null on `reminder`. */
  actor: string | null;
  /** How many «Me sirvió» are in the group. 1 for every other kind. */
  count: number;
  /** The piece of text: the answer, the comment, the letrero's title or the question. Null when it is gone. */
  text: string | null;
  /** Only `urgent`: the question's zone. */
  zone: string | null;
  /** Where it opens: `/p/:id` or `/l/:id`. Null = «Esto ya no está disponible» (deleted, hidden by me or in review). */
  open: { kind: 'question' | 'sign'; id: Id } | null;
  /** `contact_request` and `contact_accepted`: the same state as the thread (Aceptar / Ahora no, or the contact). */
  contact: ContactState | null;
};

/** 30 notices per page, newest first. `nextOffset` is null on the last page. */
export type NoticePage = { items: Notice[]; nextOffset: number | null };
