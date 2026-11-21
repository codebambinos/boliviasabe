/**
 * What a link preview says (SPEC 19, wiki #210): the Open Graph tags that WhatsApp and other preview bots read on
 * /p/:id and /l/:id. UI copy, so it is in Spanish. Pure: /api/og fetches the item and passes it here.
 */

export type OgItem =
  | { kind: 'question'; id: number; text: string; zone: string; city: string; photoUrl: string | null }
  | { kind: 'sign'; id: number; title: string; price: string | null; zone: string; city: string; thumbUrl: string };

export type OgMeta = {
  title: string;
  description: string;
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  url: string;
};

const SITE = 'BoliviaSabe';
const TAGLINE = 'Lo que pasa hoy en tu ciudad, lo sabemos entre todos.';
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 160;

/** One line, at most `max` characters, with «…» when it was cut. */
export function cut(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const place = (zone: string, city: string) => [zone.trim(), city.trim()].filter(Boolean).join(', ');

/** The preview of a question, a letrero, or the generic one (home, deleted, hidden, in review, any error). */
export function ogFor(item: OgItem | null, origin: string, path: string): OgMeta {
  const url = `${origin}${path}`;
  const card = { image: `${origin}/og.png`, imageWidth: 1200, imageHeight: 630 };

  if (item?.kind === 'question') {
    return {
      title: cut(`¿Alguien sabe? ${item.text}`, TITLE_MAX),
      description: cut(`Pregunta en ${place(item.zone, item.city)}. Responde en ${SITE}.`, DESCRIPTION_MAX),
      ...(item.photoUrl ? { image: item.photoUrl } : card),
      url,
    };
  }
  if (item?.kind === 'sign') {
    const price = item.price?.trim();
    return {
      title: cut(price ? `${item.title} · ${price}` : item.title, TITLE_MAX),
      description: cut(`${place(item.zone, item.city)} · Letrero en ${SITE}`, DESCRIPTION_MAX),
      image: item.thumbUrl,
      url,
    };
  }
  return { title: SITE, description: TAGLINE, ...card, url };
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A small page with the tags; bots read the head, and the visible link is there for anyone who lands on it. */
export function renderOgHtml(meta: OgMeta): string {
  const e = escapeHtml;
  const tag = (property: string, content: string) => `    <meta property="${property}" content="${e(content)}" />`;
  const size =
    meta.imageWidth && meta.imageHeight
      ? [tag('og:image:width', String(meta.imageWidth)), tag('og:image:height', String(meta.imageHeight))]
      : [];
  return [
    '<!doctype html>',
    '<html lang="es">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${e(meta.title)}</title>`,
    `    <meta name="description" content="${e(meta.description)}" />`,
    tag('og:type', 'website'),
    tag('og:site_name', SITE),
    tag('og:locale', 'es_BO'),
    tag('og:title', meta.title),
    tag('og:description', meta.description),
    tag('og:url', meta.url),
    tag('og:image', meta.image),
    ...size,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <link rel="canonical" href="${e(meta.url)}" />`,
    '  </head>',
    '  <body>',
    `    <p><a href="${e(meta.url)}">${e(meta.title)}</a></p>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}
