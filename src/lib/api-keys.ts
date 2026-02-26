/**
 * Client-side API key management via localStorage
 * Keys are stored locally in the browser, never sent to our server for storage.
 * They are only sent to the respective AI provider's API endpoint.
 */

const STORAGE_KEY = 'rebarviz_api_keys';

export interface ApiKeyStore {
  deepseek?: string;
  qwen?: string;
  kimi?: string;
}

export function getApiKeys(): ApiKeyStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setApiKeys(keys: ApiKeyStore): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function getApiKey(providerId: string): string | undefined {
  const keys = getApiKeys();
  return keys[providerId as keyof ApiKeyStore];
}

export function setApiKey(providerId: string, key: string): void {
  const keys = getApiKeys();
  keys[providerId as keyof ApiKeyStore] = key;
  setApiKeys(keys);
}

export function clearApiKey(providerId: string): void {
  const keys = getApiKeys();
  delete keys[providerId as keyof ApiKeyStore];
  setApiKeys(keys);
}

/** Mask key for display: sk-abc...xyz */
export function maskKey(key: string): string {
  if (!key || key.length < 10) return key ? '••••••••' : '';
  return key.slice(0, 6) + '••••••' + key.slice(-4);
}
