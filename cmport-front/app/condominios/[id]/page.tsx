/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Servico {
  id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  numero_os: string | null;
  condominio_id: number;
  orcamento_id: number | null;
  criado_em: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string | null;
  tipo: string;
  status: string;
  parcelas: number;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  cliente_nome: string | null;
  descricao_servico: string | null;
}

interface Contrato {
  id: number;
  condominio_id: number;
  ativo: boolean;
  data_inicio: string | null;
  data_termino: string | null;
  dia_vencimento_padrao: number | null;
  valor_fixo_mensal: string | null;
  descricao_padrao_servico: string | null;
  observacoes_contrato: string | null;
  criado_em: string;
  atualizado_em: string | null;
}

interface ContratoForm {
  ativo: boolean;
  data_inicio: string;
  data_termino: string;
  dia_vencimento_padrao: string;
  valor_fixo_mensal: string;
  descricao_padrao_servico: string;
  observacoes_contrato: string;
}

const formContratoInicial: ContratoForm = {
  ativo: true,
  data_inicio: '',
  data_termino: '',
  dia_vencimento_padrao: '',
  valor_fixo_mensal: '',
  descricao_padrao_servico: '',
  observacoes_contrato: '',
};

function fmtData(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtValor(v: string | number | null) {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DetalhesCondominio() {
  const params = useParams();
  const id = params.id as string;
  const [condo, setCondo] = useState<any>(null);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [activeTab, setActiveTab] = useState<'contatos' | 'manutencoes' | 'assistencias' | 'notas' | 'orcamentos' | 'contrato'>('contatos');

  const [modalContrato, setModalContrato] = useState(false);
  const [formContrato, setFormContrato] = useState<ContratoForm>(formContratoInicial);
  const [erroContrato, setErroContrato] = useState<string | null>(null);
  const [salvandoContrato, setSalvandoContrato] = useState(false);

  const carregarContrato = async () => {
    try {
      const res = await api.get(`/contratos/${id}`);
      setContrato(res.data);
    } catch {
      setContrato(null);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get(`/condominios/${id}`),
      api.get(`/orcamentos/condominio/${id}`),
      api.get(`/contratos/${id}`).catch(() => null),
      api.get(`/servicos/condominio/${id}`).catch(() => ({ data: [] })),
      api.get(`/notas-fiscais?condominio_id=${id}`).catch(() => ({ data: [] })),
    ])
      .then(([rCondo, rOrc, rContrato, rServicos, rNotas]) => {
        setCondo(rCondo.data);
        setOrcamentos(rOrc.data);
        setContrato(rContrato?.data ?? null);
        setServicos(rServicos.data ?? []);
        setNotasFiscais(rNotas.data ?? []);
      })
      .catch(() => setNotFoundState(true))
      .finally(() => setLoading(false));
  }, [id]);

  const abrirModalContrato = () => {
    setErroContrato(null);
    if (contrato) {
      setFormContrato({
        ativo: contrato.ativo,
        data_inicio: contrato.data_inicio ?? '',
        data_termino: contrato.data_termino ?? '',
        dia_vencimento_padrao: contrato.dia_vencimento_padrao != null ? String(contrato.dia_vencimento_padrao) : '',
        valor_fixo_mensal: contrato.valor_fixo_mensal ?? '',
        descricao_padrao_servico: contrato.descricao_padrao_servico ?? '',
        observacoes_contrato: contrato.observacoes_contrato ?? '',
      });
    } else {
      setFormContrato(formContratoInicial);
    }
    setModalContrato(true);
  };

  const salvarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContrato.data_inicio) { setErroContrato('Informe a data de início.'); return; }
    setSalvandoContrato(true);
    setErroContrato(null);
    try {
      const payload = {
        ativo: formContrato.ativo,
        data_inicio: formContrato.data_inicio,
        data_termino: formContrato.data_termino || null,
        dia_vencimento_padrao: formContrato.dia_vencimento_padrao ? Number(formContrato.dia_vencimento_padrao) : null,
        valor_fixo_mensal: formContrato.valor_fixo_mensal ? Number(formContrato.valor_fixo_mensal) : null,
        descricao_padrao_servico: formContrato.descricao_padrao_servico || null,
        observacoes_contrato: formContrato.observacoes_contrato || null,
      };
      if (contrato) {
        await api.patch(`/contratos/${contrato.id}`, payload);
      } else {
        await api.post('/contratos', { condominio_id: Number(id), ...payload });
      }
      setModalContrato(false);
      await carregarContrato();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErroContrato(msg || 'Erro ao salvar contrato.');
    } finally {
      setSalvandoContrato(false);
    }
  };

  const toggleAtivo = async () => {
    if (!contrato) return;
    try {
      await api.patch(`/contratos/${contrato.id}/toggle-ativo`);
      await carregarContrato();
    } catch {
      alert('Erro ao alterar status do contrato.');
    }
  };

  const deletarContrato = async () => {
    if (!contrato) return;
    if (!confirm('Excluir este contrato? A ação é registrada no histórico de auditoria.')) return;
    try {
      await api.delete(`/contratos/${contrato.id}`);
      setContrato(null);
    } catch {
      alert('Erro ao excluir contrato.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400 font-semibold">Carregando...</div>
      </div>
    );
  }

  if (notFoundState || !condo) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 lg:py-6">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/condominios"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-semibold transition-colors group shrink-0"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Voltar para lista</span>
            </Link>

            <div className="flex gap-2">
              <Link
                href={`/condominios/${id}/editar`}
                className="px-3 py-2 sm:px-5 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                Editar Cadastro
              </Link>
              <button className="px-3 py-2 sm:px-4 sm:py-2 bg-red-500 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-red-600 transition-colors">
                Desativar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* Hero Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-4 sm:p-8 mb-4 lg:mb-8 shadow-2xl shadow-blue-500/20 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />

          <div className="relative">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                  <span className="text-2xl sm:text-3xl">🏢</span>
                </div>
                <div>
                  <h1 className="text-xl sm:text-3xl lg:text-4xl font-black mb-1 sm:mb-2 tracking-tight leading-tight">
                    {condo.nome}
                  </h1>
                  <p className="text-blue-100 text-sm sm:text-lg font-medium">
                    {condo.razao_social || 'Sem razão social cadastrada'}
                  </p>
                </div>
              </div>

              <span className={`self-start shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-lg ${
                condo.ativo ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}>
                {condo.ativo ? '✓ ATIVO' : '⊘ INATIVO'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">CNPJ</p>
                <p className="font-mono text-sm sm:text-lg font-bold">
                  {condo.cnpj || 'Não informado'}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">ID do Sistema</p>
                <p className="font-mono text-sm sm:text-lg font-bold">
                  #{condo.id.toString().padStart(6, '0')}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">Cadastrado em</p>
                <p className="text-sm sm:text-lg font-bold">
                  {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Endereço */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📍</span>
                  Endereço Completo
                </h2>
              </div>
              <div className="p-4 sm:p-6">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                  {condo.endereco?.rua || 'Endereço não informado'}
                </p>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                    <span className="font-semibold">Coordenadas GPS:</span>
                    <span className="font-mono text-xs sm:text-sm">{condo.endereco?.latitude}, {condo.endereco?.longitude}</span>
                  </div>
                  <p className="text-xs text-slate-500 italic">
                    🗺️ Integração com Google Maps em breve
                  </p>
                </div>
              </div>
            </div>

            {/* Observações */}
            {condo.observacao && (
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/50 overflow-hidden shadow-sm">
                <div className="px-4 sm:px-6 py-4 bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-900/50">
                  <h2 className="font-bold text-base sm:text-lg text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <span className="text-xl">📝</span>
                    Observações Importantes
                  </h2>
                </div>
                <div className="p-4 sm:p-6">
                  <p className="text-amber-900 dark:text-amber-100 leading-relaxed">
                    {condo.observacao}
                  </p>
                </div>
              </div>
            )}

            {/* Tabs Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button
                  onClick={() => setActiveTab('contatos')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'contatos' ? 'border-blue-600 text-blue-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">👥</span>
                  Contatos
                </button>
                <button
                  onClick={() => setActiveTab('orcamentos')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'orcamentos' ? 'border-blue-600 text-blue-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">📋</span>
                  Orçamentos
                </button>
                <button
                  onClick={() => setActiveTab('manutencoes')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'manutencoes' ? 'border-blue-600 text-blue-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">🛠️</span>
                  Manutenções
                  {servicos.filter(s => s.tipo === 'manutencao').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {servicos.filter(s => s.tipo === 'manutencao').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('assistencias')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'assistencias' ? 'border-blue-600 text-blue-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">🔧</span>
                  Assistências
                  {servicos.filter(s => s.tipo === 'assistencia').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {servicos.filter(s => s.tipo === 'assistencia').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('notas')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'notas' ? 'border-blue-600 text-blue-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">📄</span>
                  Notas Fiscais
                  {notasFiscais.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {notasFiscais.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('contrato')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    activeTab === 'contrato' ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-base sm:text-lg">📃</span>
                  Contrato
                  {contrato && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      contrato.ativo
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      {contrato.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  )}
                </button>
              </div>

              <div className="p-4 sm:p-6">
                {activeTab === 'contatos' && (
                  condo.contatos && condo.contatos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {condo.contatos.map((contato: any) => (
                        <div
                          key={contato.id}
                          className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all bg-slate-50 dark:bg-slate-800/50"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-lg flex items-center justify-center">
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                  {contato.nome.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {contato.nome}
                              </p>
                            </div>
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-md">
                              {contato.funcao}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                              <span>📞</span>
                              <span className="font-medium">{contato.telefone || 'Sem telefone'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                              <span>📧</span>
                              <span className="font-medium truncate">{contato.email || 'Sem email'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <span className="text-3xl">👥</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        Nenhum contato cadastrado
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-4">
                        Adicione contatos para facilitar a comunicação
                      </p>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                        Adicionar Contato
                      </button>
                    </div>
                  )
                )}

                {activeTab === 'orcamentos' && (
                  orcamentos && orcamentos.length > 0 ? (
                    <div className="space-y-3">
                      {orcamentos.map((o: any) => (
                        <Link
                          key={o.id}
                          href={`/orcamentos/${o.auvo_public_id}`}
                          className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600">
                              <span className="text-xl">📋</span>
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                                Orçamento #{o.auvo_public_id}
                              </p>
                              <p className="text-xs text-slate-500">
                                {o.request_date ? new Date(o.request_date).toLocaleDateString('pt-BR') : 'Sem data'} • {o.current_stage_description}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-slate-900 dark:text-white">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.net_total_value)}
                            </p>
                            <span className="text-[10px] font-bold text-blue-600 uppercase">Ver detalhes →</span>
                          </div>
                        </Link>
                      ))}
                      <div className="pt-4 text-center">
                        <Link href={`/orcamentos?search=${condo.nome}`} className="text-sm font-bold text-blue-600 hover:underline">
                          Ver todos os orçamentos do condomínio
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <span className="text-3xl">📋</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        Nenhum orçamento encontrado
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-4">
                        Sincronize os orçamentos do Auvo para visualizá-los aqui
                      </p>
                      <Link href="/orcamentos" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                        Ir para Sincronização
                      </Link>
                    </div>
                  )
                )}

                {(activeTab === 'manutencoes' || activeTab === 'assistencias') && (() => {
                  const tipo = activeTab === 'manutencoes' ? 'manutencao' : 'assistencia';
                  const lista = servicos.filter(s => s.tipo === tipo);
                  if (lista.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                          <span className="text-3xl">{tipo === 'manutencao' ? '🛠️' : '🔧'}</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                          Nenhum registro encontrado
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                          {tipo === 'manutencao' ? 'Manutenções preventivas' : 'Assistências técnicas'} aparecerão aqui após sincronização com o Auvo.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {lista.map(s => (
                        <Link
                          key={s.id}
                          href={`/servicos/${s.id}`}
                          className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                              <span className="text-base">{tipo === 'manutencao' ? '🛠️' : '🔧'}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {s.numero_os && (
                                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">OS #{s.numero_os}</span>
                                )}
                                <span className="text-xs text-slate-500">
                                  {s.data_servico ? new Date(s.data_servico + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                </span>
                                {s.nota_fiscal_id && (
                                  <span className="text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 px-1.5 py-0.5 rounded-full">NF vinculada</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 line-clamp-1">
                                {s.descricao || 'Sem descrição'}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-blue-600 uppercase shrink-0 group-hover:underline">Ver →</span>
                        </Link>
                      ))}
                    </div>
                  );
                })()}

                {activeTab === 'notas' && (
                  notasFiscais.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <span className="text-3xl">📄</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        Nenhuma nota fiscal encontrada
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm">
                        As notas importadas via XML para este condomínio aparecerão aqui.
                      </p>
                      <Link href="/notas/importar" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
                        Importar Notas
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notasFiscais.map(n => (
                        <Link
                          key={n.id}
                          href={`/notas/${n.id}`}
                          className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                              <span className="text-base">📄</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {n.numero_nota && <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{n.numero_nota}</span>}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  n.status === 'autorizada'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                    : n.status === 'cancelada'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                }`}>{n.status}</span>
                                <span className="text-xs text-slate-400 capitalize">{n.tipo}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Venc: {n.data_vencimento ? new Date(n.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                                {n.data_pagamento && ` · Pago: ${new Date(n.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-slate-900 dark:text-white text-sm">
                              {n.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <span className="text-[10px] font-bold text-blue-600 uppercase group-hover:underline">Ver →</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )
                )}

                {activeTab === 'contrato' && (
                  contrato ? (
                    <div className="space-y-4">
                      {/* Cabeçalho do contrato */}
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-slate-900 dark:text-white">Contrato</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            contrato.ativo
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                          }`}>
                            {contrato.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={abrirModalContrato}
                            className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={toggleAtivo}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                              contrato.ativo
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 hover:bg-amber-200'
                                : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 hover:bg-green-200'
                            }`}
                          >
                            {contrato.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={deletarContrato}
                            className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 rounded-lg hover:bg-red-200 transition-colors"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>

                      {/* Dados de vigência */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Início</p>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{fmtData(contrato.data_inicio)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Término</p>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{fmtData(contrato.data_termino)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Vence dia</p>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">
                            {contrato.dia_vencimento_padrao ? `Dia ${contrato.dia_vencimento_padrao}` : '—'}
                          </p>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl p-3 border border-indigo-200 dark:border-indigo-500/30">
                          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">Valor Mensal</p>
                          <p className="font-black text-indigo-700 dark:text-indigo-400 text-sm">
                            {fmtValor(contrato.valor_fixo_mensal) ?? '—'}
                          </p>
                        </div>
                      </div>

                      {/* Descrição padrão */}
                      {contrato.descricao_padrao_servico && (
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Descrição Padrão do Serviço</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            {contrato.descricao_padrao_servico}
                          </p>
                        </div>
                      )}

                      {/* Observações */}
                      {contrato.observacoes_contrato && (
                        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-4 border border-amber-200 dark:border-amber-500/30">
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">Observações</p>
                          <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                            {contrato.observacoes_contrato}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <span className="text-3xl">📃</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        Nenhum contrato cadastrado
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                        Cadastre um contrato para habilitar o auto-preenchimento de valores e datas nos corpos de nota.
                      </p>
                      <button
                        onClick={abrirModalContrato}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        + Cadastrar Contrato
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:space-y-6">
            {/* Ações Rápidas */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 sm:p-6 shadow-xl shadow-blue-500/20 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span>
                Ações Rápidas
              </h3>
              <div className="space-y-2 sm:space-y-3">
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>📄</span>
                  Gerar Nota Fiscal
                </button>
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>🛠️</span>
                  Nova Manutenção
                </button>
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>👥</span>
                  Adicionar Contato
                </button>
                <button
                  onClick={() => { setActiveTab('contrato'); abrirModalContrato(); }}
                  className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                >
                  <span>📃</span>
                  {contrato ? 'Editar Contrato' : 'Cadastrar Contrato'}
                </button>
              </div>
            </div>

            {/* Estatísticas */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  Estatísticas
                </h3>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Contatos</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">
                    {condo.contatos?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Manutenções</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">
                    {servicos.filter(s => s.tipo === 'manutencao').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Assistências</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">
                    {servicos.filter(s => s.tipo === 'assistencia').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Notas Fiscais</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">{notasFiscais.length}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Contrato</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    contrato
                      ? contrato.ativo
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {contrato ? (contrato.ativo ? 'Ativo' : 'Inativo') : 'Sem contrato'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Contrato */}
      {modalContrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">
              {contrato ? 'Editar Contrato' : 'Novo Contrato'}
            </h2>
            <form onSubmit={salvarContrato} className="space-y-4">
              {/* Ativo */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ativo_contrato"
                  checked={formContrato.ativo}
                  onChange={e => setFormContrato(f => ({ ...f, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <label htmlFor="ativo_contrato" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Contrato ativo
                </label>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Início <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formContrato.data_inicio}
                    onChange={e => setFormContrato(f => ({ ...f, data_inicio: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Término
                  </label>
                  <input
                    type="date"
                    value={formContrato.data_termino}
                    onChange={e => setFormContrato(f => ({ ...f, data_termino: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Auto-preenchimento */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                  Auto-preenchimento do corpo de nota (opcional)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Dia de Vencimento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={formContrato.dia_vencimento_padrao}
                      onChange={e => setFormContrato(f => ({ ...f, dia_vencimento_padrao: e.target.value }))}
                      placeholder="Ex: 10"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Valor Fixo Mensal (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formContrato.valor_fixo_mensal}
                      onChange={e => setFormContrato(f => ({ ...f, valor_fixo_mensal: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Descrição Padrão do Serviço
                  </label>
                  <textarea
                    value={formContrato.descricao_padrao_servico}
                    onChange={e => setFormContrato(f => ({ ...f, descricao_padrao_servico: e.target.value }))}
                    rows={2}
                    placeholder="Ex: Serviços de manutenção predial preventiva e corretiva..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Observações do Contrato
                  </label>
                  <textarea
                    value={formContrato.observacoes_contrato}
                    onChange={e => setFormContrato(f => ({ ...f, observacoes_contrato: e.target.value }))}
                    rows={2}
                    placeholder="Informações adicionais sobre o contrato..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                </div>
              </div>

              {erroContrato && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-xl p-3 font-semibold">
                  {erroContrato}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalContrato(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoContrato}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {salvandoContrato ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
