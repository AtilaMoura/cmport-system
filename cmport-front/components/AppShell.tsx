"use client"

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import { ReactNode } from 'react';

// Rotas que NÃO exibem a Sidebar (páginas públicas)
const PUBLIC_ROUTES = ['/login'];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (isPublic) {
    // Página pública — sem Sidebar, sem padding
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
        <Sidebar />
        <main className="md:ml-56 lg:ml-64 pt-14 md:pt-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
