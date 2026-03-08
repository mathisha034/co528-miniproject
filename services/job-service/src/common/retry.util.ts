/**
 * Exponential backoff retry utility.
 * Retries `fn` up to `maxRetries` times with delays: 1s, 2s, 4s (base * 2^attempt).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err as Error;
      // Do not retry on deterministic database errors
      if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) {
        throw err;
      }
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}
