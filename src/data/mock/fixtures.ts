// Seed data for the mock adapter. Internal records, not the public types:
// the adapter turns them into Sign, Question, etc. (authors, stars, isMine...).
import type { City, Id, NoticeKind, ReportKind, ReportReason, RewardReason, Tag } from '../types';
import { placeholderPhoto } from './svg';

export type UserRec = {
  id: Id;
  email: string;
  /** How the account enters: Google has no password, e-mail does (SPEC 07). */
  provider: 'google' | 'password';
  password: string | null;
  /** null until «Tu barrio» is saved. */
  fullName: string | null;
  city: City | null;
  zone: string | null;
  walletStatus: 'preparing' | 'ready' | 'error';
  address: string | null;
  /** Shared with «Pedir contacto» when given (wiki #182). */
  phone?: string | null;
  /** Ajustes › Notificaciones (SPEC 15); missing means all on. */
  notifPrefs?: import('../api').NotifPrefs;
};

export type SignRec = {
  id: Id;
  authorId: Id;
  title: string;
  photoUrl: string;
  /** 480 px thumbnail; seeded letreros have none and use photoUrl. */
  thumbUrl?: string;
  price: string | null;
  city: City;
  zone: string;
  tags: Tag[];
  mapsUrl: string | null;
  createdAt: string;
};

export type SignVoteRec = { signId: Id; userId: Id; value: 'helpful' | 'not_helpful' };

export type QuestionRec = {
  id: Id;
  authorId: Id;
  text: string;
  photoUrl: string | null;
  city: City;
  zone: string;
  tags: Tag[];
  createdAt: string;
  urgentUntil: string | null;
  status: 'open' | 'solved' | 'closed';
  /** The +1 for closing is paid once per question. */
  closureRewarded: boolean;
};

export type AnswerRec = {
  id: Id;
  questionId: Id;
  authorId: Id;
  text: string;
  createdAt: string;
  /** «Me sirvió» / «No me sirvió» from the asker. */
  helpful: boolean;
  notHelpful: boolean;
};

export type MovementRec = {
  id: Id;
  userId: Id;
  reason: RewardReason;
  amount: number;
  createdAt: string;
  status: 'confirmed' | 'pending' | 'error';
  txHash: string | null;
  /** Who triggered the reward (for the 3-per-day-per-pair rule). */
  sourceUserId: Id | null;
  /** The redemption a `canje` movement belongs to (SPEC 29). */
  redemptionId?: Id;
};

/** A partner business: an app user linked by the partner script (SPEC 29). */
/** `featuredUntil`: in Hoy's «Destacados» until then (SPEC 30); null when not featured. */
export type PartnerRec = { id: Id; userId: Id; name: string; city: City; zone: string; featuredUntil: string | null };
export type OfferRec = { id: Id; partnerId: Id; title: string; cost: number; active: boolean };
export type RedemptionRec = { id: Id; offerId: Id; userId: Id; partnerId: Id; cost: number; createdAt: string; txHash: string };

export type CommentRec = { id: Id; answerId: Id; authorId: Id; text: string; createdAt: string };

export type ContactRec = {
  id: Id;
  answerId: Id;
  requesterId: Id;
  ownerId: Id;
  status: 'pending' | 'accepted' | 'declined';
  requesterPhone: string | null;
  ownerPhone: string | null;
};

/** A row of `notifications` (SPEC 22): who gets it, what caused it and when it was read. */
export type NoticeRec = { id: Id; userId: Id; kind: NoticeKind; refId: Id; actorId: Id | null; createdAt: string; readAt: string | null };

export type ContentRef = { userId: Id; kind: ReportKind; itemId: Id };
export type ReportRec = ContentRef & { reason: ReportReason };

const HOUR = 3600 * 1000;
const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Fake but well-formed Stellar public key (G + 55 chars). */
export function fakeAddress(seed: number): string {
  let out = 'G';
  for (let i = 0; i < 55; i++) out += BASE32[(seed * 31 + i * 17 + i * i) % 32];
  return out;
}

/** Fake 64-char transaction hash. */
export function fakeTxHash(seed: number): string {
  let out = '';
  for (let i = 0; i < 64; i++) out += ((seed * 7 + i * 13 + i * i) % 16).toString(16);
  return out;
}

export const LUCIA = 1;
const JORGE = 2;
const ANA = 3;
const MARCO = 4;
const ROSA = 5;

/** Password of the seed neighbors that sign in with e-mail (documented in src/data/README.md). */
export const SEED_PASSWORD = 'vecino123';

export const users: UserRec[] = [
  { id: LUCIA, email: 'lucia@example.com', provider: 'google', password: null, fullName: 'Lucía Mamani', city: 'Cochabamba', zone: 'Cala Cala', walletStatus: 'ready', address: fakeAddress(LUCIA) },
  { id: JORGE, email: 'jorge@example.com', provider: 'password', password: SEED_PASSWORD, fullName: 'Jorge Rojas', city: 'Cochabamba', zone: 'Sarco', walletStatus: 'ready', address: fakeAddress(JORGE) },
  { id: ANA, email: 'ana@example.com', provider: 'password', password: SEED_PASSWORD, fullName: 'Ana Rivera', city: 'Cochabamba', zone: 'Queru Queru', walletStatus: 'ready', address: fakeAddress(ANA) },
  { id: MARCO, email: 'marco@example.com', provider: 'password', password: SEED_PASSWORD, fullName: 'Marco Vargas', city: 'Cochabamba', zone: 'Centro', walletStatus: 'ready', address: fakeAddress(MARCO) },
  { id: ROSA, email: 'rosa@example.com', provider: 'password', password: SEED_PASSWORD, fullName: 'Rosa Quispe', city: 'La Paz', zone: 'Sopocachi', walletStatus: 'ready', address: fakeAddress(ROSA) },
];

const SIGN_TEMPLATES: { title: string; price: string | null; zone: string; tags: Tag[] }[] = [
  { title: 'Almuerzo completo con sopa y segundo', price: 'Bs 15', zone: 'Cala Cala', tags: ['Comida', 'Almuerzos'] },
  { title: 'Pollo frito 2x1 los martes', price: 'Bs 30', zone: 'Centro', tags: ['Comida', 'Ofertas'] },
  { title: 'Arreglo de celulares en el día', price: null, zone: 'Sarco', tags: ['Servicios', 'Tecnología'] },
  { title: 'Kilo de papa en la Cancha', price: 'Bs 6', zone: 'Centro', tags: ['Mercado', 'Precios'] },
  { title: 'Clases de matemáticas para colegio', price: 'Bs 40 la hora', zone: 'Queru Queru', tags: ['Educación'] },
  { title: 'Vacunas para perros y gatos', price: 'Bs 50', zone: 'Tupuraya', tags: ['Mascotas', 'Salud'] },
  { title: 'Feria de ropa usada en la plaza', price: null, zone: 'Sacaba', tags: ['Ropa', 'Eventos'] },
  { title: 'Cuarto en alquiler cerca de la U', price: 'Bs 700 al mes', zone: 'Muyurina', tags: ['Alquileres'] },
  { title: 'Corte de cabello y barba', price: 'Bs 25', zone: 'Hipódromo', tags: ['Belleza', 'Servicios'] },
  { title: 'Trufi 107 cambió de ruta', price: null, zone: 'Quillacollo', tags: ['Transporte'] },
  { title: 'Plomero a domicilio', price: 'Bs 80 la visita', zone: 'Villa Busch', tags: ['Hogar', 'Servicios'] },
  { title: 'Se busca ayudante de cocina', price: null, zone: 'Tiquipaya', tags: ['Trabajo', 'Comida'] },
];

/** 35 signs in Cochabamba (two pages of 30), one every 7 hours: the oldest are over 7 days old. */
const cochabambaSigns: SignRec[] = Array.from({ length: 35 }, (_, i) => {
  const t = SIGN_TEMPLATES[i % SIGN_TEMPLATES.length];
  const round = Math.floor(i / SIGN_TEMPLATES.length);
  const title = round === 0 ? t.title : `${t.title} (${round + 1})`;
  return {
    id: i + 1,
    authorId: [LUCIA, JORGE, ANA, MARCO][i % 4],
    title,
    photoUrl: placeholderPhoto(title, i),
    price: t.price,
    city: 'Cochabamba',
    zone: t.zone,
    tags: t.tags,
    mapsUrl: i % 3 === 0 ? 'https://maps.google.com/?q=Cochabamba' : null,
    createdAt: ago(1 + i * 7),
  };
});

const laPazSigns: SignRec[] = [
  { title: 'Salteñas recién horneadas', price: 'Bs 7', zone: 'Sopocachi', tags: ['Comida'] as Tag[] },
  { title: 'Teleférico morado con demoras hoy', price: null, zone: 'Centro', tags: ['Transporte'] as Tag[] },
  { title: 'Trámite de carnet sin fila en la mañana', price: null, zone: 'San Pedro', tags: ['Trámites'] as Tag[] },
].map((t, i) => ({
  id: 36 + i,
  authorId: ROSA,
  title: t.title,
  photoUrl: placeholderPhoto(t.title, i + 2),
  price: t.price,
  city: 'La Paz' as City,
  zone: t.zone,
  tags: t.tags,
  mapsUrl: null,
  createdAt: ago(3 + i * 10),
}));

export const signs: SignRec[] = [...cochabambaSigns, ...laPazSigns];

/** Helpful votes from other neighbors (never on their own sign). */
export const signVotes: SignVoteRec[] = cochabambaSigns.flatMap((s, i) =>
  [LUCIA, JORGE, ANA, MARCO]
    .filter((userId) => userId !== s.authorId && (i + userId) % 3 !== 0)
    .map((userId) => ({ signId: s.id, userId, value: (i + userId) % 7 === 0 ? 'not_helpful' as const : 'helpful' as const })),
);

type QuestionSeed = Omit<QuestionRec, 'id' | 'photoUrl' | 'closureRewarded'> & {
  answers: { authorId: Id; text: string; helpful?: boolean; notHelpful?: boolean }[];
};

const QUESTION_SEEDS: QuestionSeed[] = [
  { authorId: JORGE, text: '¿Alguna farmacia de turno abierta ahora cerca de Sarco?', city: 'Cochabamba', zone: 'Sarco', tags: ['Salud'], createdAt: ago(2), urgentUntil: new Date(NOW + 20 * HOUR).toISOString(), status: 'open',
    answers: [{ authorId: ANA, text: 'La de la avenida América esquina Beni atiende 24 horas.' }] },
  { authorId: LUCIA, text: '¿Dónde arreglan licuadoras en Cala Cala?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Servicios', 'Hogar'], createdAt: ago(5), urgentUntil: null, status: 'open',
    answers: [{ authorId: MARCO, text: 'En la calle Lanza hay un taller pequeño, cobran barato.' }, { authorId: JORGE, text: 'Probá en el mercado Calatayud, hay varios.' }] },
  { authorId: LUCIA, text: '¿Qué micro va de Cala Cala a la terminal?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Transporte'], createdAt: ago(9), urgentUntil: null, status: 'open',
    answers: [{ authorId: ANA, text: 'La línea 10 te deja a dos cuadras.', notHelpful: true }] },
  { authorId: ANA, text: '¿Alguien sabe si hay clases de natación para niños en vacaciones?', city: 'Cochabamba', zone: 'Queru Queru', tags: ['Educación'], createdAt: ago(14), urgentUntil: null, status: 'solved',
    answers: [{ authorId: JORGE, text: 'En la piscina olímpica abren cursos en diciembre.', helpful: true }, { authorId: LUCIA, text: 'En el club de Tiquipaya también.' }] },
  { authorId: MARCO, text: '¿Cuánto cuesta el kilo de carne de res esta semana?', city: 'Cochabamba', zone: 'Centro', tags: ['Precios', 'Mercado'], createdAt: ago(20), urgentUntil: null, status: 'solved',
    answers: [{ authorId: JORGE, text: 'En la Cancha está a Bs 48 el kilo.', helpful: true }] },
  { authorId: JORGE, text: '¿Veterinaria que atienda domingos?', city: 'Cochabamba', zone: 'Sarco', tags: ['Mascotas'], createdAt: ago(26), urgentUntil: null, status: 'solved',
    answers: [{ authorId: ANA, text: 'La de la Blanco Galindo km 2 abre domingos hasta mediodía.', helpful: true }] },
  { authorId: ANA, text: '¿Algún lugar para imprimir planos grandes?', city: 'Cochabamba', zone: 'Muyurina', tags: ['Servicios'], createdAt: ago(31), urgentUntil: null, status: 'closed',
    answers: [{ authorId: MARCO, text: 'Creo que cerca de la universidad.', notHelpful: true }] },
  { authorId: MARCO, text: '¿Dónde venden útiles escolares al por mayor?', city: 'Cochabamba', zone: 'Centro', tags: ['Educación', 'Precios'], createdAt: ago(38), urgentUntil: null, status: 'solved',
    answers: [{ authorId: JORGE, text: 'En la calle Esteban Arce, varias tiendas mayoristas.', helpful: true }, { authorId: LUCIA, text: 'En La Pampa también hay.', helpful: false }] },
  { authorId: LUCIA, text: '¿Recomiendan algún gasfitero de confianza?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Hogar', 'Servicios'], createdAt: ago(45), urgentUntil: null, status: 'solved',
    answers: [{ authorId: JORGE, text: 'Don Remberto, siempre puntual. Pedile el contacto por aquí.', helpful: true }] },
  { authorId: ANA, text: '¿Hay feria de libros este fin de semana?', city: 'Cochabamba', zone: 'Queru Queru', tags: ['Eventos', 'Educación'], createdAt: ago(52), urgentUntil: null, status: 'open', answers: [] },
  { authorId: MARCO, text: '¿Qué trámites piden para sacar el brevet?', city: 'Cochabamba', zone: 'Centro', tags: ['Trámites'], createdAt: ago(60), urgentUntil: null, status: 'solved',
    answers: [{ authorId: JORGE, text: 'Carnet, examen médico y el curso de la escuela de conductores.', helpful: true }, { authorId: ANA, text: 'Y la boleta de pago del banco.' }] },
  { authorId: JORGE, text: '¿Alguien vende plantines de tomate?', city: 'Cochabamba', zone: 'Tiquipaya', tags: ['Mercado'], createdAt: ago(70), urgentUntil: null, status: 'open', answers: [] },
  { authorId: ROSA, text: '¿Dónde hay buen api con pastel en Sopocachi?', city: 'La Paz', zone: 'Sopocachi', tags: ['Comida'], createdAt: ago(4), urgentUntil: null, status: 'open', answers: [] },
  { authorId: ROSA, text: '¿El teleférico rojo funciona los domingos temprano?', city: 'La Paz', zone: 'Centro', tags: ['Transporte'], createdAt: ago(30), urgentUntil: null, status: 'open', answers: [] },
];

export const questions: QuestionRec[] = [];
export const answers: AnswerRec[] = [];
QUESTION_SEEDS.forEach((seed, i) => {
  const id = i + 1;
  const { answers: seedAnswers, ...question } = seed;
  questions.push({ ...question, id, photoUrl: i % 4 === 1 ? placeholderPhoto(question.text, i) : null, closureRewarded: question.status !== 'open' });
  seedAnswers.forEach((a, j) =>
    answers.push({
      id: answers.length + 1,
      questionId: id,
      authorId: a.authorId,
      text: a.text,
      createdAt: new Date(Date.parse(question.createdAt) + (j + 1) * 0.5 * HOUR).toISOString(),
      helpful: a.helpful ?? false,
      notHelpful: a.notHelpful ?? false,
    }),
  );
});

let movementId = 0;
const mv = (userId: Id, reason: RewardReason, amount: number, hoursAgo: number, sourceUserId: Id | null = null): MovementRec => {
  movementId += 1;
  return { id: movementId, userId, reason, amount, createdAt: ago(hoursAgo), status: 'confirmed', txHash: fakeTxHash(movementId), sourceUserId };
};

/** Confirmed balances: Lucía 17, Jorge 5, Ana 3 (too low for an urgent question), Marco 6, Rosa 5. */
export const movements: MovementRec[] = [
  mv(LUCIA, 'bienvenida', 5, 240),
  mv(LUCIA, 'letrero', 1, 200), mv(LUCIA, 'letrero', 1, 150), mv(LUCIA, 'letrero', 1, 100), mv(LUCIA, 'letrero', 1, 50),
  mv(LUCIA, 'ayuda', 5, 120, ANA), mv(LUCIA, 'ayuda', 5, 60, MARCO),
  mv(LUCIA, 'sirvio-l', 1, 40, JORGE), mv(LUCIA, 'sirvio-l', 1, 30, ANA), mv(LUCIA, 'sirvio-l', 1, 20, MARCO),
  mv(LUCIA, 'urgente', -5, 10),
  mv(JORGE, 'bienvenida', 5, 230), mv(JORGE, 'ayuda', 5, 100, ANA), mv(JORGE, 'urgente', -5, 2),
  mv(ANA, 'bienvenida', 5, 220), mv(ANA, 'letrero', 1, 90), mv(ANA, 'letrero', 1, 80), mv(ANA, 'letrero', 1, 70), mv(ANA, 'urgente', -5, 60),
  mv(MARCO, 'bienvenida', 5, 210), mv(MARCO, 'letrero', 1, 75),
  mv(ROSA, 'bienvenida', 5, 200),
];

/**
 * Two sample partners in Cochabamba (SPEC 29), so the redemption can be tried with the mock. Lucía (17) can redeem
 * the two cheap offers; the 30-yapita one shows «Te faltan 13 yapitas». Marco is featured in «Destacados» (SPEC 30);
 * Jorge is not, but his letreros still accept yapitas.
 */
export const partners: PartnerRec[] = [
  { id: 1, userId: MARCO, name: 'Salteñería Don Marco', city: 'Cochabamba', zone: 'Centro', featuredUntil: new Date(NOW + 30 * 24 * HOUR).toISOString() },
  { id: 2, userId: JORGE, name: 'Fotocopias Sarco', city: 'Cochabamba', zone: 'Sarco', featuredUntil: null },
];
export const offers: OfferRec[] = [
  { id: 1, partnerId: 1, title: 'Un refresco gratis con tu salteña', cost: 10, active: true },
  { id: 2, partnerId: 2, title: 'Anillado gratis de un trabajo', cost: 5, active: true },
  { id: 3, partnerId: 2, title: '50 fotocopias gratis', cost: 30, active: true },
];
export const redemptions: RedemptionRec[] = [];

export const saved: ContentRef[] = [{ userId: LUCIA, kind: 'sign', itemId: 2 }];
export const reports: ReportRec[] = [];
export const hidden: ContentRef[] = [];

/** Ana commented on Lucía's answer in «natación» (question 4, answer 6). */
export const comments: CommentRec[] = [{ id: 1, answerId: 6, authorId: ANA, text: 'Gracias, ¿sabes desde qué edad aceptan?', createdAt: ago(3) }];

/** Ana asks Lucía for her contact (pending); Lucía asked Jorge for the gasfitero's and he accepted. */
export const contacts: ContactRec[] = [
  { id: 1, answerId: 6, requesterId: ANA, ownerId: LUCIA, status: 'pending', requesterPhone: '70011223', ownerPhone: null },
  { id: 2, answerId: 12, requesterId: LUCIA, ownerId: JORGE, status: 'accepted', requesterPhone: null, ownerPhone: '71234567' },
];

/**
 * Lucía's Avisos: one notice of each of the 8 kinds, three «Me sirvió» on letrero 1 (one group), and one answer on a
 * question that no longer exists («Esto ya no está disponible»). The rest of the neighbors have none.
 */
let noticeId = 0;
const nt = (kind: NoticeKind, refId: Id, actorId: Id | null, hoursAgo: number, read = false): NoticeRec => {
  noticeId += 1;
  return { id: noticeId, userId: LUCIA, kind, refId, actorId, createdAt: ago(hoursAgo), readAt: read ? ago(hoursAgo / 2) : null };
};

export const notices: NoticeRec[] = [
  nt('answer', 2, MARCO, 4.5),
  nt('answer', 2, JORGE, 4),
  nt('comment', 1, ANA, 3),
  nt('helpful', 6, ANA, 12),
  nt('sign_helpful', 1, JORGE, 40, true),
  nt('sign_helpful', 1, ANA, 30),
  nt('sign_helpful', 1, MARCO, 2),
  nt('contact_request', 1, ANA, 1),
  nt('contact_accepted', 2, JORGE, 20, true),
  nt('urgent', 1, JORGE, 2, true),
  nt('reminder', 3, null, 0.5),
  nt('answer', 999, ROSA, 50),
];
