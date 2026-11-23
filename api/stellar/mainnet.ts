/**
 * POST /api/stellar/mainnet — the own Pollar wallet on the configured network (SPEC 31, wiki #221): status, link with
 * the 5-yapita welcome, and redemptions signed by the neighbor. See lib/stellar/ownWalletRoute.ts.
 */
import { ownWalletRoute } from '../../lib/stellar/ownWalletRoute.ts';

export async function POST(request: Request): Promise<Response> {
  return ownWalletRoute(request);
}
