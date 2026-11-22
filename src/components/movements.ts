// Yo › Movimientos and Mi cuenta de prueba: labels and short forms (wiki #157, #213).
import type { Movement } from '../data';

/** The reason of each movement, as the wiki words it (#213). */
export const REASON_LABEL: Record<Movement['reason'], string> = {
  bienvenida: 'Bienvenida',
  letrero: 'Subiste un letrero',
  'sirvio-l': 'Tu letrero le sirvió a alguien',
  ayuda: 'Tu respuesta sirvió',
  cierre: 'Cerraste tu pregunta',
  urgente: 'Pregunta urgente',
  canje: 'Canje',
};

export const STATUS_LABEL: Record<Movement['status'], string> = {
  confirmed: 'Confirmado',
  pending: 'Pendiente',
  error: 'Error',
};

/** «+5 yapitas» · «−5 yapitas» · «+1 yapita». Never «puntos». */
export function formatAmount(amount: number): string {
  const sign = amount > 0 ? '+' : '−';
  const value = Math.abs(amount);
  return `${sign}${value} ${value === 1 ? 'yapita' : 'yapitas'}`;
}

/** «GABC…XYZ9»: the start and end of a Stellar address or transaction hash. */
export function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

/** «4,3»: stars with a decimal comma (wiki › Transversal › Fechas). */
export function formatStars(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export const EXPLORER_ACCOUNT = 'https://stellar.expert/explorer/testnet/account/';

export const CANJE_GOAL = 100;
