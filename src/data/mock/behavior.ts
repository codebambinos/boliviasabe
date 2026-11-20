// Fake latency and failure modes for the mock adapter.
// Modes are read once at startup from the URL: ?mock=slow | offline | error | stellar-error
import { DataError } from '../errors';

export type MockMode = 'normal' | 'slow' | 'offline' | 'error' | 'stellar-error';

const MODES: readonly MockMode[] = ['slow', 'offline', 'error', 'stellar-error'];

function readMode(): MockMode {
  if (typeof window === 'undefined') return 'normal';
  const value = new URLSearchParams(window.location.search).get('mock');
  return MODES.find((mode) => mode === value) ?? 'normal';
}

export const mockMode: MockMode = readMode();

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function latency(): number {
  if (mockMode === 'slow') return 2500;
  return 300 + Math.floor(Math.random() * 301); // 300 to 600 ms
}

function isOffline(): boolean {
  return mockMode === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/** Runs a mock operation like a network call: waits, then fails or resolves. */
export async function simulate<T>(operation: () => T | Promise<T>): Promise<T> {
  await wait(latency());
  if (isOffline()) throw new DataError('offline', 'No connection');
  if (mockMode === 'error') throw new DataError('server', 'Simulated server error');
  return operation();
}
