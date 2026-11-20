// Relative times in Spanish. A number never breaks from its unit (no-break space).
const DAY = 24 * 60 * 60 * 1000;

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export type FeedSection = 'hoy' | 'semana' | 'antes';

/** Hoy = same calendar day; Esta semana = up to 7 days; Antes = older (wiki #140). */
export function feedSection(iso: string, now = new Date()): FeedSection {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return 'hoy';
  return now.getTime() - date.getTime() <= 7 * DAY ? 'semana' : 'antes';
}

export function isStale(iso: string, now = Date.now()): boolean {
  return now - new Date(iso).getTime() > 7 * DAY;
}
