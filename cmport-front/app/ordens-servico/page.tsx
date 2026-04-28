"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface OrdemServico {
  id: number
  task_id: number
  customer_description: string | null
  task_date: string | null
  task_type_description: string | null
  user_to_name: string | null
  finished: boolean
  task_status: number | null
  task_status_descricao: string | null
  duration: string | null
  task_url: string | null
  servico_id: number | null
  servico_tipo: string | null
  nota_fiscal_id: number | null
  nota_numero: string | null
  condominio_id: number | null
}

interface ListResponse {
  items: OrdemServico[]
  total: number
  page: number
  page_size: number
}

function statusBadge(os: OrdemServico) {
  const s = os.task_status
  if (s === 5)
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300">Com Pendência</span>
  if (s === 7)
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">Em Execução</span>
  if (os.finished || s === 1 || s === 2 || s === 3)
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300">Finalizada</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{os.task_status_descricao ?? '—'}</span>
}

function vinculoBadge(os: OrdemServico) {
  if (os.nota_numero)
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">NF {os.nota_numero}</span>
  if (os.servico_id)
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">Serviço #{os.servico_id}</span>
  return <span className="text-xs text-slate-400">—</span>
}

function formatDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('pt-BR')
}

function primeiroDiaMes() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
}

function hoje() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export default function OrdensServicoPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [dataInicio, setDataInicio] = useState(primeiroDiaMes())
  const [dataFim, setDataFim] = useState(hoje())
  const [search, setSearch] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null)

  // modal de sincronização
  const [modalSync, setModalSync] = useState(false)
  const [syncInicio, setSyncInicio] = useState(primeiroDiaMes())
  const [syncFim, setSyncFim] = useState(hoje())
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const carregar = useCallback(async (p: number = page) => {
    setLoading(true)
    setErro('')
    try {
      const params: Record<string, string | number> = { page: p, page_size: pageSize }
      if (dataInicio) params.data_inicio = dataInicio
      if (dataFim) params.data_fim = dataFim
      if (search) params.search = search
      if (statusFiltro !== '') params.status = Number(statusFiltro)

      const res = await api.get<ListResponse>('/ordens-servico', { params })
      setOrdens(res.data.items)
      setTotal(res.data.total)
      setPage(p)
    } catch {
      setErro('Erro ao carregar ordens de serviço.')
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim, search, statusFiltro, page, pageSize])

  useEffect(() => { carregar(1) }, [dataInicio, dataFim, statusFiltro]) // eslint-disable-line

  const buscar = (e: React.FormEvent) => { e.preventDefault(); carregar(1) }

  const baixarPdf = async (os: OrdemServico) => {
    setPdfLoadingId(os.task_id)
    try {
      const res = await api.get(`/ordens-servico/${os.task_id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `os_${os.task_id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF não disponível. Sincronize as OSs para atualizar os links.')
    } finally {
      setPdfLoadingId(null)
    }
  }

  const sincronizar = async () => {
    setSyncLoading(true)
    setSyncMsg('')
    try {
      const res = await api.post('/ordens-servico/sincronizar', { date_start: syncInicio, date_end: syncFim })
      const d = res.data
      setSyncMsg(`✅ ${d.sincronizadas} OSs — ${d.novas} novas, ${d.atualizadas} atualizadas (${d.periodo})`)
      carregar(1)
    } catch {
      setSyncMsg('❌ Erro ao sincronizar com o Auvo.')
    } finally {
      setSyncLoading(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ordens de Serviço</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {total} OS encontradas no período
          </p>
        </div>
        <button
          onClick={() => { setModalSync(true); setSyncMsg('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Sincronizar com Auvo
        </button>
      </div>

      {/* Filtros */}
      <form onSubmit={buscar} className="flex flex-wrap gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Data início</label>
          <input
            type="date" value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Data fim</label>
          <input
            type="date" value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <select
            value={statusFiltro}
            onChange={e => setStatusFiltro(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="">Todos</option>
            <option value="0">Não Finalizada</option>
            <option value="1">Finalizada (Auto)</option>
            <option value="2">Finalizada (Manual)</option>
            <option value="3">Finalizada</option>
            <option value="5">Com Pendência</option>
            <option value="7">Em Execução</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className="text-xs font-medium text-slate-500">Buscar cliente</label>
          <input
            type="text" value={search} placeholder="Nome do condomínio..."
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* Erro */}
      {erro && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-700 dark:text-red-400">
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Carregando...</div>
        ) : ordens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-sm font-medium">Nenhuma OS encontrada</p>
            <p className="text-xs">Ajuste o filtro ou sincronize com o Auvo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">OS #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Data</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Técnico</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Duração</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">CMPort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ordens.map(os => (
                  <tr key={os.task_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/ordens-servico/${os.task_id}`}
                          className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                        >
                          #{os.task_id}
                        </Link>
                        {os.task_url && (
                          <button
                            onClick={() => baixarPdf(os)}
                            disabled={pdfLoadingId === os.task_id}
                            title="Baixar PDF da OS"
                            className="p-1 rounded text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                          >
                            {pdfLoadingId === os.task_id ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="12" y1="18" x2="12" y2="12" />
                                <polyline points="9 15 12 18 15 15" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-48">
                      <span className="truncate block text-slate-900 dark:text-white font-medium" title={os.customer_description ?? ''}>
                        {os.customer_description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(os.task_date)}
                    </td>
                    <td className="px-4 py-3 max-w-40">
                      <span className="truncate block text-slate-600 dark:text-slate-400 text-xs" title={os.task_type_description ?? ''}>
                        {os.task_type_description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {os.user_to_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">
                      {os.duration ?? '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(os)}</td>
                    <td className="px-4 py-3">{vinculoBadge(os)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              Página {page} de {totalPages} — {total} registros
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => carregar(page - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => carregar(page + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de sincronização */}
      {modalSync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sincronizar com Auvo</h2>
              <button
                onClick={() => setModalSync(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Escolha o período para importar OSs do Auvo. OSs já existentes serão atualizadas.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Data início</label>
                <input
                  type="date" value={syncInicio}
                  onChange={e => setSyncInicio(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Data fim</label>
                <input
                  type="date" value={syncFim}
                  onChange={e => setSyncFim(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
            {syncMsg && (
              <div className={`p-3 rounded-xl text-sm ${syncMsg.startsWith('✅') ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                {syncMsg}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalSync(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={sincronizar}
                disabled={syncLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
