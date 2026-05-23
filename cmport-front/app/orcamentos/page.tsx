"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'

interface Orcamento {
  id: number
  auvo_public_id: number
  customer_name: string
  condominio_id: number | null
  request_date: string
  gross_total_value: number
  net_total_value: number
  current_stage_description: string
  is_cancelled: boolean
}

export default function OrcamentosPage() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  
  // Sync state
  const [sincronizando, setSincronizando] = useState(false)
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const carregar = async (p = 1, s = '') => {
    setLoading(true)
    try {
      const res = await api.get('/orcamentos', {
        params: { page: p, search: s, page_size: 50 }
      })
      setOrcamentos(res.data.items)
      setTotal(res.data.total)
    } catch (e) {
      console.error('Erro ao buscar orçamentos:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar(page, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleSync = async () => {
    setSincronizando(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const res = await api.post('/orcamentos/sync', null, {
        params: { date_start: dateStart, date_end: dateEnd }
      })
      setSyncMsg(`Sincronização concluída: ${res.data.novos} novos, ${res.data.atualizados} atualizados.`)
      setPage(1)
      await carregar(1, search)
    } catch (e: any) {
      setSyncError(e.response?.data?.detail || 'Erro ao sincronizar orçamentos.')
    } finally {
      setSincronizando(false)
    }
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-blue-600 rounded-full" />
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Orçamentos Auvo
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Propostas comerciais sincronizadas da plataforma Auvo
              </p>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-end gap-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">De</label>
                <input 
                  type="date" 
                  value={dateStart} 
                  onChange={e => setDateStart(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Até</label>
                <input 
                  type="date" 
                  value={dateEnd} 
                  onChange={e => setDateEnd(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleSync}
                disabled={sincronizando}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:brightness-110 transition-all disabled:opacity-60 w-full lg:w-auto"
              >
                {sincronizando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                  : <><span>🔄</span> Sincronizar</>
                }
              </button>
            </div>
          </div>

          {/* Feedback sync */}
          {syncMsg && (
            <div className="mt-6 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{syncMsg}</p>
            </div>
          )}
          {syncError && (
            <div className="mt-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{syncError}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Busca e Stats */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Buscar por cliente, código ou estágio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && carregar(1, search)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-slate-900 dark:text-white"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-40">🔍</span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 font-semibold">
            {total} orçamentos sincronizados
          </div>
        </div>

        {loading && orcamentos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-20 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Carregando propostas...</p>
          </div>
        ) : orcamentos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-20 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum orçamento encontrado no período.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Código</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Data</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Estágio</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Valor Líquido</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orcamentos.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                          #{o.auvo_public_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{o.customer_name}</p>
                          {o.condominio_id ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 rounded-full font-bold">VINCULADO</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 rounded-full font-bold">NÃO VINCULADO</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                          {o.request_date ? new Date(o.request_date).toLocaleDateString('pt-BR') : '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          o.is_cancelled ? 'bg-red-100 text-red-700 dark:bg-red-500/10' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/10'
                        }`}>
                          {o.is_cancelled ? 'Cancelado' : (o.current_stage_description || 'Aberto')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-black text-slate-900 dark:text-white">
                          {fmt(o.net_total_value)}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link 
                          href={`/orcamentos/${o.auvo_public_id}`}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-all"
                        >
                          Detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="bg-slate-50 dark:bg-slate-800/30 px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-slate-50 transition-all"
              >
                Anterior
              </button>
              <span className="text-sm font-bold text-slate-500">
                Página {page} de {Math.max(1, Math.ceil(total / 50))}
              </span>
              <button
                onClick={() => setPage(prev => (prev * 50 < total ? prev + 1 : prev))}
                disabled={page * 50 >= total}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-slate-50 transition-all"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
