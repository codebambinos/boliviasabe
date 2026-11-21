/**
 * POST /api/stellar/reintentar — «Reintentar» in Movimientos (SPEC 11): pays again one of the caller's own
 * rewards that stayed pending or failed. Body: { refId: <rewards.id> }. Same answers as /premiar.
 */
import { reintentar } from '../../lib/stellar/route.ts';

export async function POST(request: Request): Promise<Response> {
  return reintentar(request);
}
