"use client"

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard',    icon: '📊', href: '/' },
    { name: 'Condomínios',  icon: '🏢', href: '/condominios' },
    { name: 'Serviços',     icon: '🛠️', href: '/servicos' },
    { name: 'Notas Fiscais',icon: '📄', href: '/notas' },
    { name: 'Boletos',      icon: '🏦', href: '/boletos' },
    { name: 'Dev / Teste',  icon: '⚙️', href: '/dev' },
  ];

  const fechar = () => setOpen(false);

  return (
    <>
      {/* ── Barra superior mobile (visível apenas abaixo de md) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {/* Ícone hamburguer SVG */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect y="3"  width="20" height="2" rx="1" />
            <rect y="9"  width="20" height="2" rx="1" />
            <rect y="15" width="20" height="2" rx="1" />
          </svg>
        </button>

        <div className="relative h-8 w-24">
          <Image src="/logo02.png" alt="CMPort" fill className="object-contain" />
        </div>
      </div>

      {/* ── Overlay escuro (mobile, quando drawer aberto) ── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={fechar}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={[
          // Posicionamento e dimensões
          'fixed inset-y-0 left-0 z-50 flex flex-col',
          'w-72 md:w-56 lg:w-64',
          // Cores e borda
          'bg-white dark:bg-slate-950',
          'border-r border-slate-200 dark:border-slate-800',
          // Transição de slide
          'transition-transform duration-300',
          // Mobile: escondida por padrão, visível quando open
          open ? 'translate-x-0' : '-translate-x-full',
          // md+: sempre visível
          'md:translate-x-0',
        ].join(' ')}
      >
        {/* Botão fechar — só no mobile dentro do drawer */}
        <div className="md:hidden flex justify-end p-3">
          <button
            onClick={fechar}
            aria-label="Fechar menu"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Logo ── */}
        <div className="px-4 py-3 lg:p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="relative rounded-xl shadow-lg overflow-hidden
                          w-32 h-16 md:w-28 md:h-14 lg:w-40 lg:h-20">
            <Image src="/logo02.png" alt="CMPort Logo" fill className="object-contain p-1" />
          </div>
        </div>

        {/* ── Navegação ── */}
        <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={fechar}
                className={[
                  'group flex items-center gap-3 px-3 py-2.5 lg:px-4 lg:py-3',
                  'rounded-xl font-semibold text-sm',
                  'transition-all duration-200 relative overflow-hidden',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white',
                ].join(' ')}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-900 dark:bg-blue-400 rounded-r-full" />
                )}
                <span className="text-lg lg:text-xl opacity-80 group-hover:scale-110 transition-transform shrink-0">
                  {item.icon}
                </span>
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className="p-3 lg:p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {/* Tema */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tema</span>
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <ThemeToggle />
          </div>

          {/* Card usuário — escondido no md para economizar espaço */}
          <div className="hidden lg:block px-2 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">AD</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">Administrador</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">admin@cmport.com</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
