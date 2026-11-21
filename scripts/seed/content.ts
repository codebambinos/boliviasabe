/**
 * What the seed loads (SPEC 14, wiki #193): the 5 neighbors and the 14 questions of the mock adapter
 * (src/data/mock/fixtures.ts), and 9 food letreros made from Yaeko's photos (scripts/seed/photos).
 * Texts are UI copy, so they are in Spanish. Tags are from the 18 of the catalog (wiki reglas-finales › Catálogos).
 */

export type NeighborKey = 'lucia' | 'jorge' | 'ana' | 'marco' | 'rosa';

export type SeedNeighbor = { key: NeighborKey; email: string; fullName: string; city: string; zone: string };

export type SeedSign = {
  /** File name in scripts/seed/photos, without extension; the thumbnail is `<photo>-480.jpg`. */
  photo: string;
  title: string;
  price: string | null;
  author: NeighborKey;
  zone: string;
  tags: string[];
  hoursAgo: number;
  /** Neighbors who mark «Me sirvió» on it (never its author). */
  helpfulFrom: NeighborKey[];
};

export type SeedAnswer = {
  author: NeighborKey;
  text: string;
  /** The asker's rating. */
  rating?: 'helpful' | 'not_helpful';
  comments?: { author: NeighborKey; text: string }[];
};

export type SeedQuestion = {
  author: NeighborKey;
  text: string;
  city: string;
  zone: string;
  tags: string[];
  hoursAgo: number;
  urgent?: boolean;
  /** solved: through a helpful rating · closed: «Ninguna me sirvió». */
  outcome: 'open' | 'solved' | 'closed';
  answers: SeedAnswer[];
};

export const NEIGHBORS: SeedNeighbor[] = [
  { key: 'lucia', email: 'lucia@example.com', fullName: 'Lucía Mamani', city: 'Cochabamba', zone: 'Cala Cala' },
  { key: 'jorge', email: 'jorge@example.com', fullName: 'Jorge Rojas', city: 'Cochabamba', zone: 'Sarco' },
  { key: 'ana', email: 'ana@example.com', fullName: 'Ana Rivera', city: 'Cochabamba', zone: 'Queru Queru' },
  { key: 'marco', email: 'marco@example.com', fullName: 'Marco Vargas', city: 'Cochabamba', zone: 'Centro' },
  { key: 'rosa', email: 'rosa@example.com', fullName: 'Rosa Quispe', city: 'La Paz', zone: 'Sopocachi' },
];

export const SIGNS: SeedSign[] = [
  { photo: '1', title: 'Combo trío: mondongo, chicharrón y fritanga', price: 'Bs 100 los 3', author: 'marco', zone: 'Centro', tags: ['Comida', 'Ofertas'], hoursAgo: 1, helpfulFrom: ['lucia', 'jorge', 'ana'] },
  { photo: '14', title: 'Trancapecho a Bs 15', price: 'Bs 15', author: 'ana', zone: 'Queru Queru', tags: ['Comida', 'Ofertas'], hoursAgo: 3, helpfulFrom: ['lucia', 'marco'] },
  { photo: '7', title: 'Silpancho, pique o charque con Coca', price: 'Desde Bs 32', author: 'ana', zone: 'Queru Queru', tags: ['Comida', 'Precios'], hoursAgo: 6, helpfulFrom: ['jorge', 'marco'] },
  { photo: '2', title: 'Jueves de comida cruceña, almuerzo completo', price: 'Bs 20', author: 'lucia', zone: 'Cala Cala', tags: ['Comida', 'Almuerzos'], hoursAgo: 10, helpfulFrom: ['ana', 'marco'] },
  { photo: '6', title: "K'jaras con entrega a domicilio", price: 'Bs 25', author: 'jorge', zone: 'Sarco', tags: ['Comida'], hoursAgo: 15, helpfulFrom: ['lucia', 'ana'] },
  { photo: '8', title: 'Menú de comida boliviana: caldo, chicharrón y más', price: 'Desde Bs 12', author: 'marco', zone: 'Centro', tags: ['Comida', 'Precios'], hoursAgo: 21, helpfulFrom: ['jorge'] },
  { photo: '3', title: 'Miércoles de pastas, menú del día', price: 'Bs 20', author: 'lucia', zone: 'Cala Cala', tags: ['Comida', 'Almuerzos'], hoursAgo: 28, helpfulFrom: ['jorge', 'marco'] },
  { photo: '9', title: 'Comida criolla: pique macho, sajta y fritanga', price: 'Desde Bs 25', author: 'jorge', zone: 'Sarco', tags: ['Comida'], hoursAgo: 36, helpfulFrom: ['ana'] },
  { photo: '15', title: 'Almuerzo cubano-boliviano con refresco', price: 'Bs 20', author: 'marco', zone: 'Centro', tags: ['Comida', 'Almuerzos'], hoursAgo: 44, helpfulFrom: ['lucia'] },
];

export const QUESTIONS: SeedQuestion[] = [
  {
    author: 'jorge', text: '¿Alguna farmacia de turno abierta ahora cerca de Sarco?', city: 'Cochabamba', zone: 'Sarco', tags: ['Salud'], hoursAgo: 2, urgent: true, outcome: 'open',
    answers: [{ author: 'ana', text: 'La de la avenida América esquina Beni atiende 24 horas.', comments: [{ author: 'jorge', text: 'Gracias, ya voy para allá.' }] }],
  },
  {
    author: 'lucia', text: '¿Dónde arreglan licuadoras en Cala Cala?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Servicios', 'Hogar'], hoursAgo: 5, outcome: 'open',
    answers: [
      {
        author: 'marco', text: 'En la calle Lanza hay un taller pequeño, cobran barato.',
        comments: [
          { author: 'lucia', text: '¿Te acuerdas cómo se llama el taller?' },
          { author: 'marco', text: 'No me acuerdo el nombre, está al lado de una farmacia.' },
        ],
      },
      { author: 'jorge', text: 'Probá en el mercado Calatayud, hay varios.' },
    ],
  },
  {
    author: 'lucia', text: '¿Qué micro va de Cala Cala a la terminal?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Transporte'], hoursAgo: 9, outcome: 'open',
    answers: [{ author: 'ana', text: 'La línea 10 te deja a dos cuadras.', rating: 'not_helpful' }],
  },
  {
    author: 'ana', text: '¿Alguien sabe si hay clases de natación para niños en vacaciones?', city: 'Cochabamba', zone: 'Queru Queru', tags: ['Educación'], hoursAgo: 14, outcome: 'solved',
    answers: [
      { author: 'jorge', text: 'En la piscina olímpica abren cursos en diciembre.', rating: 'helpful', comments: [{ author: 'ana', text: '¿Sabes si hay que inscribirse antes?' }] },
      { author: 'lucia', text: 'En el club de Tiquipaya también.' },
    ],
  },
  {
    author: 'marco', text: '¿Cuánto cuesta el kilo de carne de res esta semana?', city: 'Cochabamba', zone: 'Centro', tags: ['Precios', 'Mercado'], hoursAgo: 20, outcome: 'solved',
    answers: [{ author: 'jorge', text: 'En la Cancha está a Bs 48 el kilo.', rating: 'helpful' }],
  },
  {
    author: 'jorge', text: '¿Veterinaria que atienda domingos?', city: 'Cochabamba', zone: 'Sarco', tags: ['Mascotas'], hoursAgo: 26, outcome: 'solved',
    answers: [{ author: 'ana', text: 'La de la Blanco Galindo km 2 abre domingos hasta mediodía.', rating: 'helpful' }],
  },
  {
    author: 'ana', text: '¿Algún lugar para imprimir planos grandes?', city: 'Cochabamba', zone: 'Muyurina', tags: ['Servicios'], hoursAgo: 31, outcome: 'closed',
    answers: [{ author: 'marco', text: 'Creo que cerca de la universidad.', rating: 'not_helpful' }],
  },
  {
    author: 'marco', text: '¿Dónde venden útiles escolares al por mayor?', city: 'Cochabamba', zone: 'Centro', tags: ['Educación', 'Precios'], hoursAgo: 38, outcome: 'solved',
    answers: [
      { author: 'jorge', text: 'En la calle Esteban Arce, varias tiendas mayoristas.', rating: 'helpful' },
      { author: 'lucia', text: 'En La Pampa también hay.' },
    ],
  },
  {
    author: 'lucia', text: '¿Recomiendan algún gasfitero de confianza?', city: 'Cochabamba', zone: 'Cala Cala', tags: ['Hogar', 'Servicios'], hoursAgo: 45, outcome: 'solved',
    answers: [{ author: 'jorge', text: 'Don Remberto, siempre puntual. Pedile el contacto por aquí.', rating: 'helpful' }],
  },
  { author: 'ana', text: '¿Hay feria de libros este fin de semana?', city: 'Cochabamba', zone: 'Queru Queru', tags: ['Eventos', 'Educación'], hoursAgo: 52, outcome: 'open', answers: [] },
  {
    author: 'marco', text: '¿Qué trámites piden para sacar el brevet?', city: 'Cochabamba', zone: 'Centro', tags: ['Trámites'], hoursAgo: 60, outcome: 'solved',
    answers: [
      { author: 'jorge', text: 'Carnet, examen médico y el curso de la escuela de conductores.', rating: 'helpful' },
      { author: 'ana', text: 'Y la boleta de pago del banco.' },
    ],
  },
  { author: 'jorge', text: '¿Alguien vende plantines de tomate?', city: 'Cochabamba', zone: 'Tiquipaya', tags: ['Mercado'], hoursAgo: 70, outcome: 'open', answers: [] },
  { author: 'rosa', text: '¿Dónde hay buen api con pastel en Sopocachi?', city: 'La Paz', zone: 'Sopocachi', tags: ['Comida'], hoursAgo: 4, outcome: 'open', answers: [] },
  { author: 'rosa', text: '¿El teleférico rojo funciona los domingos temprano?', city: 'La Paz', zone: 'Centro', tags: ['Transporte'], hoursAgo: 30, outcome: 'open', answers: [] },
];

/** The test accounts of T39 and T23, deleted with everything they own (wiki #193). */
export const TEST_EMAIL = /^t39-\d+@test\.local$/;
