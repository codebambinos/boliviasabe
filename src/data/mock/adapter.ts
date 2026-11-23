// Mock implementation of DataApi: in-memory, with fake latency and the wiki rules.
import { DEFAULT_NOTIF_PREFS, type DataApi } from '../api';
import { CITIES, DEFAULT_CITY, PAGE_SIZE } from '../catalog';
import { DataError } from '../errors';
import { cleanPhone } from '../phone';
import type { Answer, City, Comment, ContactState, ContentKind, Id, Movement, Notice, Offer, Page, Question, Redemption, ReportKind, Session, Sign } from '../types';
import { mockMode, simulate } from './behavior';
import { LUCIA, fakeAddress, fakeTxHash, type AnswerRec, type CommentRec, type ContactRec, type MovementRec, type NoticeRec, type QuestionRec, type RedemptionRec, type SignRec } from './fixtures';
import {
  assertCanAsk,
  assertCanComment,
  authorOf,
  confirmedBalance,
  currentUserId,
  isHiddenFor,
  isInReview,
  normalize,
  pairCanBeRewarded,
  requireProfile,
  requireUser,
  signsCreatedToday,
  MAX_REWARDED_ANSWERS_PER_QUESTION,
  MAX_REWARDED_SIGNS_PER_DAY,
  URGENT_COST,
  URGENT_HOURS,
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
    thumbUrl: rec.thumbUrl ?? rec.photoUrl,
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

  /**
   * Known e-mail with its password → that user. Known e-mail, other password → `wrong_password`.
   * A Google account → `google_account`. New e-mail → new user without profile («Tu barrio» pending).
   */
  signInWithEmail: (email, password) =>
    simulate(() => {
      const clean = email.trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
      if (password.length < 6) throw new DataError('validation', 'Password needs at least 6 characters', { field: 'password' });
      let user = store.users.find((u) => u.email === clean);
      if (user?.provider === 'google') throw new DataError('google_account', 'This account enters with Google');
      if (user && user.password !== password) throw new DataError('wrong_password', 'Wrong password');
      if (!user) {
        user = { id: nextId('user'), email: clean, provider: 'password', password, fullName: null, city: null, zone: null, walletStatus: 'preparing', address: null };
        store.users.push(user);
      }
      store.session.userId = user.id;
      return sessionOf();
    }),

  /** Resolves for any address. A known password account is marked as «opened the link». */
  requestPasswordReset: (email) =>
    simulate(() => {
      const clean = email.trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
      const user = store.users.find((u) => u.email === clean);
      store.session.recoveryUserId = user?.provider === 'password' ? user.id : null;
    }),

  recoveryReady: () => simulate(() => store.session.recoveryUserId !== null),

  updatePassword: (password) =>
    simulate(() => {
      if (password.length < 6) throw new DataError('validation', 'Password needs at least 6 characters', { field: 'password' });
      const userId = store.session.recoveryUserId;
      const user = store.users.find((u) => u.id === userId);
      if (!user) throw new DataError('unauthenticated', 'The recovery link is not valid');
      user.password = password;
      store.session.recoveryUserId = null;
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

/** Words every question has: they never make two questions «parecidas». Same list as migration 0011. */
const STOPWORDS = new Set(
  (
    'alguien alguna alguno algunos algunas algun algo sabe saben sabes saber donde adonde cuanto cuanta cuantos cuantas ' +
    'como cual cuales cuando quien quienes para porque pero esta este esto estos estas estan hace hacen tiene tienen ' +
    'tengo puedo puede pueden podria quiero necesito busco buscando vende venden conseguir consigo encuentro encontrar ' +
    'comprar conoce conocen recomienda recomiendan recomiendo favor gracias hola buenas buenos dias tardes noches aqui ' +
    'alli ahora todo toda todos todas desde hasta entre sobre cerca mucho mucha muchos poco otro otra otros otras ' +
    'mismo misma tambien solo ayuda ayudar informacion'
  ).split(' '),
);

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
      // Without «Tu barrio» (T16) nothing is published (wiki #167): the letrero goes to the profile's city and zone
      const user = requireProfile();
      const zone = input.zone?.trim() || user.zone;
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
        thumbUrl: input.thumb instanceof Blob ? URL.createObjectURL(input.thumb) : undefined,
        price: input.price?.trim() || null,
        city: user.city,
        zone,
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
      const rewardCap = value === 'helpful' && !pairCanBeRewarded(user.id, rec.authorId) ? 'pair_per_day' : null;
      if (value === 'helpful' && !rewardCap) addMovement(rec.authorId, 'sirvio-l', 1, user.id);
      return { sign: toSign(rec), rewardCap };
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

// ---------- questions and answers ----------

const isUrgentActive = (q: QuestionRec) => q.urgentUntil !== null && Date.parse(q.urgentUntil) > Date.now();

export function toQuestion(rec: QuestionRec): Question {
  const viewer = currentUserId();
  return {
    id: rec.id,
    text: rec.text,
    photoUrl: rec.photoUrl,
    city: rec.city,
    zone: rec.zone,
    tags: [...rec.tags],
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    urgentUntil: isUrgentActive(rec) ? rec.urgentUntil : null,
    status: rec.status,
    answerCount: store.answers.filter((a) => a.questionId === rec.id).length,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'question' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('question', rec.id),
  };
}

export function toAnswer(rec: AnswerRec): Answer {
  const viewer = currentUserId();
  return {
    id: rec.id,
    questionId: rec.questionId,
    text: rec.text,
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    helpful: rec.helpful,
    notHelpful: rec.notHelpful,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'answer' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('answer', rec.id),
    comments: store.comments
      .filter((c) => c.answerId === rec.id && !isHiddenFor(viewer, 'comment', c.id, c.authorId))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id)
      .map(toComment),
    contact: contactOf(rec.id),
  };
}

export function toComment(rec: CommentRec): Comment {
  const viewer = currentUserId();
  return {
    id: rec.id,
    answerId: rec.answerId,
    text: rec.text,
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    isMine: rec.authorId === viewer,
    inReview: isInReview('comment', rec.id),
  };
}

/** The viewer's «Pedir contacto» on an answer: only the two people see it, and the details only once accepted. */
function contactOf(answerId: Id): ContactState | null {
  const viewer = currentUserId();
  if (viewer === null) return null;
  const rec = store.contacts.find((c) => c.answerId === answerId && (c.requesterId === viewer || c.ownerId === viewer));
  if (!rec) return null;
  const mine = rec.requesterId === viewer;
  const other = store.users.find((u) => u.id === (mine ? rec.ownerId : rec.requesterId));
  return {
    requestId: rec.id,
    status: rec.status,
    requestedByMe: mine,
    other: rec.status === 'accepted' && other ? { email: other.email, phone: mine ? rec.ownerPhone : rec.requesterPhone } : null,
  };
}

export function findVisibleQuestion(id: Id): QuestionRec {
  const rec = store.questions.find((q) => q.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'question', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This question is no longer available');
  }
  return rec;
}

export function findVisibleAnswer(id: Id): AnswerRec {
  const rec = store.answers.find((a) => a.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'answer', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This answer is no longer available');
  }
  return rec;
}

/** Wiki order: active urgent → your zone → rest of the city → solved and closed. Newest first inside each group. */
function questionGroup(q: QuestionRec, myZone: string | null): number {
  if (q.status !== 'open') return 3;
  if (isUrgentActive(q)) return 0;
  if (myZone && normalize(q.zone) === myZone) return 1;
  return 2;
}

function viewerZone(city: City): string | null {
  const session = sessionOf();
  if (session.status !== 'signed-in' || !session.profile || session.profile.city !== city) return null;
  return normalize(session.profile.zone);
}

export const mockQuestions: DataApi['questions'] = {
  list: ({ city, search, tags, cursor }) =>
    simulate(() => {
      const viewer = currentUserId();
      const myZone = viewerZone(city);
      const items = store.questions
        .filter((q) => q.city === city)
        .filter((q) => !isHiddenFor(viewer, 'question', q.id, q.authorId))
        .filter((q) => matchesSearch(q.text, search))
        .filter((q) => !tags?.length || q.tags.some((t) => tags.includes(t)))
        .sort((a, b) => questionGroup(a, myZone) - questionGroup(b, myZone) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(toQuestion);
      return paginate(items, cursor);
    }),

  get: (id) =>
    simulate(() => {
      const viewer = currentUserId();
      const question = findVisibleQuestion(id);
      const answers = store.answers
        .filter((a) => a.questionId === id && !isHiddenFor(viewer, 'answer', a.id, a.authorId))
        .sort((a, b) => Number(b.helpful) - Number(a.helpful) || Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map(toAnswer);
      return { question: toQuestion(question), answers };
    }),

  /** «Preguntas parecidas»: from 3 typed words, up to 3 questions sharing words of 4+ letters, minus the ones every
   * question has (migration 0011). */
  similar: (text) =>
    simulate(() => {
      const words = normalize(text).split(/\s+/).filter(Boolean);
      if (words.length < 3) return [];
      const keywords = [...new Set(words.map((w) => w.replace(/[^a-z0-9ñ]/g, '')))].filter((w) => w.length >= 4 && !STOPWORDS.has(w));
      const session = sessionOf();
      const city = session.status === 'signed-in' && session.profile ? session.profile.city : DEFAULT_CITY;
      const viewer = currentUserId();
      return store.questions
        .filter((q) => q.city === city && !isHiddenFor(viewer, 'question', q.id, q.authorId))
        .map((q) => ({ q, score: keywords.filter((k) => normalize(q.text).includes(k)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => toQuestion(x.q));
    }),

  create: (input) =>
    simulate(() => {
      const user = requireProfile();
      const text = validateLength('text', input.text, 3, 300);
      const tags = validateTags(input.tags);
      assertCanAsk(user.id, input.urgent);
      // With ?mock=stellar-error the −5 charge fails: the question is published as normal (wiki rule).
      const urgentCharged = input.urgent && mockMode !== 'stellar-error';
      const rec: QuestionRec = {
        id: nextId('question'),
        authorId: user.id,
        text,
        photoUrl: input.photo instanceof Blob ? URL.createObjectURL(input.photo) : null,
        city: user.city,
        zone: input.zone?.trim() || user.zone,
        tags,
        createdAt: new Date().toISOString(),
        urgentUntil: urgentCharged ? new Date(Date.now() + URGENT_HOURS * 3600 * 1000).toISOString() : null,
        status: 'open',
        closureRewarded: false,
      };
      store.questions.push(rec);
      if (urgentCharged) addMovement(user.id, 'urgente', -URGENT_COST, null);
      return { question: toQuestion(rec), urgentCharged };
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleQuestion(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own question');
      if (store.answers.some((a) => a.questionId === id)) {
        throw new DataError('forbidden', 'A question with answers cannot be deleted');
      }
      store.questions = store.questions.filter((q) => q.id !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'question' && s.itemId === id));
    }),

  /** «Ninguna me sirvió»: closes an open question that has answers, +1 once. */
  closeWithoutSolution: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleQuestion(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can close the question');
      if (rec.status !== 'open') throw new DataError('forbidden', 'The question is already closed');
      if (!store.answers.some((a) => a.questionId === id)) {
        throw new DataError('forbidden', 'A question without answers is deleted, not closed');
      }
      rec.status = 'closed';
      if (!rec.closureRewarded) {
        rec.closureRewarded = true;
        addMovement(user.id, 'cierre', 1, null);
      }
      return toQuestion(rec);
    }),
};

export const mockAnswers: DataApi['answers'] = {
  create: (questionId, text) =>
    simulate(() => {
      const user = requireProfile();
      const question = findVisibleQuestion(questionId);
      if (question.authorId === user.id) throw new DataError('forbidden', 'You cannot answer your own question');
      if (question.status !== 'open') throw new DataError('forbidden', 'The question no longer accepts answers');
      if (store.answers.some((a) => a.questionId === questionId && a.authorId === user.id)) {
        throw new DataError('forbidden', 'You already answered this question');
      }
      const rec: AnswerRec = {
        id: nextId('answer'),
        questionId,
        authorId: user.id,
        text: validateLength('text', text, 1, 1000),
        createdAt: new Date().toISOString(),
        helpful: false,
        notHelpful: false,
      };
      store.answers.push(rec);
      return toAnswer(rec);
    }),

  /** Only the asker. +5 to the helper (max 3 rewarded per question); the first one solves the question (+1 once). */
  markHelpful: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      const question = findVisibleQuestion(answer.questionId);
      if (question.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can mark «Me sirvió»');
      if (answer.helpful) return { answer: toAnswer(answer), rewardCap: null };
      const alreadyRewarded = store.answers.filter((a) => a.questionId === question.id && a.helpful).length;
      answer.helpful = true;
      answer.notHelpful = false;
      const rewardCap =
        alreadyRewarded >= MAX_REWARDED_ANSWERS_PER_QUESTION
          ? ('answers_per_question' as const)
          : !pairCanBeRewarded(user.id, answer.authorId)
            ? ('pair_per_day' as const)
            : null;
      if (!rewardCap) addMovement(answer.authorId, 'ayuda', 5, user.id);
      if (question.status !== 'solved') {
        question.status = 'solved';
        if (!question.closureRewarded) {
          question.closureRewarded = true;
          addMovement(user.id, 'cierre', 1, null);
        }
      }
      return { answer: toAnswer(answer), rewardCap };
    }),

  markNotHelpful: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      const question = findVisibleQuestion(answer.questionId);
      if (question.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can rate answers');
      if (answer.helpful) throw new DataError('forbidden', '«Me sirvió» is final');
      answer.notHelpful = true;
      return toAnswer(answer);
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      if (answer.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own answer');
      if (answer.helpful) throw new DataError('forbidden', 'An answer marked «Me sirvió» cannot be deleted');
      store.answers = store.answers.filter((a) => a.id !== id);
      store.comments = store.comments.filter((c) => c.answerId !== id); // goes with its thread (wiki #82)
      store.contacts = store.contacts.filter((c) => c.answerId !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'answer' && s.itemId === id));
    }),
};

// ---------- saved, reports, wallet, activity ----------

const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';

/** Author of any visible content item (not_found if deleted or hidden for the viewer). */
function contentAuthor(kind: ReportKind, id: Id): Id {
  if (kind === 'sign') return findVisibleSign(id).authorId;
  if (kind === 'question') return findVisibleQuestion(id).authorId;
  if (kind === 'comment') return findVisibleComment(id).authorId;
  return findVisibleAnswer(id).authorId;
}

function findVisibleComment(id: Id): CommentRec {
  const rec = store.comments.find((c) => c.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'comment', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This comment is no longer available');
  }
  return rec;
}

export const mockComments: DataApi['comments'] = {
  create: (answerId, text) =>
    simulate(() => {
      const user = requireProfile();
      findVisibleAnswer(answerId);
      assertCanComment(user.id);
      const rec: CommentRec = {
        id: nextId('comment'),
        answerId,
        authorId: user.id,
        text: validateLength('text', text, 1, 500),
        createdAt: new Date().toISOString(),
      };
      store.comments.push(rec);
      return toComment(rec);
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleComment(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own comment');
      store.comments = store.comments.filter((c) => c.id !== id);
    }),
};

export const mockContact: DataApi['contact'] = {
  request: (answerId, phone) =>
    simulate(() => {
      const user = requireProfile();
      const answer = findVisibleAnswer(answerId);
      const question = findVisibleQuestion(answer.questionId);
      if (question.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can ask for a contact');
      if (answer.authorId === user.id) throw new DataError('forbidden', 'Not on your own answer');
      const cleaned = cleanPhone(phone);
      const existing = store.contacts.find((c) => c.answerId === answerId && c.requesterId === user.id);
      if (existing?.status === 'declined') throw new DataError('forbidden', 'They chose not to share their contact');
      if (!existing) {
        const rec: ContactRec = {
          id: nextId('contact'),
          answerId,
          requesterId: user.id,
          ownerId: answer.authorId,
          status: 'pending',
          requesterPhone: cleaned,
          ownerPhone: null,
        };
        store.contacts.push(rec);
        if (cleaned) user.phone = cleaned;
      }
      return contactOf(answerId) as ContactState;
    }),

  respond: (requestId, accept, phone) =>
    simulate(() => {
      const user = requireUser();
      const rec = store.contacts.find((c) => c.id === requestId && (c.ownerId === user.id || c.requesterId === user.id));
      if (!rec) throw new DataError('not_found', 'This request is no longer available');
      if (rec.ownerId !== user.id) throw new DataError('forbidden', 'Only the person asked can answer');
      if (rec.status === 'pending') {
        const cleaned = accept ? cleanPhone(phone) : null;
        rec.status = accept ? 'accepted' : 'declined';
        rec.ownerPhone = cleaned;
        if (cleaned) user.phone = cleaned;
      }
      return contactOf(rec.answerId) as ContactState;
    }),

  myPhone: () => simulate(() => requireUser().phone ?? null),

  setMyPhone: (phone) =>
    simulate(() => {
      const user = requireUser();
      user.phone = cleanPhone(phone);
      return user.phone;
    }),
};

/** The mock has no other devices: the channel never connects and the screen keeps its 15 s refresh. */
export const mockLive: DataApi['live'] = {
  question: (_questionId, _onChange, onStatus) => {
    onStatus?.(false);
    return () => undefined;
  },
  notices: (_onChange, onStatus) => {
    onStatus?.(false);
    return () => undefined;
  },
};

function toMovement(rec: MovementRec): Movement {
  return {
    id: rec.id,
    reason: rec.reason,
    amount: rec.amount,
    createdAt: rec.createdAt,
    status: rec.status,
    txHash: rec.txHash,
    explorerUrl: rec.txHash ? EXPLORER_TX + rec.txHash : null,
    ...(rec.redemptionId !== undefined ? { redemption: redemptionRef(rec) } : {}),
  };
}

function redemptionRef(rec: MovementRec): NonNullable<Movement['redemption']> {
  const redemption = store.redemptions.find((r) => r.id === rec.redemptionId);
  const partner = store.partners.find((p) => p.id === redemption?.partnerId);
  return { id: rec.redemptionId as Id, partnerName: partner?.name ?? '', side: rec.amount < 0 ? 'paid' : 'received' };
}

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export const mockSaved: DataApi['saved'] = {
  toggle: (kind, id) =>
    simulate(() => {
      const user = requireUser();
      contentAuthor(kind, id);
      const index = store.saved.findIndex((s) => s.userId === user.id && s.kind === kind && s.itemId === id);
      if (index >= 0) {
        store.saved.splice(index, 1);
        return false;
      }
      store.saved.push({ userId: user.id, kind, itemId: id });
      return true;
    }),

  /** Saved items that still exist and are visible, most recently saved first. */
  list: () =>
    simulate(() => {
      const user = requireUser();
      const refs = store.saved.filter((s) => s.userId === user.id).reverse();
      const visible = <T>(kind: ContentKind, find: (id: Id) => T) =>
        refs.filter((r) => r.kind === kind).flatMap((r) => {
          try {
            return [find(r.itemId)];
          } catch {
            return [];
          }
        });
      return {
        signs: visible('sign', (id) => toSign(findVisibleSign(id))),
        questions: visible('question', (id) => toQuestion(findVisibleQuestion(id))),
        answers: visible('answer', (id) => toAnswer(findVisibleAnswer(id))),
      };
    }),
};

export const mockReports: DataApi['reports'] = {
  /** One report per person; 3 different people hide it for everyone but its author.
   * The reporter stops seeing it right away (wiki #166). */
  report: (kind, id, reason) =>
    simulate(() => {
      const user = requireUser();
      if (contentAuthor(kind, id) === user.id) throw new DataError('forbidden', 'You cannot report your own content');
      if (!store.reports.some((r) => r.userId === user.id && r.kind === kind && r.itemId === id)) {
        store.reports.push({ userId: user.id, kind, itemId: id, reason });
      }
      if (!store.hidden.some((h) => h.userId === user.id && h.kind === kind && h.itemId === id)) {
        store.hidden.push({ userId: user.id, kind, itemId: id });
      }
    }),

  /** «Ya no quiero ver esto»: hidden for this user only; not a report. */
  hideForMe: (kind, id) =>
    simulate(() => {
      const user = requireUser();
      contentAuthor(kind, id);
      if (!store.hidden.some((h) => h.userId === user.id && h.kind === kind && h.itemId === id)) {
        store.hidden.push({ userId: user.id, kind, itemId: id });
      }
    }),
};

export const mockWallet: DataApi['wallet'] = {
  get: () =>
    simulate(() => {
      const user = requireUser();
      const ready = user.walletStatus === 'ready';
      return { status: user.walletStatus, address: user.address, balance: ready ? confirmedBalance(user.id) : null };
    }),

  movements: (query) =>
    simulate(() => {
      const user = requireUser();
      const items = store.movements.filter((m) => m.userId === user.id).sort(newestFirst).map(toMovement);
      return paginate(items, query?.cursor);
    }),

  /** «Reintentar» on a failed movement: pending again, then confirmed. */
  retry: (movementId) =>
    simulate(() => {
      const user = requireUser();
      const rec = store.movements.find((m) => m.id === movementId && m.userId === user.id);
      if (!rec) throw new DataError('not_found', 'Movement not found');
      if (rec.status !== 'error') return toMovement(rec);
      rec.status = 'pending';
      settle(rec, 'confirmed');
      return toMovement(rec);
    }),
};

/** Start of the Bolivian day (UTC−4 all year), as in SQL `bolivia_day_start`. */
function boliviaDayStart(now = Date.now()): number {
  const day = 24 * 3600 * 1000;
  const offset = 4 * 3600 * 1000;
  return Math.floor((now - offset) / day) * day + offset;
}

function toReceipt(rec: RedemptionRec, viewerId: Id): Redemption {
  const offer = store.offers.find((o) => o.id === rec.offerId);
  const partner = store.partners.find((p) => p.id === rec.partnerId);
  return {
    id: rec.id,
    offerTitle: offer?.title ?? '',
    partnerName: partner?.name ?? '',
    partnerZone: partner?.zone ?? '',
    cost: rec.cost,
    createdAt: rec.createdAt,
    txHash: rec.txHash,
    side: rec.userId === viewerId ? 'paid' : 'received',
  };
}

const redeemedToday = (userId: Id, offerId: Id) =>
  store.redemptions.some((r) => r.userId === userId && r.offerId === offerId && Date.parse(r.createdAt) >= boliviaDayStart());

/** SPEC 29 on the mock: all or nothing, paid at once (no pending). `?mock=stellar-error` makes it fail. */
export const mockRedemptions: DataApi['redemptions'] = {
  offers: () =>
    simulate(() => {
      const user = requireUser();
      return store.offers
        .filter((o) => o.active)
        .flatMap((o): Offer[] => {
          const partner = store.partners.find((p) => p.id === o.partnerId);
          if (!partner || partner.city !== user.city || partner.userId === user.id) return [];
          return [{ id: o.id, title: o.title, cost: o.cost, partner: { name: partner.name, city: partner.city, zone: partner.zone }, redeemedToday: redeemedToday(user.id, o.id) }];
        })
        .sort((a, b) => a.cost - b.cost || a.partner.name.localeCompare(b.partner.name));
    }),

  redeem: (offerId) =>
    simulate(() => {
      const user = requireUser();
      const offer = store.offers.find((o) => o.id === offerId && o.active);
      const partner = store.partners.find((p) => p.id === offer?.partnerId);
      if (!offer || !partner || partner.userId === user.id) throw new DataError('forbidden', 'Redemption not available');
      if (redeemedToday(user.id, offer.id)) throw new DataError('limit', 'Offer already redeemed today', { limit: 'redeem_per_day' });
      if (confirmedBalance(user.id) < offer.cost) throw new DataError('limit', 'Not enough yapitas', { limit: 'insufficient_balance' });
      if (mockMode === 'stellar-error') throw new DataError('server', 'Stellar payment failed');
      const id = nextId('redemption');
      const rec: RedemptionRec = { id, offerId: offer.id, userId: user.id, partnerId: partner.id, cost: offer.cost, createdAt: new Date().toISOString(), txHash: fakeTxHash(5000 + id) };
      store.redemptions.push(rec);
      for (const [userId, amount] of [[user.id, -offer.cost], [partner.userId, offer.cost]] as const) {
        store.movements.push({ id: nextId('movement'), userId, reason: 'canje', amount, createdAt: rec.createdAt, status: 'confirmed', txHash: rec.txHash, sourceUserId: null, redemptionId: id });
      }
      return toReceipt(rec, user.id);
    }),

  get: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = store.redemptions.find((r) => r.id === id);
      const partner = store.partners.find((p) => p.id === rec?.partnerId);
      if (!rec || (rec.userId !== user.id && partner?.userId !== user.id)) throw new DataError('not_found', 'Redemption not found');
      return toReceipt(rec, user.id);
    }),
};

/**
 * The own Pollar wallet on the mock (SPEC 31): Lucía is invited and already linked with 5 yapitas on «mainnet»; the
 * partners' offers are all listed as if they had a wallet. Starting and confirming a redemption pay at once.
 */
const mockOwn = { linked: new Map<Id, number>([[LUCIA, 5]]) };

export const mockOwnWallet: DataApi['ownWallet'] = {
  status: () =>
    simulate(() => {
      const user = requireUser();
      const balance = mockOwn.linked.get(user.id);
      const invited = user.id === LUCIA;
      return { invited, network: 'mainnet', issuer: invited ? 'GMOCKISSUER' : null, address: invited && balance !== undefined ? fakeAddress(user.id + 100) : null, balance: balance ?? null };
    }),
  link: () =>
    simulate(() => {
      const user = requireUser();
      const first = !mockOwn.linked.has(user.id);
      if (first) mockOwn.linked.set(user.id, 5);
      return { address: fakeAddress(user.id + 100), welcomeTxHash: first ? fakeTxHash(9000 + user.id) : null };
    }),
  offers: () => mockRedemptions.offers(),
  startRedeem: (offerId) =>
    simulate(() => {
      const user = requireUser();
      const offer = store.offers.find((o) => o.id === offerId && o.active);
      if (!offer) throw new DataError('forbidden', 'Redemption not available');
      if ((mockOwn.linked.get(user.id) ?? 0) < offer.cost) throw new DataError('limit', 'Not enough yapitas', { limit: 'insufficient_balance' });
      const partner = store.partners.find((p) => p.id === offer.partnerId);
      return { redemptionId: offer.id, destination: fakeAddress((partner?.userId ?? 0) + 100), amount: String(offer.cost), memo: `canje:${offer.id}`, issuer: 'GMOCKISSUER' };
    }),
  confirmRedeem: (offerId) =>
    simulate(() => {
      const user = requireUser();
      const offer = store.offers.find((o) => o.id === offerId);
      const partner = store.partners.find((p) => p.id === offer?.partnerId);
      if (!offer || !partner) throw new DataError('not_found', 'Redemption not found');
      mockOwn.linked.set(user.id, (mockOwn.linked.get(user.id) ?? 0) - offer.cost);
      const id = nextId('redemption');
      return { id, offerTitle: offer.title, partnerName: partner.name, partnerZone: partner.zone, cost: offer.cost, createdAt: new Date().toISOString(), txHash: fakeTxHash(7000 + id), side: 'paid' };
    }),
};

export const mockActivity: DataApi['activity'] = {
  myQuestions: () =>
    simulate(() => {
      const user = requireUser();
      return store.questions.filter((q) => q.authorId === user.id).sort(newestFirst).map(toQuestion);
    }),
  myAnswers: () =>
    simulate(() => {
      const user = requireUser();
      return store.answers.filter((a) => a.authorId === user.id).sort(newestFirst).map(toAnswer);
    }),
  mySigns: () =>
    simulate(() => {
      const user = requireUser();
      return store.signs.filter((s) => s.authorId === user.id).sort(newestFirst).map(toSign);
    }),
};

// ---------- Avisos (SPEC 22) ----------

const NOTICE_PAGE = 30;

/** The contact request seen by the viewer, like `contact_json` in SQL. */
function contactByRequest(requestId: Id, viewer: Id): ContactState | null {
  const rec = store.contacts.find((c) => c.id === requestId && (c.requesterId === viewer || c.ownerId === viewer));
  if (!rec) return null;
  const mine = rec.requesterId === viewer;
  const other = store.users.find((u) => u.id === (mine ? rec.ownerId : rec.requesterId));
  return {
    requestId: rec.id,
    status: rec.status,
    requestedByMe: mine,
    other: rec.status === 'accepted' && other ? { email: other.email, phone: mine ? rec.ownerPhone : rec.requesterPhone } : null,
  };
}

/** What a row points to, with the same rules per kind as `notice_item` in SQL. Null when it is gone or hidden. */
function noticeItem(n: NoticeRec, viewer: Id): Pick<Notice, 'text' | 'zone' | 'open'> {
  const gone = { text: null, zone: null, open: null };
  const visible = (kind: ReportKind, id: Id, authorId: Id) => !isHiddenFor(viewer, kind, id, authorId);
  const question = (id: Id) => store.questions.find((q) => q.id === id);
  if (n.kind === 'answer') {
    const a = store.answers.filter((x) => x.questionId === n.refId && x.authorId === n.actorId).sort(newestFirst)[0];
    return a && question(a.questionId) && visible('answer', a.id, a.authorId) ? { text: a.text, zone: null, open: { kind: 'question', id: a.questionId } } : gone;
  }
  if (n.kind === 'comment') {
    const c = store.comments.find((x) => x.id === n.refId);
    const a = c && store.answers.find((x) => x.id === c.answerId);
    return c && a && visible('comment', c.id, c.authorId) ? { text: c.text, zone: null, open: { kind: 'question', id: a.questionId } } : gone;
  }
  if (n.kind === 'helpful') {
    const a = store.answers.find((x) => x.id === n.refId);
    return a && visible('answer', a.id, a.authorId) ? { text: a.text, zone: null, open: { kind: 'question', id: a.questionId } } : gone;
  }
  if (n.kind === 'sign_helpful') {
    const sign = store.signs.find((x) => x.id === n.refId);
    return sign && visible('sign', sign.id, sign.authorId) ? { text: sign.title, zone: null, open: { kind: 'sign', id: sign.id } } : gone;
  }
  let questionId: Id | undefined = n.refId;
  if (n.kind === 'contact_request' || n.kind === 'contact_accepted') {
    const rec = store.contacts.find((c) => c.id === n.refId);
    questionId = rec && store.answers.find((a) => a.id === rec.answerId)?.questionId;
  }
  const q = questionId === undefined ? undefined : question(questionId);
  return q && visible('question', q.id, q.authorId)
    ? { text: q.text, zone: n.kind === 'urgent' ? q.zone : null, open: { kind: 'question', id: q.id } }
    : gone;
}

/** The viewer's notices, one per row except «Me sirvió» of the same letrero (one group), newest first. */
function buildNotices(viewer: Id): Notice[] {
  const groups = new Map<string, NoticeRec[]>();
  for (const n of store.notices.filter((x) => x.userId === viewer)) {
    const key = n.kind === 'sign_helpful' ? `sign:${n.refId}` : `n:${n.id}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()]
    .map((rows) => {
      const newest = [...rows].sort((a, b) => newestFirst(a, b) || b.id - a.id)[0];
      const contact = newest.kind === 'contact_request' || newest.kind === 'contact_accepted' ? contactByRequest(newest.refId, viewer) : null;
      return {
        id: newest.id,
        kind: newest.kind,
        createdAt: newest.createdAt,
        read: rows.every((r) => r.readAt !== null),
        actor: newest.actorId === null ? null : authorOf(newest.actorId).displayName,
        count: rows.length,
        ...noticeItem(newest, viewer),
        contact,
      };
    })
    .sort((a, b) => newestFirst(a, b) || b.id - a.id);
}

export const mockNotices: DataApi['notices'] = {
  list: (offset = 0) =>
    simulate(() => {
      const all = buildNotices(requireUser().id);
      const end = offset + NOTICE_PAGE;
      return { items: all.slice(offset, end), nextOffset: end < all.length ? end : null };
    }),
  unreadCount: () => simulate(() => buildNotices(requireUser().id).filter((n) => !n.read).length),
  markRead: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = store.notices.find((n) => n.id === id && n.userId === user.id);
      if (!rec) return;
      const now = new Date().toISOString();
      for (const n of store.notices) {
        const same = n.id === rec.id || (rec.kind === 'sign_helpful' && n.kind === 'sign_helpful' && n.refId === rec.refId);
        if (same && n.userId === user.id && n.readAt === null) n.readAt = now;
      }
    }),
  markAllRead: () =>
    simulate(() => {
      const user = requireUser();
      const now = new Date().toISOString();
      for (const n of store.notices) if (n.userId === user.id && n.readAt === null) n.readAt = now;
    }),
};

/** The mock has no push service: preferences live on the user, subscriptions in memory, nothing is ever sent. */
const mockSubscriptions = new Map<string, Id>();

export const mockPush: DataApi['push'] = {
  getPrefs: () => simulate(() => ({ ...DEFAULT_NOTIF_PREFS, ...requireUser().notifPrefs })),
  setPrefs: (prefs) =>
    simulate(() => {
      const user = requireUser();
      user.notifPrefs = { ...prefs };
      return { ...prefs };
    }),
  saveSubscription: (subscription) =>
    simulate(() => {
      mockSubscriptions.set(subscription.endpoint, requireUser().id);
    }),
  deleteSubscription: (endpoint) =>
    simulate(() => {
      if (mockSubscriptions.get(endpoint) === requireUser().id) mockSubscriptions.delete(endpoint);
    }),
};

export const mockAdapter: DataApi = {
  auth: mockAuth,
  signs: mockSigns,
  questions: mockQuestions,
  answers: mockAnswers,
  comments: mockComments,
  contact: mockContact,
  live: mockLive,
  saved: mockSaved,
  reports: mockReports,
  wallet: mockWallet,
  redemptions: mockRedemptions,
  ownWallet: mockOwnWallet,
  activity: mockActivity,
  notices: mockNotices,
  push: mockPush,
};
