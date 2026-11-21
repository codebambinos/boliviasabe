/**
 * POST /api/stellar/premiar — pays the yapitas an action earns (T17, SPEC 09).
 * Body: { reason: 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre', refId: number }. Safe to call again: it is also the retry.
 */
import { premiar } from '../../lib/stellar/route.ts';

export async function POST(request: Request): Promise<Response> {
  return premiar(request);
}
