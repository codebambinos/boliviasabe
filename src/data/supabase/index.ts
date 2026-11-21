// Everything of the Supabase adapter beyond auth (SPEC 11, T39), loaded on first use by source.ts so the
// mock build never ships it.
import { supabaseReports, supabaseSaved } from './saved';
import { supabaseSigns } from './signs';

export const supabaseData = {
  signs: supabaseSigns,
  saved: supabaseSaved,
  reports: supabaseReports,
};
