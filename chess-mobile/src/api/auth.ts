import { apiFetch, setToken, clearToken } from './client';

interface AuthResponse {
  token: string;
  user: { id: number; username: string };
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe(): Promise<{ user: { id: number; username: string } }> {
  return apiFetch('/api/auth/me');
}

export async function logout(): Promise<void> {
  await clearToken();
}

export async function storeToken(token: string): Promise<void> {
  await setToken(token);
}
