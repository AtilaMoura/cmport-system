"use client"

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Image from 'next/image'

interface Produto {
  id: number
  auvo_id: number
  nome: string
  descricao: string
  valor_unitario: number
  estoque_total: number
  imagem_url: string
  ativo: boolean
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)

  const carregar = async (p = 1, s = '') => {
    setLoading(true)
    try {
      const res = await api.get('/produtos', {
        params: { page: p, search: s, page_size: 50 }
      })
      setProdutos(res.data.items)
      setTotal(res.data.total)
    } catch (e) {
      console.error('Erro ao buscar produtos:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar(page, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    
    if (searchTimeout) clearTimeout(searchTimeout)
    
    const timeout = setTimeout(() => {
      setPage(1)
      carregar(1, val)
    }, 500)
    
    setSearchTimeout(timeout)
  }

  const handleSync = async () => {
    setSincronizando(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const res = await api.post('/produtos/sync')
      setSyncMsg(`Sincronização concluída: ${res.data.novos} novos, ${res.data.atualizados} atualizados.`)
      setPage(1)
      await carregar(1, search)
    } catch (e: any) {
      setSyncError(e.response?.data?.detail || 'Erro ao sincronizar produtos.')
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Produtos Auvo
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Catálogo de produtos sincronizado da plataforma Auvo
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={sincronizando}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all disabled:opacity-60 w-full md:w-auto"
            >
              {sincronizando
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                : <><span>🔄</span> Sincronizar com Auvo</>
              }
            </button>
          </div>

          {/* Feedback sync */}
          {syncMsg && (
            <div className="mt-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{syncMsg}</p>
            </div>
          )}
          {syncError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{syncError}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros e Busca */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Buscar por nome ou descrição..."
              value={search}
              onChange={handleSearchChange}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm text-slate-900 dark:text-white"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-40">🔍</span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 font-semibold">
            {total} produtos encontrados
          </div>
        </div>

        {loading && produtos.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-20 text-center">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Carregando catálogo...</p>
          </div>
        ) : produtos.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-20 text-center">
              <p className="text-3xl mb-4">📭</p>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum produto encontrado.</p>
              {search && (
                <button 
                  onClick={() => { setSearch(''); carregar(1, ''); }}
                  className="mt-4 text-indigo-600 font-bold hover:underline"
                >
                  Limpar busca
                </button>
              )}
            </div>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Produto</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Código Auvo</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Preço</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Estoque</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {produtos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-700">
                              {p.imagem_url ? (
                                <Image src={p.imagem_url} alt={p.nome} fill className="object-cover" unoptimized />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl opacity-30">📦</div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {p.nome}
                              </p>
                              {p.descricao && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xs">{p.descricao}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                            #{p.auvo_id}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {p.valor_unitario ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.valor_unitario)) : '—'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <p className={`font-black ${p.estoque_total > 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>
                            {Number(p.estoque_total) || 0}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {p.ativo ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-500/10 dark:text-green-400">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-500/10 dark:text-slate-400">
                              Inativo
                            </span>
                          )}
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
          </>
        )}
      </div>
    </div>
  )
}
