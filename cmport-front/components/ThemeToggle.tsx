"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Monta o componente apenas no cliente para evitar erros de hidratação
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-10 h-10" /> 
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 hover:ring-2 ring-blue-500 transition-all duration-300"
      aria-label="Trocar tema"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  )
}