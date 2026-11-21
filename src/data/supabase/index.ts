// Everything of the Supabase adapter beyond auth (SPEC 11, T39), loaded on first use by source.ts so the
// mock build never ships it.
import { supabaseActivity, supabaseMovements } from './activity';
import { supabaseAnswers } from './answers';
import { supabaseQuestions } from './questions';
import { supabaseReports, supabaseSaved } from './saved';
import { supabaseSigns } from './signs';
import { supabaseComments, supabaseContact, supabaseLive } from './threads';

export const supabaseData = {
  signs: supabaseSigns,
  questions: supabaseQuestions,
  answers: supabaseAnswers,
  comments: supabaseComments,
  contact: supabaseContact,
  live: supabaseLive,
  saved: supabaseSaved,
  reports: supabaseReports,
  activity: supabaseActivity,
  movements: supabaseMovements,
};
