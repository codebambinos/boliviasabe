// Everything of the Supabase adapter beyond auth (SPEC 11, T39), loaded on first use by source.ts so the
// mock build never ships it.
import { supabaseAnswers } from './answers';
import { supabaseQuestions } from './questions';
import { supabaseReports, supabaseSaved } from './saved';
import { supabaseSigns } from './signs';

export const supabaseData = {
  signs: supabaseSigns,
  questions: supabaseQuestions,
  answers: supabaseAnswers,
  saved: supabaseSaved,
  reports: supabaseReports,
};
