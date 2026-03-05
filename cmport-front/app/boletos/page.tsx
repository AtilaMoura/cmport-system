"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Boleto {
  id: number;
  nota_fiscal_id: number;
  codigo_solicitacao: string | null;
  nosso_numero: string | null;
  seu_numero: string | null;
  valor_nominal: number;
  valor_juros: number;
  valor_multa: number;
  valor_total_recebido: number | null;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  tipo_cobranca: string;
  situacao: 'EMABERTO' | 'PAGO' | 'CANCELADO' | 'EXPIRADO' | 'VENCIDO' | 'BAIXADO';
  criado_em: string;
}

const SITUACAO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dot: 'bg-blue-500' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',         dot: 'bg-red-500' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',    dot: 'bg-teal-500' },
};

export default function BoletosPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);
  const [filtroSituacao, setFiltroSituacao] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [modalCancelar, setModalCancelar] = useState<{ codigo: string; nosso_numero: string | null } | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  useEffect(() => {
    carregarBoletos();
  }, []);

  const carregarBoletos = async () => {
    try {
      const res = await api.get('/boletos/');
      setBoletos(res.data);
    } catch (error) {
      console.error('Erro ao carregar boletos:', error);
    } finally {
      setLoading(false);
    }
  };

  const sincronizarStatus = async () => {
    setSincronizando(true);
    try {
      const res = await api.post('/boletos/sincronizar');
      const { atualizados, erros } = res.data;
      await carregarBoletos();
      alert(`Sincronização concluída!\nAtualizados: ${atualizados}${erros.length > 0 ? `\nErros: ${erros.length}` : ''}`);
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      alert('Erro ao sincronizar status dos boletos.');
    } finally {
      setSincronizando(false);
    }
  };

  const confirmarCancelamento = async () => {
    if (!modalCancelar) return;
    setCancelandoId(modalCancelar.codigo);
    setModalCancelar(null);
    try {
      await api.post(`/boletos/${modalCancelar.codigo}/cancelar`);
      await carregarBoletos();
    } catch (error) {
      console.error('Erro ao cancelar boleto:', error);
      alert('Erro ao cancelar boleto. Verifique a API Inter.');
    } finally {
      setCancelandoId(null);
      setMotivoCancelamento('');
    }
  };

  const baixarPdf = async (codigo: string) => {
    setBaixandoPdf(codigo);
    try {
      const res = await api.get(`/boletos/${codigo}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `boleto_${codigo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao baixar PDF do boleto.');
    } finally {
      setBaixandoPdf(null);
    }
  };

  const boletosFiltrados = boletos.filter(b => {
    const matchSituacao = filtroSituacao === 'todos' || b.situacao === filtroSituacao;
    const matchSearch =
      (b.nosso_numero?.toLowerCase().includes(search.toLowerCase())) ||
      (b.seu_numero?.toLowerCase().includes(search.toLowerCase())) ||
      (b.codigo_solicitacao?.toLowerCase().includes(search.toLowerCase())) ||
      String(b.nota_fiscal_id).includes(search);
    return matchSituacao && matchSearch;
  });

  const stats = {
    total: boletos.length,
    emAberto: boletos.filter(b => b.situacao === 'EMABERTO').length,
    pagos: boletos.filter(b => b.situacao === 'PAGO').length,
    vencidos: boletos.filter(b => b.situacao === 'VENCIDO').length,
    valorAberto: boletos.filter(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO').reduce((s, b) => s + b.valor_nominal, 0),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando boletos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href="/notas"
                  className="text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Boletos</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-12">
                Gestão de cobranças via Banco Inter
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={sincronizarStatus}
                disabled={sincronizando}
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {sincronizando ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                ) : (
                  <><span className="text-xl">🔄</span> Sincronizar Status</>
                )}
              </button>
              <Link
                href="/notas"
                className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">📄</span> Notas Fiscais
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total, cls: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800', textCls: 'text-slate-900 dark:text-white' },
            { label: 'Em Aberto', value: stats.emAberto, cls: 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800/50', textCls: 'text-blue-700 dark:text-blue-400' },
            { label: 'Pagos', value: stats.pagos, cls: 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/50', textCls: 'text-green-700 dark:text-green-400' },
            { label: 'Vencidos', value: stats.vencidos, cls: 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/50', textCls: 'text-orange-700 dark:text-orange-400' },
            {
              label: 'Valor em Aberto',
              value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorAberto),
              cls: 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800/50',
              textCls: 'text-indigo-700 dark:text-indigo-400 text-2xl'
            },
          ].map(card => (
            <div key={card.label} className={`${card.cls} p-5 rounded-2xl shadow-sm`}>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">{card.label}</p>
              <p className={`text-3xl font-black ${card.textCls}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Buscar</label>
              <input
                type="text"
                placeholder="Nosso número, seu número, nota..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['todos', 'EMABERTO', 'PAGO', 'VENCIDO', 'CANCELADO', 'EXPIRADO', 'BAIXADO'].map(s => (
              <button
                key={s}
                onClick={() => setFiltroSituacao(s)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  filtroSituacao === s
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {s === 'todos' ? 'Todos' : SITUACAO_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  {['Nota Fiscal', 'Nosso Número', 'Valor', 'Emissão', 'Vencimento', 'Pagamento', 'Situação', 'Ações'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {boletosFiltrados.map((boleto) => {
                  const cfg = SITUACAO_CONFIG[boleto.situacao];
                  const podeAcao = boleto.situacao === 'EMABERTO' || boleto.situacao === 'VENCIDO';
                  return (
                    <tr key={boleto.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <Link
                          href={`/notas/${boleto.nota_fiscal_id}`}
                          className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Nota #{boleto.nota_fiscal_id}
                        </Link>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-mono text-sm text-slate-700 dark:text-slate-300">
                          {boleto.nosso_numero || '—'}
                        </p>
                        {boleto.seu_numero && (
                          <p className="text-xs text-slate-400 font-mono">{boleto.seu_numero}</p>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.valor_nominal)}
                        </p>
                        {(boleto.valor_juros > 0 || boleto.valor_multa > 0) && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.valor_juros + boleto.valor_multa)} juros/multa
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {new Date(boleto.data_emissao).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {new Date(boleto.data_vencimento).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {boleto.data_pagamento
                            ? new Date(boleto.data_pagamento).toLocaleDateString('pt-BR')
                            : '—'}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg?.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot}`} />
                          {cfg?.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {boleto.codigo_solicitacao && (
                            <button
                              onClick={() => baixarPdf(boleto.codigo_solicitacao!)}
                              disabled={baixandoPdf === boleto.codigo_solicitacao}
                              title="Baixar PDF"
                              className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all disabled:opacity-50"
                            >
                              {baixandoPdf === boleto.codigo_solicitacao ? (
                                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                            </button>
                          )}
                          {podeAcao && boleto.codigo_solicitacao && (
                            <button
                              onClick={() => {
                                setModalCancelar({ codigo: boleto.codigo_solicitacao!, nosso_numero: boleto.nosso_numero });
                                setMotivoCancelamento('');
                              }}
                              disabled={cancelandoId === boleto.codigo_solicitacao}
                              title="Cancelar boleto"
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                            >
                              {cancelandoId === boleto.codigo_solicitacao ? (
                                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {boletosFiltrados.length === 0 && (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <span className="text-3xl">🏦</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {boletos.length === 0 ? 'Nenhum boleto gerado' : 'Nenhum boleto encontrado'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {boletos.length === 0
                  ? 'Acesse a lista de Notas Fiscais para gerar boletos'
                  : 'Ajuste os filtros para encontrar os boletos'}
              </p>
              {boletos.length === 0 && (
                <Link
                  href="/notas"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
                >
                  <span>📄</span> Ver Notas Fiscais
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmar cancelamento */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Cancelar Boleto</h2>
              <p className="text-slate-600 dark:text-slate-400">
                Boleto <span className="font-mono font-bold">{modalCancelar.nosso_numero || modalCancelar.codigo}</span> será cancelado no Banco Inter. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                rows={3}
                placeholder="Ex: Pagamento realizado por outro meio..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModalCancelar(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
              >
                Cancelar Boleto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
