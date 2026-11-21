// Public surface of the data layer. Screens import from here only ("../data"),
// never from ./mock, ./api or @supabase/supabase-js.

export * from './hooks/session';
export * from './hooks/signs';
export * from './hooks/questions';
export * from './hooks/threads';
export * from './hooks/saved';
export * from './hooks/reports';
export * from './hooks/wallet';
export * from './hooks/activity';

export type * from './types';
export type { ListQuery, NewQuestion, NewSign, ProfileInput, SavedItems } from './api';
export { DataError, isDataError, type DataErrorCode, type LimitReason } from './errors';
export {
  BOLIVIA_TIME_ZONE,
  CITIES,
  DEFAULT_CITY,
  MAX_TAGS,
  PAGE_SIZE,
  REPORT_REASONS,
  SUGGESTED_ZONES,
  TAGS,
} from './catalog';
