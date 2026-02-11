"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function FloatingActionButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N = Nova Nota
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        router.push('/notas/importar');
      }
      
      // Ctrl/Cmd + S = Novo Serviço
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        router.push('/servicos/novo');
      }
      
      // Ctrl/Cmd + C = Novo Condomínio
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        router.push('/condominios/novo');
      }
      
      // Ctrl/Cmd + K = Mostrar atalhos
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowShortcuts(true);
      }
      
      // ESC = Fechar modais
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [router]);

  const actions = [
    {
      icon: '📄',
      label: 'Importar Notas',
      href: '/notas/importar',
      color: 'from-orange-500 to-orange-600',
      shortcut: 'Ctrl+N'
    },
    {
      icon: '🛠️',
      label: 'Novo Serviço',
      href: '/servicos/novo',
      color: 'from-purple-500 to-purple-600',
      shortcut: 'Ctrl+S'
    },
    {
      icon: '🏢',
      label: 'Novo Condomínio',
      href: '/condominios/novo',
      color: 'from-blue-500 to-blue-600',
      shortcut: 'Ctrl+C'
    }
  ];

  return (
    <>
      {/* FAB Principal */}
      <div className="fixed bottom-8 right-8 z-50">
        <div className="relative">
          {/* Ações expansíveis */}
          {isOpen && (
            <div className="absolute bottom-20 right-0 space-y-3 animate-fadeIn">
              {actions.map((action, index) => (
                <Link
                  key={action.label}
                  href={action.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 group"
                  style={{
                    animationDelay: `${index * 50}ms`
                  }}
                >
                  <span className="bg-white dark:bg-slate-800 px-3 py-2 rounded-lg shadow-lg text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {action.label}
                    <kbd className="ml-2 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono">
                      {action.shortcut}
                    </kbd>
                  </span>
                  <div className={`w-14 h-14 bg-gradient-to-br ${action.color} rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-transform cursor-pointer`}>
                    {action.icon}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Botão Principal */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-16 h-16 bg-gradient-to-br from-brand-dark to-brand rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-all group relative"
          >
            <svg
              className={`w-8 h-8 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            
            {/* Tooltip */}
            {!isOpen && (
              <div className="absolute right-full mr-3 px-3 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Ações Rápidas
                <kbd className="ml-2 px-2 py-1 bg-slate-700 rounded text-xs font-mono">
                  Ctrl+K
                </kbd>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Modal de Atalhos */}
      {showShortcuts && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowShortcuts(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full p-8 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <span className="text-3xl">⌨️</span>
                Atalhos de Teclado
              </h2>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <span className="font-semibold text-slate-900 dark:text-white">Importar Notas</span>
                    </div>
                    <kbd className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono font-bold shadow-sm">
                      Ctrl+N
                    </kbd>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🛠️</span>
                      <span className="font-semibold text-slate-900 dark:text-white">Novo Serviço</span>
                    </div>
                    <kbd className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono font-bold shadow-sm">
                      Ctrl+S
                    </kbd>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏢</span>
                      <span className="font-semibold text-slate-900 dark:text-white">Novo Condomínio</span>
                    </div>
                    <kbd className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono font-bold shadow-sm">
                      Ctrl+C
                    </kbd>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950/20 dark:to-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⌨️</span>
                      <span className="font-semibold text-slate-900 dark:text-white">Atalhos</span>
                    </div>
                    <kbd className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono font-bold shadow-sm">
                      Ctrl+K
                    </kbd>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Pressione <kbd className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs font-mono mx-1">ESC</kbd> para fechar
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}