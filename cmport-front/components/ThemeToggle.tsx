"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  // Inicializador lazy: lê localStorage diretamente no primeiro render do cliente
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('compact-mode') === 'true'
  })

  useEffect(() => {
    // Aplica a classe compact ao DOM na montagem
    if (isCompact) {
      document.documentElement.classList.add('compact')
    }
    // setMounted segue o padrão recomendado pelo next-themes para evitar hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) {
    return (
      <div className="w-16 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
    )
  }

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const toggleCompact = () => {
    const newCompactState = !isCompact
    setIsCompact(newCompactState)
    localStorage.setItem('compact-mode', String(newCompactState))
    
    if (newCompactState) {
      document.documentElement.classList.add('compact')
    } else {
      document.documentElement.classList.remove('compact')
    }
  }

  return (
    <div className="relative">
      {/* Menu de opções */}
      {showMenu && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fadeIn">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Aparência
            </p>
          </div>
          
          {/* Temas */}
          <div className="p-2 space-y-1">
            <button
              onClick={() => {
                setTheme('light')
                setShowMenu(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                theme === 'light' 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="text-xl">☀️</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Modo Claro</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tema claro sempre</p>
              </div>
              {theme === 'light' && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              onClick={() => {
                setTheme('dark')
                setShowMenu(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                theme === 'dark' 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="text-xl">🌙</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Modo Escuro</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tema escuro sempre</p>
              </div>
              {theme === 'dark' && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              onClick={() => {
                setTheme('system')
                setShowMenu(false)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                theme === 'system' 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="text-xl">💻</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Automático</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Segue o sistema</p>
              </div>
              {theme === 'system' && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>

          {/* Divisor */}
          <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />

          {/* Modo Compacto */}
          <div className="p-2">
            <button
              onClick={toggleCompact}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 transition-all"
            >
              <span className="text-xl">📏</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Modo Compacto</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Densidade visual</p>
              </div>
              <div className={`relative w-11 h-6 rounded-full transition-colors ${
                isCompact ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  isCompact ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Toggle principal */}
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`
          relative w-16 h-8 rounded-full transition-all duration-300 ease-in-out
          ${isDark ? 'bg-slate-700' : 'bg-blue-500'}
          hover:shadow-lg hover:shadow-blue-500/30
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950
        `}
        aria-label="Alternar tema"
      >
        {/* Toggle Circle */}
        <div
          className={`
            absolute top-1 w-6 h-6 rounded-full bg-white shadow-md
            flex items-center justify-center text-sm
            transition-all duration-300 ease-in-out
            ${isDark ? 'left-9' : 'left-1'}
          `}
        >
          <span className="transition-transform duration-300 hover:scale-110">
            {theme === 'system' ? '💻' : (isDark ? '🌙' : '☀️')}
          </span>
        </div>

        {/* Background Icons */}
        <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
          <span className={`text-xs transition-opacity duration-300 ${isDark ? 'opacity-30' : 'opacity-0'}`}>
            ☀️
          </span>
          <span className={`text-xs transition-opacity duration-300 ${isDark ? 'opacity-0' : 'opacity-30'}`}>
            🌙
          </span>
        </div>
      </button>

      {/* Backdrop para fechar o menu */}
      {showMenu && (
        <div 
          className="fixed inset-0 z-[-1]" 
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  )
}