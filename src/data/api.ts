// The contract every adapter implements (mock now, Supabase in SPEC 02).
// Screens never use it directly: they use the hooks exported from src/data.
// Every method returns a Promise and rejects only with DataError.
// Methods that change data reject with "unauthenticated" for guests.
import type {
  Answer,
  City,
  ContentKind,
  Id,
  Movement,
  Page,
  Question,
  ReportReason,
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
  /** Defaults to the user's zone. Required while the profile is pending. */
  zone?: string;
  /** Only while the profile is pending (no «Tu barrio» yet). The profile's city wins (wiki #167). */
  city?: City;
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

export interface DataApi {
  auth: {
    getSession(): Promise<Session>;
    signInWithGoogle(): Promise<Session>;
    signInWithEmail(email: string, password: string): Promise<Session>;
    signOut(): Promise<Session>;
    saveProfile(input: ProfileInput): Promise<Session>;
  };
  signs: {
    list(query: ListQuery): Promise<Page<Sign>>;
    get(id: Id): Promise<Sign>;
    /** Publishes even past 10 per day; then `rewarded` is false (wiki rule, not an error). */
    create(input: NewSign): Promise<{ sign: Sign; rewarded: boolean }>;
    vote(id: Id, value: 'helpful' | 'not_helpful'): Promise<Sign>;
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
    markHelpful(id: Id): Promise<Answer>;
    markNotHelpful(id: Id): Promise<Answer>;
    remove(id: Id): Promise<void>;
  };
  saved: {
    /** Returns whether the item is saved after the toggle. */
    toggle(kind: ContentKind, id: Id): Promise<boolean>;
    list(): Promise<SavedItems>;
  };
  reports: {
    /** Counts toward the 3 reports that hide it for everyone, and hides it for the reporter now (wiki #166). */
    report(kind: ContentKind, id: Id, reason: ReportReason): Promise<void>;
    hideForMe(kind: ContentKind, id: Id): Promise<void>;
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
}
