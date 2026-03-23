"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { CondominiosList } from '@/components/CondominiosList'
import Link from 'next/link'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Condominio = any

export default function CondominiosPage() {
  const [condominios, setCondominios] = useState<Condominio[]>([])
  const [loading, setLoading] = useState(true)

  const [sincronizando, setSincronizando] = useState(false)
  const [syncProgresso, setSyncProgresso] = useState<{ processados: number; total: number; mensagem: string } | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const carregar = async () => {
    try {
      const res = await api.get('/condominios/')
      setCondominios(res.data)
    } catch (e) {
      console.error('Erro ao buscar condomínios:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const handleSync = async () => {
    setSincronizando(true)
    setSyncMsg(null)
    setSyncError(null)
    setSyncProgresso(null)
    try {
      await api.post('/dev/sync-condominios/iniciar')

      // Polling a cada 2s até concluir
      const poll = setInterval(async () => {
        try {
          const res = await api.get('/dev/sync-condominios/progresso')
          const estado = res.data
          setSyncProgresso({ processados: estado.processados, total: estado.total, mensagem: estado.mensagem })

          if (estado.concluido) {
            clearInterval(poll)
            setSincronizando(false)
            setSyncProgresso(null)
            setSyncMsg(estado.mensagem)
            await carregar()
          }
        } catch {
          clearInterval(poll)
          setSincronizando(false)
          setSyncError('Erro ao consultar progresso.')
        }
      }, 2000)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as { message?: string })?.message || 'Erro ao iniciar sync.'
      setSyncError(String(msg))
      setSincronizando(false)
    }
  }

  const total = condominios.length
  const ativos = condominios.filter((c: Condominio) => c.ativo).length
  const inativos = total - ativos

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-6 sm:h-8 bg-blue-600 rounded-full" />
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Condomínios
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg ml-5">
                Gerencie todos os condomínios cadastrados no sistema
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={handleSync}
                disabled={sincronizando}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all disabled:opacity-60 w-full sm:w-auto"
              >
                {sincronizando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                  : <><span>🔄</span> Sincronizar Auvo</>
                }
              </button>
              <Link
                href="/condominios/novo"
                className="flex items-center justify-center gap-2 px-5 py-3 bg-brand text-white rounded-2xl font-black shadow-lg shadow-brand/20 hover:brightness-110 transition-all w-full sm:w-auto"
              >
                <span className="text-xl">+</span> Novo Condomínio
              </Link>
            </div>
          </div>

          {/* Progresso sync */}
          {sincronizando && syncProgresso && syncProgresso.total > 0 && (
            <div className="mt-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800/30 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                  Sincronizando condomínios do Auvo...
                </p>
                <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400">
                  {syncProgresso.processados} / {syncProgresso.total}
                </p>
              </div>
              <div className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((syncProgresso.processados / syncProgresso.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">{syncProgresso.mensagem}</p>
            </div>
          )}

          {/* Feedback sync */}
          {syncMsg && (
            <div className="mt-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl px-4 py-2.5">
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{syncMsg}</p>
            </div>
          )}
          {syncError && (
            <div className="mt-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{syncError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 -mt-4 sm:-mt-8 relative z-10">
        <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-4 lg:mb-8">
          <div className="group bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-2 lg:mb-4">
              <div className="p-2 lg:p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-xl lg:text-2xl">🏢</span>
              </div>
              <div className="px-2 lg:px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">TOTAL</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold mb-1">Total de Unidades</p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white">
              {loading ? '—' : total}
            </p>
          </div>

          <div className="group bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 lg:p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-2 lg:mb-4">
              <div className="p-2 lg:p-3 bg-green-100 dark:bg-green-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-xl lg:text-2xl">✓</span>
              </div>
              <div className="px-2 lg:px-3 py-1 bg-green-100 dark:bg-green-900/50 rounded-full">
                <span className="text-xs font-bold text-green-700 dark:text-green-400">ATIVOS</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-green-700 dark:text-green-400 font-semibold mb-1">Ativos</p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-green-700 dark:text-green-400">
              {loading ? '—' : ativos}
            </p>
          </div>

          <div className="group bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 p-4 lg:p-6 rounded-2xl border border-red-200 dark:border-red-800/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-2 lg:mb-4">
              <div className="p-2 lg:p-3 bg-red-100 dark:bg-red-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-xl lg:text-2xl">⊘</span>
              </div>
              <div className="px-2 lg:px-3 py-1 bg-red-100 dark:bg-red-900/50 rounded-full">
                <span className="text-xs font-bold text-red-700 dark:text-red-400">INATIVOS</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-red-700 dark:text-red-400 font-semibold mb-1">Inativos</p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-red-700 dark:text-red-400">
              {loading ? '—' : inativos}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Carregando condomínios...</p>
          </div>
        ) : (
          <CondominiosList initialData={condominios} />
        )}
      </div>
    </div>
  )
}
