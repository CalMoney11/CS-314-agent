/**
 * Server connection settings, kept in the iOS Keychain via expo-secure-store.
 * Optional build-time defaults: EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_TOKEN in mobile-app/.env
 * (gitignored). Values saved in the Settings screen win over the defaults.
 */
import * as SecureStore from 'expo-secure-store';

export type ServerConfig = { serverUrl: string; apiToken: string };

const URL_KEY = 'server_url';
const TOKEN_KEY = 'api_token';
// Readable from the background task while the phone is unlocked or after first unlock.
const STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let cached: ServerConfig | null = null;

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export async function getConfig(): Promise<ServerConfig> {
  if (cached) return cached;
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY, STORE_OPTS),
    SecureStore.getItemAsync(TOKEN_KEY, STORE_OPTS),
  ]);
  cached = {
    serverUrl: normalizeUrl(url ?? process.env.EXPO_PUBLIC_API_URL ?? ''),
    apiToken: (token ?? process.env.EXPO_PUBLIC_API_TOKEN ?? '').trim(),
  };
  return cached;
}

export async function saveConfig(cfg: ServerConfig): Promise<void> {
  const next = { serverUrl: normalizeUrl(cfg.serverUrl), apiToken: cfg.apiToken.trim() };
  await SecureStore.setItemAsync(URL_KEY, next.serverUrl, STORE_OPTS);
  await SecureStore.setItemAsync(TOKEN_KEY, next.apiToken, STORE_OPTS);
  cached = next;
}

export function isConfigured(cfg: ServerConfig): boolean {
  return cfg.serverUrl.startsWith('http') && cfg.apiToken.length > 0;
}
