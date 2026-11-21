// Copy for /privacidad and «Acerca de» (SPEC 02, wiki › Cuenta y acceso, Yo › Acerca de).
// DRAFT written from wiki facts only; Yaeko reviews it. Corrections touch only this file.

export type Section = { title: string; paragraphs: string[] };

export const CONTACT_EMAIL = 'boliviasabe.app@gmail.com';

export const PRIVACY = {
  title: 'Privacidad',
  updated: 'Actualizado el 20 de noviembre de 2026',
  intro:
    'BoliviaSabe es una app para que los vecinos compartan precios, ofertas y servicios de su zona. Aquí te contamos qué datos guardamos y para qué, sin letra chiquita.',
  sections: [
    {
      title: 'Qué guardamos',
      paragraphs: [
        'Tu nombre, tu correo, tu ciudad y tu zona. Tu celular solo si eliges compartirlo.',
        'Lo que publicas: tus letreros con sus fotos, tus preguntas y tus respuestas.',
      ],
    },
    {
      title: 'Para qué',
      paragraphs: [
        'Para que puedas entrar a tu cuenta, para mostrar lo que publicas a los vecinos de tu ciudad y para darte las yapitas que ganas cuando ayudas.',
      ],
    },
    {
      title: 'Qué ven los demás',
      paragraphs: [
        'Tus vecinos ven tu nombre con la inicial de tu apellido (por ejemplo, «Lucía M.») y lo que publicas.',
        'Tu correo o tu celular solo los ve alguien cuando tú aceptas su pedido de contacto.',
      ],
    },
    {
      title: 'Tus yapitas',
      paragraphs: [
        'Las yapitas funcionan en una red de pruebas, sin dinero real.',
        'Cada yapita queda anotada en un registro público que nadie puede cambiar. Ese registro muestra tu cuenta de prueba, no tu nombre ni tu correo.',
      ],
    },
    {
      title: 'Borrar tu cuenta',
      paragraphs: [
        `Escríbenos a ${CONTACT_EMAIL} desde el correo de tu cuenta y la borramos.`,
      ],
    },
    {
      title: 'Contacto',
      paragraphs: ['¿Tienes dudas sobre tus datos? Escríbenos y te respondemos.'],
    },
  ] satisfies Section[],
};

export const ABOUT = {
  title: 'Acerca de',
  what: 'BoliviaSabe es la app donde los vecinos comparten letreros con precios, ofertas y servicios de su zona, y se ayudan en «¿Alguien sabe?». Ayudar te da yapitas.',
  team: { org: 'CodeBambinos', people: ['Diego', 'Aldrin', 'Yaeko'] },
  contactLabel: 'Escríbenos',
} as const;
