// The contract every adapter implements (mock now, Supabase in SPEC 02).
// Screens never use it directly: they use the hooks exported from src/data.
// Every method returns a Promise and rejects only with DataError.
// Methods that change data reject with "unauthenticated" for guests.
import type {
  Answer,
  City,
  Comment,
  ContactState,
  ContentKind,
  Id,
  Movement,
  NoticePage,
  Page,
  Question,
  ReportKind,
  ReportReason,
  RewardCap,
  Session,
  Sign,
  Tag,
  Wallet,
} from './types';

export type ListQuery = {
  city: City;
  search?: string;
  /** Any of these tags (OR). */
  tags?: Tag[];
  cursor?: string | null;
};

export type ProfileInput = { fullName: string; city: City; zone: string };

export type NewSign = {
  title: string;
  /** 1280 px on the longest side, JPEG 0.8. Compressed by the screen (wiki #34). */
  photo: Blob;
  /** 480 px thumbnail for the Hoy grid (wiki #142). */
  thumb: Blob;
  price?: string;
  /** Defaults to the user's zone. The letrero always goes to the profile's city (wiki #167). */
  zone?: string;
  tags?: Tag[];
  mapsUrl?: string;
};

export type NewQuestion = {
  text: string;
  photo?: Blob;
  urgent: boolean;
  zone?: string;
  tags?: Tag[];
};

export type SavedItems = { signs: Sign[]; questions: Question[]; answers: Answer[] };

/** The 4 switches of Ajustes › Notificaciones (wiki #204). They filter the push, not the bell; on by default. */
export type NotifPrefs = { answers: boolean; helpful: boolean; contacts: boolean; urgent: boolean };

export const DEFAULT_NOTIF_PREFS: NotifPrefs = { answers: true, helpful: true, contacts: true, urgent: true };

/** A browser push subscription, as `PushSubscription.toJSON()` gives it. */
export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

export interface DataApi {
  auth: {
    getSession(): Promise<Session>;
    signInWithGoogle(): Promise<Session>;
    /**
     * One «Entrar» for both cases: a new e-mail creates the account, a known one signs in.
     * Rejects with `wrong_password` (known e-mail, other password) or `google_account` (the e-mail
     * enters with Google).
     */
    signInWithEmail(email: string, password: string): Promise<Session>;
    /** Sends the recovery e-mail. Resolves the same for any address, so it reveals nothing. */
    requestPasswordReset(email: string): Promise<void>;
    /** True when this page was opened from a recovery link (the mock: after a reset request). */
    recoveryReady(): Promise<boolean>;
    /** Sets the new password of the recovery session and returns the signed-in session. */
    updatePassword(password: string): Promise<Session>;
    signOut(): Promise<Session>;
    saveProfile(input: ProfileInput): Promise<Session>;
  };
  signs: {
    list(query: ListQuery): Promise<Page<Sign>>;
    get(id: Id): Promise<Sign>;
    /** Publishes even past 10 per day; then `rewarded` is false (wiki rule, not an error). */
    create(input: NewSign): Promise<{ sign: Sign; rewarded: boolean }>;
    /** `rewardCap` says why a «Me sirvió» paid nothing (null when it pays, or for «No me sirvió»). */
    vote(id: Id, value: 'helpful' | 'not_helpful'): Promise<{ sign: Sign; rewardCap: RewardCap | null }>;
    remove(id: Id): Promise<void>;
  };
  questions: {
    list(query: ListQuery): Promise<Page<Question>>;
    get(id: Id): Promise<{ question: Question; answers: Answer[] }>;
    /** Up to 3 questions similar to the text being typed. */
    similar(text: string): Promise<Question[]>;
    /** `urgentCharged` is false when the −5 charge failed and the question was published as normal. */
    create(input: NewQuestion): Promise<{ question: Question; urgentCharged: boolean }>;
    remove(id: Id): Promise<void>;
    closeWithoutSolution(id: Id): Promise<Question>;
  };
  answers: {
    create(questionId: Id, text: string): Promise<Answer>;
    /** `rewardCap` says why the helper got no +5 (null when it pays). */
    markHelpful(id: Id): Promise<{ answer: Answer; rewardCap: RewardCap | null }>;
    markNotHelpful(id: Id): Promise<Answer>;
    remove(id: Id): Promise<void>;
  };
  comments: {
    /** Up to 500 characters, on any visible answer (also on Solucionada and Cerrada questions). */
    create(answerId: Id, text: string): Promise<Comment>;
    /** Only one's own. */
    remove(id: Id): Promise<void>;
  };
  contact: {
    /** Only the asker, on someone else's answer to their question; once per answer. The phone is optional. */
    request(answerId: Id, phone?: string): Promise<ContactState>;
    /** Only the person asked, while pending: «Aceptar» (with an optional phone) or «Ahora no». */
    respond(requestId: Id, accept: boolean, phone?: string): Promise<ContactState>;
    /** The phone saved in the caller's profile, to prefill the field. */
    myPhone(): Promise<string | null>;
    /**
     * Ajustes › Mi celular (SPEC 23, wiki #215): saves the caller's phone; null or blank deletes it. Resolves to what
     * was saved. Rejects with `validation` (field `phone`) when it does not look like a phone.
     */
    setMyPhone(phone: string | null): Promise<string | null>;
  };
  live: {
    /**
     * Calls `onChange` when a comment, answer, rating or contact request that may belong to the question changes
     * (`answerId` when the event only names the answer). `onStatus` says whether the channel is connected.
     * Returns the unsubscribe. The mock never connects, so the screen keeps its 15 s refresh.
     */
    question(questionId: Id, onChange: (answerId: Id | null) => void, onStatus?: (connected: boolean) => void): () => void;
    /** Calls `onChange` when one of my notifications is inserted or updated (SPEC 22). The mock never connects. */
    notices(onChange: () => void, onStatus?: (connected: boolean) => void): () => void;
  };
  saved: {
    /** Returns whether the item is saved after the toggle. */
    toggle(kind: ContentKind, id: Id): Promise<boolean>;
    list(): Promise<SavedItems>;
  };
  reports: {
    /** Counts toward the 3 reports that hide it for everyone, and hides it for the reporter now (wiki #166). */
    report(kind: ReportKind, id: Id, reason: ReportReason): Promise<void>;
    hideForMe(kind: ReportKind, id: Id): Promise<void>;
  };
  wallet: {
    get(): Promise<Wallet>;
    movements(query?: { cursor?: string | null }): Promise<Page<Movement>>;
    retry(movementId: Id): Promise<Movement>;
  };
  activity: {
    myQuestions(): Promise<Question[]>;
    myAnswers(): Promise<Answer[]>;
    mySigns(): Promise<Sign[]>;
  };
  /** Avisos (SPEC 22, wiki #214): the caller's notices, already built. */
  notices: {
    /** 30 per page, newest first. «Me sirvió» of the same letrero come as one notice. */
    list(offset?: number): Promise<NoticePage>;
    /** Notices with something unread (a group counts once). */
    unreadCount(): Promise<number>;
    /** Marks that notice; for a grouped `sign_helpful`, the whole group. */
    markRead(id: Id): Promise<void>;
    markAllRead(): Promise<void>;
  };
  /** Push notifications (SPEC 15). The preferences belong to the account; a subscription to this device. */
  push: {
    getPrefs(): Promise<NotifPrefs>;
    setPrefs(prefs: NotifPrefs): Promise<NotifPrefs>;
    /** Saves this device for the signed-in person; an endpoint used by another account moves to this one (#207). */
    saveSubscription(subscription: PushSubscriptionInput): Promise<void>;
    /** Forgets this device for the signed-in person (Cerrar sesión). */
    deleteSubscription(endpoint: string): Promise<void>;
  };
}
