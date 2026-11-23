// The only error type the data layer rejects with. Screens pick the wiki message from `code`.

export type DataErrorCode =
  | 'offline'
  | 'server'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'limit'
  /** Sign-in with e-mail: the e-mail exists with a password, and this one is wrong. */
  | 'wrong_password'
  /** Sign-in with e-mail: the e-mail belongs to an account that enters with Google. */
  | 'google_account';

export type LimitReason =
  | 'questions_per_day'
  | 'open_questions'
  | 'urgent_active'
  | 'insufficient_balance'
  | 'comments_per_hour'
  /** SPEC 29: the same offer was already redeemed today. */
  | 'redeem_per_day';

type DataErrorDetails = {
  /** Which limit was hit (only with code "limit"). */
  limit?: LimitReason;
  /** ISO date when the limit resets: next midnight in Bolivia for daily limits, when a slot frees for comments. */
  until?: string;
  /** Which input failed (only with code "validation", or "unauthenticated" when the profile is missing). */
  field?: string;
};

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly limit?: LimitReason;
  readonly until?: string;
  readonly field?: string;

  constructor(code: DataErrorCode, message: string, details: DataErrorDetails = {}) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.limit = details.limit;
    this.until = details.until;
    this.field = details.field;
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
