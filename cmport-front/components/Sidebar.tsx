"use client" // Necessário para usar o ThemeToggle

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export default function Sidebar() {
  const menuItems = [
    { name: '📊 Dashboard', href: '/' },
    { name: '🏢 Condomínios', href: '/condominios' },
    { name: '🛠️ Serviços', href: '/servicos' },
    { name: '📄 Notas Fiscais', href: '/notas' },
  ];

  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-screen p-4 transition-colors duration-300">
      {/* Logo / Nome do Projeto */}
      <div className="mb-8 px-2">
        <h2 className="text-2xl font-bold text-brand">CMPort</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Sistema de Gestão</p>
      </div>

      {/* Menu de Navegação */}
      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <Link 
            key={item.href} 
            href={item.href}
            className="block p-3 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-brand/10 hover:text-brand transition-all font-medium"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {/* Rodapé da Sidebar com o Botão de Tema */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-2">
          <span className="text-sm font-medium text-slate-500">Aparência</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}