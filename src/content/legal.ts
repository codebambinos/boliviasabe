// Copy for /privacidad and «Acerca de» (SPEC 02, wiki › Cuenta y acceso, Yo › Acerca de).
// DRAFT written from wiki facts only; Yaeko reviews it. Corrections touch only this file.

export type Section = { id: string; title: string; paragraphs: string[] };
export type Highlight = { icon: 'eye' | 'yapita' | 'trash'; title: string; text: string };

export const CONTACT_EMAIL = 'boliviasabe.app@gmail.com';

export const PRIVACY = {
  eyebrow: 'Tus datos en BoliviaSabe',
  title: 'Privacidad',
  updated: 'Actualizado el 20 de noviembre de 2026',
  intro:
    'BoliviaSabe es una app para que los vecinos compartan precios, ofertas y servicios de su zona. Aquí te contamos qué datos guardamos y para qué, sin letra chiquita.',
  highlightsTitle: 'Lo principal',
  highlights: [
    { icon: 'eye', title: 'Tu celular, solo si tú quieres', text: 'Tus vecinos ven tu nombre con la inicial de tu apellido.' },
    { icon: 'yapita', title: 'Yapitas sin dinero real', text: 'Funcionan en una red de pruebas.' },
    { icon: 'trash', title: 'Borras tu cuenta con un correo', text: 'Nos escribes y la borramos.' },
  ] satisfies Highlight[],
  tocTitle: 'En esta página',
  sections: [
    {
      id: 'que-guardamos',
      title: 'Qué guardamos',
      paragraphs: [
        'Tu nombre, tu correo, tu ciudad y tu zona. Tu celular solo si eliges compartirlo.',
        'Lo que publicas: tus letreros con sus fotos, tus preguntas y tus respuestas.',
      ],
    },
    {
      id: 'para-que',
      title: 'Para qué',
      paragraphs: [
        'Para que puedas entrar a tu cuenta, para mostrar lo que publicas a los vecinos de tu ciudad y para darte las yapitas que ganas cuando ayudas.',
      ],
    },
    {
      id: 'que-ven-los-demas',
      title: 'Qué ven los demás',
      paragraphs: [
        'Tus vecinos ven tu nombre con la inicial de tu apellido (por ejemplo, «Lucía M.») y lo que publicas.',
        'Tu correo o tu celular solo los ve alguien cuando tú aceptas su pedido de contacto.',
      ],
    },
    {
      id: 'tus-yapitas',
      title: 'Tus yapitas',
      paragraphs: [
        'Las yapitas funcionan en una red de pruebas, sin dinero real.',
        'Cada yapita queda anotada en un registro público que nadie puede cambiar. Ese registro muestra tu cuenta de prueba, no tu nombre ni tu correo.',
      ],
    },
    {
      id: 'borrar-tu-cuenta',
      title: 'Borrar tu cuenta',
      paragraphs: [`Escríbenos a ${CONTACT_EMAIL} desde el correo de tu cuenta y la borramos.`],
    },
    {
      id: 'contacto',
      title: 'Contacto',
      paragraphs: ['¿Tienes dudas sobre tus datos? Escríbenos y te respondemos.'],
    },
  ] satisfies Section[],
};

export const ABOUT = {
  title: 'Acerca de',
  tagline: 'Lo que tus vecinos saben, en un solo lugar.',
  what: 'BoliviaSabe es la app donde los vecinos comparten letreros con precios, ofertas y servicios de su zona, y se ayudan en «¿Alguien sabe?». Ayudar te da yapitas.',
  stepsTitle: 'Cómo funciona',
  steps: [
    { icon: 'plus', title: 'Sube un letrero', text: 'Una foto de un precio, una oferta o un servicio de tu zona.' },
    { icon: 'question', title: 'Pregunta o responde', text: 'En «¿Alguien sabe?» tus vecinos te ayudan.' },
    { icon: 'yapita', title: 'Gana yapitas', text: 'Cuando lo tuyo le sirve a alguien.' },
  ] as const,
  team: { org: 'CodeBambinos', people: ['Diego', 'Aldrin', 'Yaeko'] },
  contactLabel: 'Escríbenos',
  contactText: '¿Una idea, un problema o una duda? Te respondemos.',
} as const;
