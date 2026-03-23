"use client"

import { createContext, useContext, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, removeToken, decodeToken, isTokenValid, JwtPayload } from '@/lib/auth';

interface AuthState {
  user: JwtPayload | null;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, logout: () => {} });

// Inicializa o usuário lendo o cookie uma única vez (lazy initializer — sem useEffect)
function initUser(): JwtPayload | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (token && isTokenValid(token)) return decodeToken(token);
  removeToken();
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<JwtPayload | null>(initUser);

  function logout() {
    removeToken();
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
