// In-memory state of the mock adapter, built from the fixtures. Resets on every page load.
import type { Id } from '../types';
import * as seed from './fixtures';
import type {
  AnswerRec,
  CommentRec,
  ContactRec,
  ContentRef,
  MovementRec,
  NoticeRec,
  OfferRec,
  PartnerRec,
  QuestionRec,
  RedemptionRec,
  ReportRec,
  SignRec,
  SignVoteRec,
  UserRec,
} from './fixtures';

type Counter = 'user' | 'sign' | 'question' | 'answer' | 'comment' | 'contact' | 'movement' | 'redemption';

export type MockStore = {
  /** null = guest. */
  session: {
    userId: Id | null;
    /** Set by requestPasswordReset, as if the neighbor had opened the e-mail link (SPEC 07). */
    recoveryUserId: Id | null;
  };
  users: UserRec[];
  signs: SignRec[];
  signVotes: SignVoteRec[];
  questions: QuestionRec[];
  answers: AnswerRec[];
  comments: CommentRec[];
  contacts: ContactRec[];
  movements: MovementRec[];
  partners: PartnerRec[];
  offers: OfferRec[];
  redemptions: RedemptionRec[];
  notices: NoticeRec[];
  saved: ContentRef[];
  reports: ReportRec[];
  hidden: ContentRef[];
  counters: Record<Counter, number>;
};

const copy = <T extends object>(rows: T[]): T[] => rows.map((row) => ({ ...row }));
const maxId = (rows: { id: Id }[]) => rows.reduce((max, row) => Math.max(max, row.id), 0);

function createStore(): MockStore {
  return {
    session: { userId: null, recoveryUserId: null },
    users: copy(seed.users),
    signs: copy(seed.signs),
    signVotes: copy(seed.signVotes),
    questions: copy(seed.questions),
    answers: copy(seed.answers),
    comments: copy(seed.comments),
    contacts: copy(seed.contacts),
    movements: copy(seed.movements),
    partners: copy(seed.partners),
    offers: copy(seed.offers),
    redemptions: copy(seed.redemptions),
    notices: copy(seed.notices),
    saved: copy(seed.saved),
    reports: copy(seed.reports),
    hidden: copy(seed.hidden),
    counters: {
      user: maxId(seed.users),
      sign: maxId(seed.signs),
      question: maxId(seed.questions),
      answer: maxId(seed.answers),
      comment: maxId(seed.comments),
      contact: maxId(seed.contacts),
      movement: maxId(seed.movements),
      redemption: maxId(seed.redemptions),
    },
  };
}

export const store: MockStore = createStore();

export function nextId(counter: Counter): Id {
  store.counters[counter] += 1;
  return store.counters[counter];
}
