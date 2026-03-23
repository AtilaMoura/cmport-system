// lib/auth.ts — Utilitários de token JWT via cookie

const COOKIE_NAME = 'cmport_token';
const COOKIE_DAYS = 1; // 1 dia (token expira em 8h de qualquer forma)

export interface JwtPayload {
  sub: string;
  nome: string;
  role: 'DEV' | 'ADMIN' | 'USUARIO';
  exp: number;
}

export function setToken(token: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + COOKIE_DAYS);
  document.cookie = `${COOKIE_NAME}=${token}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function removeToken(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenValid(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}
