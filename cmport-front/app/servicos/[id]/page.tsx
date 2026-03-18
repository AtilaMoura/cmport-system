"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: string;
  valor: number;
  parcelas: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  observacao: string | null;
  descricao_servico: string | null;
  status: string;
}

interface Boleto {
  id: number;
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
  situacao: 'EMABERTO' | 'PAGO' | 'CANCELADO' | 'EXPIRADO' | 'VENCIDO' | 'BAIXADO';
  numero_parcela: number;
  total_parcelas: number;
  forma_pagamento: string;
  banco_pagamento: string | null;
  observacao: string | null;
}

const SITUACAO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dot: 'bg-blue-500' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',         dot: 'bg-red-500' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',    dot: 'bg-teal-500' },
};

const FORMA_LABEL: Record<string, string> = {
  BOLETO_INTER: 'Boleto Inter', BOLETO_ITAU: 'Boleto Itaú', PIX: 'PIX',
  DINHEIRO: 'Dinheiro', TRANSFERENCIA: 'Transferência', CHEQUE: 'Cheque',
};

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function pd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
}

export default function ServicoDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [servico, setServico] = useState<Servico | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [notaFiscal, setNotaFiscal] = useState<NotaFiscal | null>(null);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Ações
  const [desvinculandoNota, setDesvinculandoNota] = useState(false);
  const [deletandoBoletoId, setDeletandoBoletoId] = useState<number | null>(null);

  // Form
  const [tipo, setTipo] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricao, setDescricao] = useState('');

  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (id) carregarDados();
  }, [id]);

  const carregarDados = async () => {
    if (!id) return;
    try {
      const { data: s } = await api.get(`/servicos/${id}`);
      setServico(s);
      setTipo(s.tipo);
      setDataServico(s.data_servico);
      setDescricao(s.descricao || '');

      const condoRes = await api.get(`/condominios/${s.condominio_id}`);
      setCondominio(condoRes.data);

      if (s.nota_fiscal_id) {
        const [notaRes, boletosRes] = await Promise.all([
          api.get(`/notas-fiscais/${s.nota_fiscal_id}`),
          api.get(`/boletos/nota/${s.nota_fiscal_id}`),
        ]);
        setNotaFiscal(notaRes.data);
        setBoletos(boletosRes.data || []);
      } else {
        setNotaFiscal(null);
        setBoletos([]);
      }
    } catch {
      alert('Serviço não encontrado');
      router.push('/servicos');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!id) return;
    try {
      await api.put(`/servicos/${id}`, { tipo, data_servico: dataServico, descricao: descricao || null });
      setEditando(false);
      carregarDados();
    } catch {
      alert('Erro ao atualizar serviço');
    }
  };

  const handleDesvinculatNota = async () => {
    if (!id || !notaFiscal) return;
    if (!confirm(`Desvincular a nota fiscal #${notaFiscal.numero_nota} deste serviço? O serviço continuará existindo, mas sem nota vinculada.`)) return;
    setDesvinculandoNota(true);
    try {
      await api.put(`/servicos/${id}`, { nota_fiscal_id: null });
      await carregarDados();
    } catch {
      alert('Erro ao desvincular nota.');
    } finally {
      setDesvinculandoNota(false);
    }
  };

  const handleDeletarBoleto = async (boletoId: number) => {
    if (!confirm('Remover este boleto do sistema local? (Não cancela no Banco Inter)')) return;
    setDeletandoBoletoId(boletoId);
    try {
      await api.delete(`/boletos/${boletoId}`);
      setBoletos(prev => prev.filter(b => b.id !== boletoId));
    } catch {
      alert('Erro ao remover boleto.');
    } finally {
      setDeletandoBoletoId(null);
    }
  };

  const handleExcluir = async () => {
    if (!id) return;
    try {
      await api.delete(`/servicos/${id}`, { params: { motivo: motivo || 'Exclusão solicitada pelo usuário' } });
      router.push('/servicos');
    } catch {
      alert('Erro ao excluir serviço');
    }
  };

  if (loading || !servico) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando serviço...</p>
        </div>
      </div>
    );
  }

  const gradColor = servico.tipo === 'manutencao' ? 'from-purple-500 to-purple-600' : 'from-blue-500 to-blue-600';
  const icon = servico.tipo === 'manutencao' ? '🛠️' : '🔧';
  const nome = servico.tipo === 'manutencao' ? 'Manutenção Preventiva' : 'Assistência Técnica';

  const totalPago = boletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length;
  const valorBruto = boletos.reduce((s, b) => s + b.valor_nominal, 0);
  const valorRecebido = boletos.reduce((s, b) => s + (b.valor_total_recebido || 0), 0);

  // Detecção de inconsistências
  const totalEsperado = notaFiscal?.parcelas ?? 0;
  const tolerancia = notaFiscal ? notaFiscal.valor * 0.40 : 0;
  const valorEsperadoParcela = notaFiscal && totalEsperado > 0 ? notaFiscal.valor / totalEsperado : 0;
  const boletosExcedentes = totalEsperado > 0 && boletos.length > totalEsperado;
  const boletosValorErrado = notaFiscal
    ? boletos.filter(b => Math.abs(b.valor_nominal - valorEsperadoParcela) > tolerancia)
    : [];
  const temInconsistencia = boletosExcedentes || boletosValorErrado.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <Link href="/servicos" className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors group">
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar
            </Link>
            <div className="flex gap-2">
              {!editando ? (
                <>
                  <button onClick={() => setEditando(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editar
                  </button>
                  <button onClick={() => setModalExcluir(true)} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Excluir
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditando(false); carregarDados(); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:brightness-105 transition-all">Cancelar</button>
                  <button onClick={handleSalvar} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Salvar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* Hero */}
        <div className={`bg-gradient-to-br ${gradColor} rounded-3xl p-8 shadow-2xl text-white relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 pointer-events-none" />
          <div className="relative flex items-start justify-between flex-wrap gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg text-3xl shrink-0">{icon}</div>
              <div>
                <p className="text-sm opacity-80 mb-0.5">Serviço #{servico.id}</p>
                <h1 className="text-3xl font-black tracking-tight">{nome}</h1>
                <p className="text-base opacity-90 mt-1">
                  {condominio?.nome || '—'} · {pd(servico.data_servico)}
                </p>
              </div>
            </div>
            {/* Resumo financeiro rápido */}
            <div className="flex gap-4 flex-wrap">
              {notaFiscal && (
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                  <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Valor Nota</p>
                  <p className="text-xl font-black">{fmt(notaFiscal.valor)}</p>
                </div>
              )}
              {boletos.length > 0 && (
                <>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Cobrado</p>
                    <p className="text-xl font-black">{fmt(valorBruto)}</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Recebido</p>
                    <p className="text-xl font-black">{fmt(valorRecebido)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Banner de inconsistência */}
        {temInconsistencia && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 rounded-2xl p-5 flex items-start gap-4">
            <span className="text-2xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-black text-amber-800 dark:text-amber-300 text-base mb-1">Inconsistência detectada nos boletos</p>
              <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
                {boletosExcedentes && (
                  <li>• Esta nota tem <strong>{totalEsperado} parcela(s)</strong> mas {boletos.length} boleto(s) vinculado(s). Provavelmente 1 ou mais boletos pertencem a outra nota.</li>
                )}
                {boletosValorErrado.map(b => (
                  <li key={b.id}>• Boleto #{b.id} tem valor <strong>{fmt(b.valor_nominal)}</strong>, mas o esperado para esta nota é ≈<strong>{fmt(valorEsperadoParcela)}</strong> (diferença de {fmt(Math.abs(b.valor_nominal - valorEsperadoParcela))}).</li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                Use o botão 🗑️ no boleto incorreto para removê-lo desta nota. O boleto não é cancelado no Inter.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">

            {/* Dados do Serviço */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📋</span> {editando ? 'Editar Serviço' : 'Dados do Serviço'}
                </h2>
              </div>
              <div className="p-6">
                {editando ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tipo</label>
                      <select value={tipo} onChange={e => setTipo(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none">
                        <option value="manutencao">🛠️ Manutenção Preventiva</option>
                        <option value="assistencia">🔧 Assistência Técnica</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data do Serviço</label>
                      <input type="date" value={dataServico} onChange={e => setDataServico(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Descrição</label>
                      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={5}
                        placeholder="Descreva os serviços realizados..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo</p>
                        <p className="font-bold text-slate-900 dark:text-white">{icon} {nome}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data do Serviço</p>
                        <p className="font-bold text-slate-900 dark:text-white">{pd(servico.data_servico)}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Descrição</p>
                      <p className="text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                        {servico.descricao || <span className="text-slate-400 italic">Sem descrição</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nota Fiscal Vinculada — detalhes completos */}
            {notaFiscal ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-800/30 flex items-center justify-between">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">📄</span> Nota Fiscal Vinculada
                  </h2>
                  <div className="flex items-center gap-2">
                    <Link href={`/notas/${notaFiscal.id}`}
                      className="px-3 py-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Abrir nota
                    </Link>
                    <button onClick={handleDesvinculatNota} disabled={desvinculandoNota}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-lg hover:brightness-105 transition-all disabled:opacity-50 flex items-center gap-1">
                      {desvinculandoNota
                        ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m1.415-8.328a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" /></svg>}
                      Desvincular
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número</p>
                      <p className="font-black text-slate-900 dark:text-white">{notaFiscal.numero_nota}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo</p>
                      <p className="font-bold text-slate-900 dark:text-white">{notaFiscal.tipo}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Parcelas</p>
                      <p className="font-bold text-slate-900 dark:text-white">{notaFiscal.parcelas}x</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3">
                      <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-1">Valor</p>
                      <p className="font-black text-green-700 dark:text-green-300 text-lg">{fmt(notaFiscal.valor)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${notaFiscal.data_pagamento ? 'bg-green-50 dark:bg-green-500/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Vencimento</p>
                      <p className="font-bold text-slate-900 dark:text-white">{pd(notaFiscal.data_vencimento)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${notaFiscal.data_pagamento ? 'bg-green-50 dark:bg-green-500/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Pagamento</p>
                      <p className={`font-bold ${notaFiscal.data_pagamento ? 'text-green-700 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {notaFiscal.data_pagamento ? pd(notaFiscal.data_pagamento) : 'Não pago'}
                      </p>
                    </div>
                  </div>
                  {/* Status geral */}
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
                    notaFiscal.data_pagamento
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                  }`}>
                    <span>{notaFiscal.data_pagamento ? '✅' : '⏳'}</span>
                    {notaFiscal.data_pagamento ? 'Nota Paga' : 'Nota Pendente'}
                    <span className="ml-auto font-normal opacity-70 text-xs">status: {notaFiscal.status}</span>
                  </div>
                  {notaFiscal.descricao_servico && (
                    <div className="mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Descrição da nota</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{notaFiscal.descricao_servico}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center shadow-sm">
                <span className="text-4xl mb-3 block">📄</span>
                <p className="text-slate-500 dark:text-slate-400 font-semibold">Sem nota fiscal vinculada</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Este serviço não está associado a nenhuma nota fiscal.</p>
              </div>
            )}

            {/* Boletos */}
            {boletos.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-200 dark:border-indigo-800/30 flex items-center justify-between">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">🏦</span> Boletos
                  </h2>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {totalPago}/{boletos.length} pago(s) · {fmt(valorRecebido)} recebido(s)
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {boletos.map(b => {
                    const cfg = SITUACAO_CONFIG[b.situacao];
                    const isDeleting = deletandoBoletoId === b.id;
                    const eInconsistente = boletosValorErrado.some(x => x.id === b.id) || (boletosExcedentes && boletos.indexOf(b) >= totalEsperado);
                    return (
                      <div key={b.id} className={`p-5 ${eInconsistente ? 'bg-amber-50 dark:bg-amber-500/5 border-l-4 border-amber-400' : ''}`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg?.dot}`} />
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {b.total_parcelas > 1 ? `Parcela ${b.numero_parcela}/${b.total_parcelas}` : 'À vista'}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg?.cls}`}>{cfg?.label}</span>
                            {eInconsistente && (
                              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                ⚠️ Suspeito — verificar vínculo
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeletarBoleto(b.id)}
                            disabled={isDeleting}
                            title="Remover boleto do sistema local"
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                          >
                            {isDeleting
                              ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Valor</p>
                            <p className="font-black text-slate-900 dark:text-white">{fmt(b.valor_nominal)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Emissão</p>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{pd(b.data_emissao)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Vencimento</p>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{pd(b.data_vencimento)}</p>
                          </div>
                          {b.data_pagamento && (
                            <div>
                              <p className="text-xs text-green-600 dark:text-green-400 uppercase font-bold mb-0.5">Pago em</p>
                              <p className="font-bold text-green-700 dark:text-green-400 text-sm">{pd(b.data_pagamento)}</p>
                            </div>
                          )}
                          {b.valor_total_recebido != null && (
                            <div>
                              <p className="text-xs text-green-600 dark:text-green-400 uppercase font-bold mb-0.5">Recebido</p>
                              <p className="font-bold text-green-700 dark:text-green-400 text-sm">{fmt(b.valor_total_recebido)}</p>
                            </div>
                          )}
                          {(b.valor_juros > 0 || b.valor_multa > 0) && (
                            <div>
                              <p className="text-xs text-orange-500 uppercase font-bold mb-0.5">Juros/Multa</p>
                              <p className="font-bold text-orange-600 dark:text-orange-400 text-sm">+{fmt(b.valor_juros + b.valor_multa)}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Forma</p>
                            <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                              {FORMA_LABEL[b.forma_pagamento] || b.forma_pagamento}
                              {b.banco_pagamento && ` · ${b.banco_pagamento}`}
                            </p>
                          </div>
                        </div>

                        {b.nosso_numero && (
                          <p className="mt-2 text-xs font-mono text-slate-400 dark:text-slate-500">
                            Nosso nº: {b.nosso_numero} {b.seu_numero ? `· Seu nº: ${b.seu_numero}` : ''}
                          </p>
                        )}
                        {b.observacao && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 italic">{b.observacao}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Condomínio */}
            {condominio && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>🏢</span> Condomínio</h3>
                </div>
                <div className="p-4">
                  <Link href={`/condominios/${condominio.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-sm font-black shrink-0">
                      {condominio.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">{condominio.nome}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{condominio.cnpj || 'Sem CNPJ'}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>
            )}

            {/* Status geral */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>📊</span> Status Financeiro</h3>
              </div>
              <div className="p-4 space-y-2">
                {!notaFiscal && (
                  <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
                    Sem nota fiscal vinculada
                  </div>
                )}
                {notaFiscal && boletos.length === 0 && (
                  <div className="px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-xs font-bold text-orange-600 dark:text-orange-400">
                    Nota sem boleto emitido
                  </div>
                )}
                {boletos.length > 0 && (
                  <div className={`px-3 py-2 rounded-lg text-xs font-bold ${
                    totalPago === boletos.length
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : totalPago > 0
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                  }`}>
                    {totalPago === boletos.length ? '✅ Totalmente pago' : totalPago > 0 ? `⏳ ${totalPago}/${boletos.length} parcelas pagas` : '⏳ Aguardando pagamento'}
                  </div>
                )}
              </div>
            </div>

            {/* Metadados */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>ℹ️</span> Metadados</h3>
              </div>
              <div className="p-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">ID</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">#{servico.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Criado</span>
                  <span className="font-bold text-slate-900 dark:text-white">{new Date(servico.criado_em).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Atualizado</span>
                  <span className="font-bold text-slate-900 dark:text-white">{new Date(servico.atualizado_em).toLocaleDateString('pt-BR')}</span>
                </div>
                {servico.nota_fiscal_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Nota ID</span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">#{servico.nota_fiscal_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Exclusão */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4"><span className="text-3xl">⚠️</span></div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Confirmar Exclusão</h2>
              <p className="text-slate-600 dark:text-slate-400">O serviço será arquivado no histórico de exclusões.</p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Motivo (opcional)</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                placeholder="Ex: Serviço registrado incorretamente..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalExcluir(false)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">Cancelar</button>
              <button onClick={handleExcluir} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">Excluir Serviço</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
