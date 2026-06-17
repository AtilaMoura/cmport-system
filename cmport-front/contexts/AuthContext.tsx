"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, removeToken, decodeToken, isTokenValid, JwtPayload } from '@/lib/auth';

interface AuthState {
  user: JwtPayload | null;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<JwtPayload | null>(null);

  // Lê o cookie só no client, após hidratação, para evitar mismatch SSR/client
  useEffect(() => {
    const token = getToken();
    if (token && isTokenValid(token)) {
      setUser(decodeToken(token));
    } else {
      removeToken();
    }
  }, []);

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
