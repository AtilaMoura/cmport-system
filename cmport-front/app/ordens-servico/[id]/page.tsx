"use client"

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

interface OrdemServico {
  id: number
  task_id: number
  customer_description: string | null
  task_date: string | null
  task_type_description: string | null
  user_to_name: string | null
  orientation: string | null
  report: string | null
  finished: boolean
  task_status: number | null
  task_status_descricao: string | null
  check_in_date: string | null
  check_out_date: string | null
  duration: string | null
  address: string | null
  signature_url: string | null
  task_url: string | null
  sincronizado_em: string | null
  servico_id: number | null
  servico_tipo: string | null
  nota_fiscal_id: number | null
  nota_numero: string | null
  condominio_id: number | null
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR')
}

function formatDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('pt-BR')
}

function statusColor(os: OrdemServico) {
  const s = os.task_status
  if (s === 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'
  if (s === 7) return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
  if (os.finished || s === 1 || s === 2 || s === 3)
    return 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-900 dark:text-white font-medium">{value || '—'}</p>
    </div>
  )
}

export default function OrdemServicoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [os, setOs] = useState<OrdemServico | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    api.get<OrdemServico>(`/ordens-servico/${id}`)
      .then(r => setOs(r.data))
      .catch(() => setErro('OS não encontrada.'))
      .finally(() => setLoading(false))
  }, [id])

  const baixarPdf = async () => {
    if (!os) return
    setPdfLoading(true)
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
      setPdfLoading(false)
    }
  }

  if (loading)
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Carregando...</div>

  if (erro || !os)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <p className="text-sm">{erro || 'OS não encontrada.'}</p>
        <Link href="/ordens-servico" className="text-blue-600 dark:text-blue-400 text-sm hover:underline">← Voltar</Link>
      </div>
    )

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/ordens-servico" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 mb-2">
            ← Ordens de Serviço
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            OS #{os.task_id}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{os.customer_description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {os.task_url && (
            <button
              onClick={baixarPdf}
              disabled={pdfLoading}
              title="Baixar PDF da OS"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 18 15 15" />
              </svg>
              {pdfLoading ? 'Baixando...' : 'Baixar PDF'}
            </button>
          )}
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${statusColor(os)}`}>
            {os.task_status_descricao ?? '—'}
          </span>
        </div>
      </div>

      {/* Dados principais */}
      <Card title="Informações da OS">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Campo label="Data agendada" value={formatDate(os.task_date)} />
          <Campo label="Tipo" value={os.task_type_description} />
          <Campo label="Técnico responsável" value={os.user_to_name} />
          <Campo label="Duração" value={os.duration} />
        </div>
        {os.address && (
          <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 mb-0.5">Endereço</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{os.address}</p>
          </div>
        )}
      </Card>

      {/* Check-in / Check-out */}
      <Card title="Execução">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Campo label="Check-in" value={formatDateTime(os.check_in_date)} />
          <Campo label="Check-out" value={formatDateTime(os.check_out_date)} />
          <Campo label="Finalizada" value={os.finished ? 'Sim' : 'Não'} />
        </div>
      </Card>

      {/* Orientação */}
      {os.orientation && (
        <Card title="Orientação / Descrição">
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {os.orientation}
          </p>
        </Card>
      )}

      {/* Relatório */}
      {os.report && (
        <Card title="Relatório do Técnico">
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {os.report}
          </p>
        </Card>
      )}

      {/* Assinatura */}
      {os.signature_url && (
        <Card title="Assinatura do Cliente">
          <img
            src={os.signature_url}
            alt="Assinatura"
            className="max-h-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-2"
          />
        </Card>
      )}

      {/* Vínculos CMPort */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Serviço */}
        <Card title="Serviço no CMPort">
          {os.servico_id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Serviço #{os.servico_id}
                  {os.servico_tipo && ` — ${os.servico_tipo}`}
                </span>
              </div>
              <Link
                href={`/servicos/${os.servico_id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver serviço →
              </Link>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5 shrink-0" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">OS ainda não vinculada a um serviço no CMPort</p>
                <p className="text-xs text-slate-400 mt-1">O vínculo é feito pelo campo Número OS no cadastro do serviço</p>
              </div>
            </div>
          )}
        </Card>

        {/* Nota Fiscal */}
        <Card title="Nota Fiscal">
          {os.nota_fiscal_id && os.nota_numero ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  NF {os.nota_numero}
                </span>
              </div>
              <Link
                href={`/notas/${os.nota_fiscal_id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Abrir nota fiscal →
              </Link>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5 shrink-0" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma nota fiscal vinculada</p>
                <p className="text-xs text-slate-400 mt-1">
                  {os.servico_id ? 'O serviço existe mas ainda não tem nota emitida' : 'Vincule primeiro um serviço a esta OS'}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Rodapé */}
      <p className="text-xs text-slate-400 text-right">
        Sincronizado em {formatDateTime(os.sincronizado_em)}
      </p>
    </div>
  )
}
