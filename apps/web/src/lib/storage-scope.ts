let scope: string | undefined;
export function setStorageScope(userId?: string) { scope = userId; }
export function storageKey(key: string) { return scope ? `${key}:${scope}` : key; }
