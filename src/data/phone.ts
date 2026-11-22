// The phone shared on «Pedir contacto» (wiki #182, #215): the same rule as `public.clean_phone` (0006), so the app,
// the mock and the database agree. Optional; may start with +; 6 to 20 characters of digits, spaces, () and -.
import { DataError } from './errors';

const PHONE = /^\+?[0-9][0-9 ()-]{5,19}$/;

/** Empty → null (no phone); a value that does not look like a phone → `validation` on field `phone`. */
export function cleanPhone(phone?: string | null): string | null {
  const value = phone?.trim() ?? '';
  if (!value) return null;
  if (!PHONE.test(value)) throw new DataError('validation', 'Invalid phone', { field: 'phone' });
  return value;
}
