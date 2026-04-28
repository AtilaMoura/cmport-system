"use client"

import { useEffect, useState, use } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'

interface Item {
  id: number
  tipo: string
  nome: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

interface Orcamento {
  id: number
  auvo_public_id: number
  customer_name: string
  condominio_id: number | null
  external_code: string
  request_date: string
  expire_date: string
  observations: string
  internal_note: string
  public_link: string
  current_stage_description: string
  is_cancelled: boolean
  discount_value: number
  total_products: number
  total_services: number
  total_additional_costs: number
  gross_total_value: number
  net_total_value: number
  itens: Item[]
  task_ids: { task_id: number }[]
}

export default function OrcamentoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    try {
      const res = await api.get(`/orcamentos/${id}`)
      setOrcamento(res.data)
    } catch (e) {
      console.error('Erro ao carregar orçamento:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!orcamento) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <p className="text-xl font-bold mb-4">Orçamento não encontrado.</p>
      <Link href="/orcamentos" className="text-blue-600 font-bold hover:underline">Voltar para lista</Link>
    </div>
  )

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 mb-8">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Link href="/orcamentos" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors mb-6">
            ← Voltar para lista
          </Link>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-black text-slate-900 dark:text-white">Orçamento #{orcamento.auvo_public_id}</h1>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  orcamento.is_cancelled ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {orcamento.is_cancelled ? 'Cancelado' : orcamento.current_stage_description}
                </span>
              </div>
              <p className="text-xl text-slate-600 dark:text-slate-400 font-medium">{orcamento.customer_name}</p>
            </div>
            {orcamento.public_link && (
              <a 
                href={orcamento.public_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:scale-105 transition-all text-center"
              >
                Ver PDF no Auvo
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-8">
          {/* Itens */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Itens do Orçamento</h2>
              <span className="text-xs font-bold text-slate-400 uppercase">{orcamento.itens.length} itens</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Item</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-center">Qtd</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-right">Unitário</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {orcamento.itens.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{item.tipo === 'PRODUTO' ? '📦' : item.tipo === 'SERVICO' ? '🛠️' : '🚚'}</span>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white leading-tight">{item.nome}</p>
                            {item.descricao && <p className="text-[10px] text-slate-500 line-clamp-1">{item.descricao}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-400">{Number(item.quantidade)}</td>
                      <td className="px-6 py-4 text-right text-sm text-slate-500">{fmt(item.valor_unitario)}</td>
                      <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">{fmt(item.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Totais do Card */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Produtos:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(orcamento.total_products)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Serviços:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(orcamento.total_services)}</span>
              </div>
              {Number(orcamento.discount_value) > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span className="font-medium">Desconto:</span>
                  <span className="font-bold">-{fmt(orcamento.discount_value)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="font-black text-slate-900 dark:text-white">Total Líquido:</span>
                <span className="font-black text-blue-600 dark:text-blue-400">{fmt(orcamento.net_total_value)}</span>
              </div>
            </div>
          </div>

          {/* Notas e Observações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Observações (Público)</h3>
              <p className="text-slate-700 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">
                {orcamento.observations || 'Nenhuma observação informada.'}
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-500/5 p-6 rounded-3xl border border-amber-200 dark:border-amber-800/30 shadow-sm">
              <h3 className="text-[10px] font-black text-amber-600/60 uppercase mb-3 tracking-widest">Nota Interna</h3>
              <p className="text-slate-700 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">
                {orcamento.internal_note || 'Nenhuma nota interna registrada.'}
              </p>
            </div>
          </div>
        </div>

        {/* Coluna Lateral */}
        <div className="space-y-8">
          {/* Info Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-6 tracking-widest">Informações Gerais</h3>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Data da Solicitação</p>
                <p className="font-bold text-slate-900 dark:text-white">
                  {orcamento.request_date ? new Date(orcamento.request_date).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Validade</p>
                <p className={`font-bold ${orcamento.expire_date && new Date(orcamento.expire_date) < new Date() ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                  {orcamento.expire_date ? new Date(orcamento.expire_date).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Código Externo</p>
                <p className="font-mono font-bold text-slate-700 dark:text-slate-400">{orcamento.external_code || '—'}</p>
              </div>
            </div>
          </div>

          {/* OSs Vinculadas */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Ordens de Serviço</h3>
            {orcamento.task_ids.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {orcamento.task_ids.map(t => (
                  <Link 
                    key={t.task_id} 
                    href={`/ordens-servico/${t.task_id}`}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all uppercase tracking-tight"
                  >
                    OS #{t.task_id}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">Nenhuma OS vinculada a este orçamento.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
