"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-16 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
    )
  }

  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
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
          {isDark ? '🌙' : '☀️'}
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
  )
}