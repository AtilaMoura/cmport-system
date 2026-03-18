"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ParcelaDisplay {
  parcela: number;
  valor: number;
  data: string | null;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: 'ASSISTENCIA' | 'MANUTENCAO' | 'OUTROS';
  parcelas: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  condominio_id: number | null;
  observacao: string | null;
  criado_em: string;
  parcelas_json: ParcelaDisplay[] | null;
  valor_boleto_parcela: number | null;
  status: string;
}

interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
}

interface Boleto {
  id: number;
  codigo_solicitacao: string | null;
  nosso_numero: string | null;
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
  banco_pagamento?: string | null;
  observacao?: string | null;
}

const SITUACAO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dot: 'bg-blue-500' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',         dot: 'bg-red-500' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',    dot: 'bg-teal-500' },
};

const FORMAS_PAGAMENTO = ['PIX', 'DINHEIRO', 'TRANSFERENCIA', 'CHEQUE', 'BOLETO_ITAU', 'BOLETO_INTER'] as const;
type FormaPagamento = typeof FORMAS_PAGAMENTO[number];

const FORMA_PAGAMENTO_LABELS: Record<FormaPagamento, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  BOLETO_ITAU: 'Boleto Itau',
  BOLETO_INTER: 'Boleto Inter',
};

const FORMA_PAGAMENTO_ICONS: Record<FormaPagamento, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Din',
  TRANSFERENCIA: 'TED',
  CHEQUE: 'CHQ',
  BOLETO_ITAU: 'Ita',
  BOLETO_INTER: 'Int',
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const parseDateLocal = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface ModalCobrancaState {
  open: boolean;
  parcela: ParcelaDisplay | null;
}

interface ModalPagamentoState {
  open: boolean;
  boleto: Boleto | null;
}

interface CobrancaForm {
  forma_pagamento: FormaPagamento;
  data_vencimento: string;
  valor: string;
  ja_pago: boolean;
  data_pagamento: string;
  valor_recebido: string;
  observacao: string;
}

interface PagamentoForm {
  data_pagamento: string;
  valor_recebido: string;
  forma_pagamento: FormaPagamento;
  observacao: string;
}

export default function NotaDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();

  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [gerandoParcelas, setGerandoParcelas] = useState(false);

  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [clienteNome, setClienteNome] = useState('');

  const [id, setId] = useState<string | null>(null);

  // Modal: Registrar Cobranca (create manual payment)
  const [modalCobranca, setModalCobranca] = useState<ModalCobrancaState>({ open: false, parcela: null });
  const [cobrancaForm, setCobrancaForm] = useState<CobrancaForm>({
    forma_pagamento: 'PIX',
    data_vencimento: '',
    valor: '',
    ja_pago: false,
    data_pagamento: '',
    valor_recebido: '',
    observacao: '',
  });
  const [submittingCobranca, setSubmittingCobranca] = useState(false);

  // Modal: Registrar Pagamento (mark existing boleto as paid)
  const [modalPagamento, setModalPagamento] = useState<ModalPagamentoState>({ open: false, boleto: null });
  const [pagamentoForm, setPagamentoForm] = useState<PagamentoForm>({
    data_pagamento: todayIso(),
    valor_recebido: '',
    forma_pagamento: 'PIX',
    observacao: '',
  });
  const [submittingPagamento, setSubmittingPagamento] = useState(false);

  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (id) {
      carregarDados();
    }
  }, [id]);

  const carregarDados = async () => {
    if (!id) return;

    try {
      const response = await api.get(`/notas-fiscais/${id}`);
      const notaData = response.data;
      setNota(notaData);

      setDataVencimento(notaData.data_vencimento);
      setDataPagamento(notaData.data_pagamento || '');
      setObservacao(notaData.observacao || '');
      setClienteNome(notaData.cliente_nome || '');

      const [condoRes, boletosRes] = await Promise.all([
        notaData.condominio_id ? api.get(`/condominios/${notaData.condominio_id}`) : Promise.resolve(null),
        api.get(`/boletos/nota/${id}`),
      ]);
      if (condoRes) setCondominio(condoRes.data);
      setBoletos(boletosRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar nota:', error);
      alert('Nota fiscal nao encontrada');
      router.push('/notas');
    } finally {
      setLoading(false);
    }
  };

  // Compute parcelas to display based on nota data
  const getParcelasDisplay = (nota: NotaFiscal): ParcelaDisplay[] => {
    if (nota.parcelas_json && nota.parcelas_json.length > 0) {
      return nota.parcelas_json;
    }
    if (nota.parcelas > 1) {
      return Array.from({ length: nota.parcelas }, (_, i) => ({
        parcela: i + 1,
        valor: nota.valor_boleto_parcela ?? nota.valor / nota.parcelas,
        data: null,
      }));
    }
    return [{ parcela: 1, valor: nota.valor, data: nota.data_vencimento }];
  };

  const handleGerarParcelasFaltantes = async () => {
    if (!id) return;
    if (!confirm('Gerar as parcelas faltantes no Banco Inter?')) return;
    setGerandoParcelas(true);
    try {
      const res = await api.post(`/boletos/gerar-parcelas-faltantes/${id}`);
      const { sucesso, erros } = res.data;
      await carregarDados();
      if (erros.length > 0) {
        alert(`${sucesso.length} parcela(s) gerada(s).\nErros: ${erros.map((e: { erro: string }) => e.erro).join(', ')}`);
      } else {
        alert(`${sucesso.length} parcela(s) gerada(s) com sucesso!`);
      }
    } catch {
      alert('Erro ao gerar parcelas faltantes.');
    } finally {
      setGerandoParcelas(false);
    }
  };

  const handleGerarInterParcela = async () => {
    if (!id) return;
    setGerandoParcelas(true);
    try {
      const res = await api.post(`/boletos/gerar-parcelas-faltantes/${id}`);
      const { sucesso, erros } = res.data;
      await carregarDados();
      if (erros.length > 0) {
        alert(`${sucesso.length} parcela(s) gerada(s).\nErros: ${erros.map((e: { erro: string }) => e.erro).join(', ')}`);
      } else {
        alert(`${sucesso.length} parcela(s) gerada(s) com sucesso!`);
      }
    } catch {
      alert('Erro ao gerar parcelas via Inter.');
    } finally {
      setGerandoParcelas(false);
    }
  };

  const openModalCobranca = (parcela: ParcelaDisplay) => {
    setCobrancaForm({
      forma_pagamento: 'PIX',
      data_vencimento: parcela.data || '',
      valor: String(parcela.valor),
      ja_pago: false,
      data_pagamento: '',
      valor_recebido: String(parcela.valor),
      observacao: '',
    });
    setModalCobranca({ open: true, parcela });
  };

  const closeModalCobranca = () => {
    setModalCobranca({ open: false, parcela: null });
  };

  const handleSubmitCobranca = async () => {
    if (!nota || !modalCobranca.parcela) return;
    if (!cobrancaForm.data_vencimento) {
      alert('Informe a data de vencimento.');
      return;
    }
    if (!cobrancaForm.valor || isNaN(Number(cobrancaForm.valor))) {
      alert('Informe um valor valido.');
      return;
    }
    if (cobrancaForm.ja_pago && !cobrancaForm.data_pagamento) {
      alert('Informe a data de pagamento.');
      return;
    }

    setSubmittingCobranca(true);
    try {
      await api.post('/boletos/manual', {
        nota_fiscal_id: nota.id,
        numero_parcela: modalCobranca.parcela.parcela,
        total_parcelas: nota.parcelas,
        valor_nominal: Number(cobrancaForm.valor),
        data_vencimento: cobrancaForm.data_vencimento,
        forma_pagamento: cobrancaForm.forma_pagamento,
        banco_pagamento: null,
        observacao: cobrancaForm.observacao || null,
        ja_pago: cobrancaForm.ja_pago,
        data_pagamento: cobrancaForm.ja_pago ? cobrancaForm.data_pagamento : null,
        valor_recebido: cobrancaForm.ja_pago && cobrancaForm.valor_recebido
          ? Number(cobrancaForm.valor_recebido)
          : null,
      });
      closeModalCobranca();
      await carregarDados();
    } catch (error) {
      console.error('Erro ao registrar cobranca:', error);
      alert('Erro ao registrar cobranca. Verifique os dados e tente novamente.');
    } finally {
      setSubmittingCobranca(false);
    }
  };

  const openModalPagamento = (boleto: Boleto) => {
    setPagamentoForm({
      data_pagamento: todayIso(),
      valor_recebido: String(boleto.valor_nominal),
      forma_pagamento: (boleto.forma_pagamento as FormaPagamento) || 'PIX',
      observacao: '',
    });
    setModalPagamento({ open: true, boleto });
  };

  const closeModalPagamento = () => {
    setModalPagamento({ open: false, boleto: null });
  };

  const handleSubmitPagamento = async () => {
    if (!modalPagamento.boleto) return;
    if (!pagamentoForm.data_pagamento) {
      alert('Informe a data de pagamento.');
      return;
    }
    if (!pagamentoForm.valor_recebido || isNaN(Number(pagamentoForm.valor_recebido))) {
      alert('Informe um valor recebido valido.');
      return;
    }

    setSubmittingPagamento(true);
    try {
      await api.post(`/boletos/${modalPagamento.boleto.id}/registrar-pagamento`, {
        data_pagamento: pagamentoForm.data_pagamento,
        valor_recebido: Number(pagamentoForm.valor_recebido),
        forma_pagamento: pagamentoForm.forma_pagamento,
        banco_pagamento: null,
        observacao: pagamentoForm.observacao || null,
      });
      closeModalPagamento();
      await carregarDados();
    } catch (error) {
      console.error('Erro ao registrar pagamento:', error);
      alert('Erro ao registrar pagamento.');
    } finally {
      setSubmittingPagamento(false);
    }
  };

  const handleSalvar = async () => {
    if (!id) return;

    try {
      await api.put(`/notas-fiscais/${id}`, {
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento || null,
        observacao: observacao || null,
        cliente_nome: clienteNome || null
      });

      alert('Nota fiscal atualizada com sucesso!');
      setEditando(false);
      carregarDados();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('Erro ao atualizar nota fiscal');
    }
  };

  const handleExcluir = async () => {
    if (!motivo.trim()) {
      alert("Informe o motivo da exclusao");
      return;
    }

    const deletarServicos = confirm(
      "Esta nota esta vinculada a servicos. Deseja deletar tambem todos os servicos associados?"
    );

    try {
      await api.delete(`/notas-fiscais/${nota?.id}?motivo=${encodeURIComponent(motivo)}&deletar_servicos=${deletarServicos}`);
      alert("Nota excluida com sucesso!");
      router.push("/notas");
    } catch (error) {
      console.error("Erro ao excluir nota:", error);
    }
  };

  if (loading || !nota) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando nota...</p>
        </div>
      </div>
    );
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return 'from-blue-500 to-blue-600';
      case 'MANUTENCAO': return 'from-purple-500 to-purple-600';
      default: return 'from-slate-500 to-slate-600';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return '🔧';
      case 'MANUTENCAO': return '🛠️';
      default: return '📄';
    }
  };

  const parcelasDisplay = getParcelasDisplay(nota);
  const totalParcelas = nota.parcelas || 1;
  const boletosCount = boletos.length;
  const hasMissingBoletos = boletosCount > 0 && boletosCount < totalParcelas;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Fixed top header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/notas"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 font-semibold transition-colors group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar para lista
            </Link>

            <div className="flex gap-3">
              {!editando ? (
                <>
                  <button
                    onClick={() => setEditando(true)}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar Nota
                  </button>
                  <button
                    onClick={() => setModalExcluir(true)}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir Nota
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditando(false);
                      carregarDados();
                    }}
                    className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </button>
                  <button
                    onClick={handleSalvar}
                    className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Salvar Alteracoes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left: nota details */}
        <div className="lg:col-span-3 space-y-6">
          {/* Hero card */}
          <div className={`bg-gradient-to-r ${getTipoColor(nota.tipo)} rounded-3xl p-8 text-white shadow-xl`}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-2xl font-black">
                  {getTipoIcon(nota.tipo)}
                  {nota.tipo}
                </div>
                <h1 className="text-4xl font-black">Nota #{nota.numero_nota}</h1>
              </div>
              <div className="text-right space-y-1">
                <p className="text-3xl font-black">R$ {nota.valor.toFixed(2)}</p>
                <p className="text-sm opacity-80">Parcelas: {nota.parcelas}</p>
              </div>
            </div>
          </div>

          {/* Editable fields card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📝</span>
                Detalhes Editaveis
              </h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Data de Vencimento
                </label>
                {editando ? (
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {new Date(nota.data_vencimento).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Data de Pagamento
                </label>
                {editando ? (
                  <input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {nota.data_pagamento ? new Date(nota.data_pagamento).toLocaleDateString('pt-BR') : 'Nao pago'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Nome do Cliente
                </label>
                {editando ? (
                  <input
                    type="text"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {nota.cliente_nome || 'Nao informado'}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Observacao
                </label>
                {editando ? (
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium whitespace-pre-wrap">
                    {nota.observacao || 'Sem observacoes'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Associated condominio */}
          {condominio && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">🏢</span>
                  Condominio Associado
                </h3>
              </div>
              <div className="p-6">
                <Link
                  href={`/condominios/${condominio.id}`}
                  className="group flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white shadow-sm">
                    <span className="text-sm font-bold">{condominio.nome.substring(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {condominio.nome}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                      CNPJ: {condominio.cnpj || 'Nao informado'}
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Cobracas section */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">💳</span>
                Cobranças
              </h3>
              {boletos.length > 0 && (
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {boletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length}/{totalParcelas} pagos
                </span>
              )}
            </div>

            {/* Bulk action: generate missing boletos via Inter */}
            {hasMissingBoletos && (
              <div className="mx-4 mt-4 p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/30 rounded-xl">
                <p className="text-xs font-bold text-orange-700 dark:text-orange-400 mb-2">
                  Parcelas faltantes: {boletosCount}/{totalParcelas} geradas
                </p>
                <button
                  onClick={handleGerarParcelasFaltantes}
                  disabled={gerandoParcelas}
                  className="w-full py-2 bg-orange-600 text-white rounded-lg font-bold text-xs hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {gerandoParcelas
                    ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
                    : 'Gerar Parcelas Faltantes no Inter'}
                </button>
              </div>
            )}

            {/* Parcelas list */}
            <div className="p-4 space-y-3">
              {parcelasDisplay.map((parcela) => {
                const boleto = boletos.find(b => b.numero_parcela === parcela.parcela) ?? null;
                const cfg = boleto ? SITUACAO_CONFIG[boleto.situacao] : null;
                const canMarkPaid = boleto && (boleto.situacao === 'EMABERTO' || boleto.situacao === 'VENCIDO');
                const parcelaLabel = totalParcelas > 1
                  ? `Parcela ${parcela.parcela}/${totalParcelas}`
                  : 'A vista';

                return (
                  <div key={parcela.parcela} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    {/* Row header: label + situacao badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {parcelaLabel}
                      </span>
                      {cfg && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${cfg.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      )}
                    </div>

                    {/* Value and date */}
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {fmt(parcela.valor)}
                      </span>
                      {parcela.data && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Venc. {parseDateLocal(parcela.data)}
                        </span>
                      )}
                    </div>

                    {/* Boleto extra info */}
                    {boleto && (
                      <div className="space-y-0.5">
                        {boleto.data_pagamento && (
                          <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
                            Pago em {parseDateLocal(boleto.data_pagamento)}
                            {boleto.valor_total_recebido && boleto.valor_total_recebido !== boleto.valor_nominal
                              ? ` · ${fmt(boleto.valor_total_recebido)}`
                              : ''}
                          </p>
                        )}
                        {(boleto.valor_juros > 0 || boleto.valor_multa > 0) && (
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            +{fmt(boleto.valor_juros + boleto.valor_multa)} juros/multa
                          </p>
                        )}
                        {/* Forma de pagamento badge */}
                        <span className="inline-block text-xs font-mono font-bold px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                          {FORMA_PAGAMENTO_ICONS[boleto.forma_pagamento as FormaPagamento] ?? boleto.forma_pagamento}
                        </span>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      {boleto ? (
                        canMarkPaid && (
                          <button
                            onClick={() => openModalPagamento(boleto)}
                            className="flex-1 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all"
                          >
                            Marcar Pago
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={handleGerarInterParcela}
                            disabled={gerandoParcelas}
                            className="flex-1 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            title="Gerar via Banco Inter"
                          >
                            {gerandoParcelas ? '...' : 'Gerar Inter'}
                          </button>
                          <button
                            onClick={() => openModalCobranca(parcela)}
                            className="flex-1 py-1.5 text-xs font-bold bg-slate-600 text-white rounded-lg hover:brightness-110 transition-all"
                            title="Registrar manualmente"
                          >
                            + Registrar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📊</span>
                Status
              </h3>
            </div>
            <div className="p-6">
              <div className={`p-4 rounded-xl text-center ${
                nota.data_pagamento
                  ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800'
                  : 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800'
              }`}>
                <span className="text-3xl mb-2 block">
                  {nota.data_pagamento ? '✅' : '⏳'}
                </span>
                <p className={`text-lg font-black ${
                  nota.data_pagamento
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-orange-700 dark:text-orange-400'
                }`}>
                  {nota.data_pagamento ? 'PAGO' : 'PENDENTE'}
                </p>
              </div>
            </div>
          </div>

          {/* Metadata card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">ℹ️</span>
                Metadados
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">ID do Sistema</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">#{nota.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Criado em</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {new Date(nota.criado_em).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Confirmar exclusao */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                Confirmar Exclusao
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Esta acao nao pode ser desfeita. A nota sera arquivada no historico de exclusoes.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Motivo da exclusao (obrigatorio)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: Nota emitida incorretamente..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalExcluir(false)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
              >
                Excluir Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Cobranca (create manual boleto) */}
      {modalCobranca.open && modalCobranca.parcela && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                Registrar Cobrança
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {totalParcelas > 1
                  ? `Parcela ${modalCobranca.parcela.parcela}/${totalParcelas}`
                  : 'A vista'}{' '}
                — {fmt(modalCobranca.parcela.valor)}
              </p>
            </div>

            <div className="space-y-4">
              {/* Forma de pagamento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Forma de Pagamento
                </label>
                <select
                  value={cobrancaForm.forma_pagamento}
                  onChange={(e) => setCobrancaForm(f => ({ ...f, forma_pagamento: e.target.value as FormaPagamento }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                >
                  {FORMAS_PAGAMENTO.map(fp => (
                    <option key={fp} value={fp}>{FORMA_PAGAMENTO_LABELS[fp]}</option>
                  ))}
                </select>
              </div>

              {/* Data de vencimento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={cobrancaForm.data_vencimento}
                  onChange={(e) => setCobrancaForm(f => ({ ...f, data_vencimento: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Valor */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cobrancaForm.valor}
                  onChange={(e) => setCobrancaForm(f => ({ ...f, valor: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Ja pago toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ja_pago"
                  checked={cobrancaForm.ja_pago}
                  onChange={(e) => setCobrancaForm(f => ({ ...f, ja_pago: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="ja_pago" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Ja pago
                </label>
              </div>

              {/* Conditional payment fields */}
              {cobrancaForm.ja_pago && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Data de Pagamento
                    </label>
                    <input
                      type="date"
                      value={cobrancaForm.data_pagamento}
                      onChange={(e) => setCobrancaForm(f => ({ ...f, data_pagamento: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Valor Recebido (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cobrancaForm.valor_recebido}
                      onChange={(e) => setCobrancaForm(f => ({ ...f, valor_recebido: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </>
              )}

              {/* Observacao */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Observacao (opcional)
                </label>
                <input
                  type="text"
                  value={cobrancaForm.observacao}
                  onChange={(e) => setCobrancaForm(f => ({ ...f, observacao: e.target.value }))}
                  placeholder="Observacao opcional..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModalCobranca}
                disabled={submittingCobranca}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitCobranca}
                disabled={submittingCobranca}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingCobranca && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pagamento (mark boleto as paid) */}
      {modalPagamento.open && modalPagamento.boleto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-8">
            <div className="mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                Registrar Pagamento
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {modalPagamento.boleto.total_parcelas > 1
                  ? `Parcela ${modalPagamento.boleto.numero_parcela}/${modalPagamento.boleto.total_parcelas}`
                  : 'A vista'}{' '}
                — {fmt(modalPagamento.boleto.valor_nominal)}
              </p>
            </div>

            <div className="space-y-4">
              {/* Data de pagamento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={pagamentoForm.data_pagamento}
                  onChange={(e) => setPagamentoForm(f => ({ ...f, data_pagamento: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Valor recebido */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Valor Recebido (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pagamentoForm.valor_recebido}
                  onChange={(e) => setPagamentoForm(f => ({ ...f, valor_recebido: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Forma de Pagamento
                </label>
                <select
                  value={pagamentoForm.forma_pagamento}
                  onChange={(e) => setPagamentoForm(f => ({ ...f, forma_pagamento: e.target.value as FormaPagamento }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                >
                  {FORMAS_PAGAMENTO.map(fp => (
                    <option key={fp} value={fp}>{FORMA_PAGAMENTO_LABELS[fp]}</option>
                  ))}
                </select>
              </div>

              {/* Observacao */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Observacao (opcional)
                </label>
                <input
                  type="text"
                  value={pagamentoForm.observacao}
                  onChange={(e) => setPagamentoForm(f => ({ ...f, observacao: e.target.value }))}
                  placeholder="Observacao opcional..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModalPagamento}
                disabled={submittingPagamento}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitPagamento}
                disabled={submittingPagamento}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingPagamento && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
