// TODO: Replace with Redis SET + TTL in production for multi-instance support.

const MAX_ENTRIES = 10_000;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

const processedKeys = new Map<string, number>();

export const isDuplicateEvent = (idempotencyKey: string): boolean => {
  const now = Date.now();

  // Evict expired entries when we hit the cap
  if (processedKeys.size >= MAX_ENTRIES) {
    for (const [key, timestamp] of processedKeys) {
      if (now - timestamp > TTL_MS) {
        processedKeys.delete(key);
      }
    }
  }

  if (processedKeys.has(idempotencyKey)) {
    const timestamp = processedKeys.get(idempotencyKey)!;
    if (now - timestamp < TTL_MS) {
      return true;
    }
  }

  processedKeys.set(idempotencyKey, now);
  return false;
};
