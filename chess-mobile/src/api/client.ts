import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

export const TOKEN_KEY = 'chess_auth_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token   = await getToken();
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

  if (res.status === 401 && !path.includes('/api/auth/')) {
    await clearToken();
    router.replace('/(auth)/login');
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}
