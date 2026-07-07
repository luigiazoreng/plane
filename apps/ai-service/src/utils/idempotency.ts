const processedKeys = new Set<string>();

export const isDuplicateEvent = (idempotencyKey: string) => {
    if (processedKeys.has(idempotencyKey)) {
        return true;
    }
    processedKeys.add(idempotencyKey);
    return false;
};
