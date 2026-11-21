/**
 * POST /api/stellar/gastar — charges the yapitas an action costs (T17, SPEC 09). Only the urgent question (−5).
 * Body: { reason: 'urgente', refId: number }. A charge that cannot be made answers «not_charged» and charges nothing.
 */
import { gastar } from '../../lib/stellar/route.ts';

export async function POST(request: Request): Promise<Response> {
  return gastar(request);
}
