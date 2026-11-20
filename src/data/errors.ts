// The only error type the data layer rejects with. Screens pick the wiki message from `code`.

export type DataErrorCode =
  | 'offline'
  | 'server'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'limit';

export type LimitReason = 'questions_per_day' | 'open_questions' | 'urgent_active' | 'insufficient_balance';

type DataErrorDetails = {
  /** Which limit was hit (only with code "limit"). */
  limit?: LimitReason;
  /** ISO date when the limit resets: next midnight in Bolivia for daily limits. */
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
