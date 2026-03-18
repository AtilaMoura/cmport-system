"use client"

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

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
  numero_parcela: number;
  total_parcelas: number;
  forma_pagamento: string;
  banco_pagamento?: string | null;
  observacao?: string | null;
  criado_em: string;
}

interface Nota {
  id: number;
  numero_nota: string;
  valor: number;
  data_vencimento: string;
  condominio_id: number | null;
  cliente_nome: string | null;
  condominio?: { nome: string };
}

const SITUACAO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dot: 'bg-blue-500' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',         dot: 'bg-red-500' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',    dot: 'bg-teal-500' },
};

const FORMA_PAGAMENTO_CONFIG: Record<string, { label: string; cls: string }> = {
  BOLETO_INTER:  { label: 'Boleto Inter',   cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  BOLETO_ITAU:   { label: 'Boleto Itaú',    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' },
  PIX:           { label: 'PIX',            cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  DINHEIRO:      { label: 'Dinheiro',       cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  TRANSFERENCIA: { label: 'Transferência',  cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' },
  CHEQUE:        { label: 'Cheque',         cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' },
};

const FORMAS_PAGAMENTO = [
  { value: 'BOLETO_INTER',  label: 'Boleto Inter' },
  { value: 'BOLETO_ITAU',   label: 'Boleto Itaú' },
  { value: 'PIX',           label: 'PIX' },
  { value: 'DINHEIRO',      label: 'Dinheiro' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'CHEQUE',        label: 'Cheque' },
];

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

type PageTab = 'boletos' | 'notas_sem_boleto';

export default function BoletosPage() {
  const [pageTab, setPageTab] = useState<PageTab>('boletos');
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizandoInter, setSincronizandoInter] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const hoje = new Date().toISOString().split('T')[0];
  const umAnoAtras = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [syncDataInicio, setSyncDataInicio] = useState(umAnoAtras);
  const [syncDataFim, setSyncDataFim] = useState(hoje);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);
  const [modalCancelar, setModalCancelar] = useState<{ codigo: string; nosso_numero: string | null } | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  // Modal registrar pagamento
  const [modalPagamento, setModalPagamento] = useState<Boleto | null>(null);
  const [pagDataPagamento, setPagDataPagamento] = useState(hoje);
  const [pagValorRecebido, setPagValorRecebido] = useState('');
  const [pagFormaPagamento, setPagFormaPagamento] = useState('PIX');
  const [pagBancoPagamento, setPagBancoPagamento] = useState('');
  const [pagObservacao, setPagObservacao] = useState('');
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);

  // Modal vincular nota
  const [modalVincular, setModalVincular] = useState<Boleto | null>(null);
  const [notasDisponiveis, setNotasDisponiveis] = useState<Nota[]>([]);
  const [notaSearchVincular, setNotaSearchVincular] = useState('');
  const [notaSelecionadaId, setNotaSelecionadaId] = useState<number | null>(null);
  const [vinculando, setVinculando] = useState(false);

  // Deletar boleto
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  // Aba notas sem boleto
  const [notasSemBoleto, setNotasSemBoleto] = useState<Nota[]>([]);
  const [loadingNotasSemBoleto, setLoadingNotasSemBoleto] = useState(false);
  const [searchNotasSemBoleto, setSearchNotasSemBoleto] = useState('');
  const [modalGerarBoleto, setModalGerarBoleto] = useState<Nota | null>(null);
  const [gerarDataVencOverride, setGerarDataVencOverride] = useState('');
  const [gerando, setGerando] = useState(false);
  const [gerandoTodos, setGerandoTodos] = useState(false);

  // Modal criar boleto manual
  const [modalBoletoManual, setModalBoletoManual] = useState<Nota | null>(null);
  const [manualForma, setManualForma] = useState('PIX');
  const [manualValor, setManualValor] = useState('');
  const [manualDataVenc, setManualDataVenc] = useState(hoje);
  const [manualBanco, setManualBanco] = useState('');
  const [manualObs, setManualObs] = useState('');
  const [manualJaPago, setManualJaPago] = useState(false);
  const [manualDataPag, setManualDataPag] = useState(hoje);
  const [manualValorRec, setManualValorRec] = useState('');
  const [criandoManual, setCriandoManual] = useState(false);

  // Modal gerar parcelas faltantes
  const [gerandoParcelas, setGerandoParcelas] = useState<number | null>(null);

  // Filtros boletos
  const [filtroSituacao, setFiltroSituacao] = useState('todos');
  const [search, setSearch] = useState('');
  const [filtroMesVenc, setFiltroMesVenc] = useState('');
  const [filtroMesEmis, setFiltroMesEmis] = useState('');
  const [filtroVencDe, setFiltroVencDe] = useState('');
  const [filtroVencAte, setFiltroVencAte] = useState('');
  const [filtroEmisDe, setFiltroEmisDe] = useState('');
  const [filtroEmisAte, setFiltroEmisAte] = useState('');
  const [filtroValorMin, setFiltroValorMin] = useState('');
  const [filtroValorMax, setFiltroValorMax] = useState('');
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false);

  useEffect(() => { carregarBoletos(); }, []);

  useEffect(() => {
    if (pageTab === 'notas_sem_boleto') {
      carregarNotasSemBoleto();
    }
  }, [pageTab]);

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

  const carregarNotasSemBoleto = async () => {
    setLoadingNotasSemBoleto(true);
    try {
      const res = await api.get('/boletos/notas-sem-boleto');
      setNotasSemBoleto(res.data);
    } catch (error) {
      console.error('Erro ao carregar notas sem boleto:', error);
    } finally {
      setLoadingNotasSemBoleto(false);
    }
  };

  const carregarNotasDisponiveis = async () => {
    try {
      const res = await api.get('/notas-fiscais/');
      setNotasDisponiveis(res.data);
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
    }
  };

  const limparFiltros = () => {
    setFiltroSituacao('todos');
    setSearch('');
    setFiltroMesVenc('');
    setFiltroMesEmis('');
    setFiltroVencDe('');
    setFiltroVencAte('');
    setFiltroEmisDe('');
    setFiltroEmisAte('');
    setFiltroValorMin('');
    setFiltroValorMax('');
  };

  const temFiltroAtivo = filtroSituacao !== 'todos' || search || filtroMesVenc ||
    filtroMesEmis || filtroVencDe || filtroVencAte || filtroEmisDe || filtroEmisAte ||
    filtroValorMin || filtroValorMax;

  const sincronizarStatus = async () => {
    setSincronizando(true);
    try {
      const res = await api.post('/boletos/sincronizar');
      const { atualizados, erros } = res.data;
      await carregarBoletos();
      alert(`Sincronização concluída!\nAtualizados: ${atualizados}${erros.length > 0 ? `\nErros: ${erros.length}` : ''}`);
    } catch (error) {
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
    } catch {
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
    } catch {
      alert('Erro ao baixar PDF do boleto.');
    } finally {
      setBaixandoPdf(null);
    }
  };

  const abrirModalPagamento = (boleto: Boleto) => {
    setModalPagamento(boleto);
    setPagDataPagamento(hoje);
    setPagValorRecebido(String(boleto.valor_nominal));
    setPagFormaPagamento('PIX');
    setPagBancoPagamento('');
    setPagObservacao('');
  };

  const confirmarPagamento = async () => {
    if (!modalPagamento) return;
    setRegistrandoPagamento(true);
    try {
      await api.post(`/boletos/${modalPagamento.id}/registrar-pagamento`, {
        data_pagamento: pagDataPagamento,
        valor_recebido: parseFloat(pagValorRecebido),
        forma_pagamento: pagFormaPagamento,
        banco_pagamento: pagBancoPagamento || null,
        observacao: pagObservacao || null,
      });
      setModalPagamento(null);
      await carregarBoletos();
    } catch {
      alert('Erro ao registrar pagamento.');
    } finally {
      setRegistrandoPagamento(false);
    }
  };

  const sincronizarInter = async () => {
    setSincronizandoInter(true);
    setShowSyncModal(false);
    try {
      const res = await api.post(`/boletos/sincronizar-inter?data_inicio=${syncDataInicio}&data_fim=${syncDataFim}`);
      const { criados, atualizados, sem_vinculo, erros } = res.data;
      await carregarBoletos();
      alert(`Sincronização do Inter concluída!\nCriados: ${criados}\nAtualizados: ${atualizados}\nSem vínculo: ${sem_vinculo}${erros.length > 0 ? `\nErros: ${erros.length}` : ''}`);
    } catch {
      alert('Erro ao sincronizar boletos do Banco Inter.');
    } finally {
      setSincronizandoInter(false);
    }
  };

  const abrirModalVincular = async (boleto: Boleto) => {
    setModalVincular(boleto);
    setNotaSearchVincular('');
    setNotaSelecionadaId(null);
    await carregarNotasDisponiveis();
  };

  const confirmarVincular = async () => {
    if (!modalVincular || !notaSelecionadaId) return;
    setVinculando(true);
    try {
      await api.patch(`/boletos/${modalVincular.id}/vincular`, { nota_fiscal_id: notaSelecionadaId });
      setModalVincular(null);
      await carregarBoletos();
    } catch {
      alert('Erro ao vincular nota ao boleto.');
    } finally {
      setVinculando(false);
    }
  };

  const deletarBoleto = async (id: number) => {
    if (!confirm('Deletar este boleto? Esta ação é irreversível.')) return;
    setDeletandoId(id);
    try {
      await api.delete(`/boletos/${id}`);
      await carregarBoletos();
    } catch {
      alert('Erro ao deletar boleto.');
    } finally {
      setDeletandoId(null);
    }
  };

  const abrirModalGerarBoleto = (nota: Nota) => {
    setModalGerarBoleto(nota);
    const notaVencida = parseLocalDate(nota.data_vencimento) < new Date();
    setGerarDataVencOverride(notaVencida ? hoje : '');
  };

  const confirmarGerarBoleto = async () => {
    if (!modalGerarBoleto) return;
    setGerando(true);
    try {
      const body: Record<string, unknown> = { nota_ids: [modalGerarBoleto.id] };
      if (gerarDataVencOverride) body.data_vencimento_override = gerarDataVencOverride;
      await api.post('/boletos/gerar', body);
      setModalGerarBoleto(null);
      await carregarNotasSemBoleto();
    } catch {
      alert('Erro ao gerar boleto.');
    } finally {
      setGerando(false);
    }
  };

  const gerarTodosBoletos = async () => {
    if (!confirm(`Gerar boletos para todas as ${notasSemBoletofiltradas.length} notas visíveis? Notas vencidas usarão a data de hoje como vencimento.`)) return;
    setGerandoTodos(true);
    try {
      const notasVencidas = notasSemBoletofiltradas.filter(n => parseLocalDate(n.data_vencimento) < new Date());
      const notasOk = notasSemBoletofiltradas.filter(n => parseLocalDate(n.data_vencimento) >= new Date());

      if (notasOk.length > 0) {
        await api.post('/boletos/gerar', { nota_ids: notasOk.map(n => n.id) });
      }
      if (notasVencidas.length > 0) {
        await api.post('/boletos/gerar', { nota_ids: notasVencidas.map(n => n.id), data_vencimento_override: hoje });
      }
      await carregarNotasSemBoleto();
      alert('Boletos gerados com sucesso!');
    } catch {
      alert('Erro ao gerar boletos em lote.');
    } finally {
      setGerandoTodos(false);
    }
  };

  const abrirModalBoletoManual = (nota: Nota) => {
    setModalBoletoManual(nota);
    setManualForma('PIX');
    setManualValor(String(nota.valor));
    setManualDataVenc(hoje);
    setManualBanco('');
    setManualObs('');
    setManualJaPago(false);
    setManualDataPag(hoje);
    setManualValorRec(String(nota.valor));
  };

  const confirmarBoletoManual = async () => {
    if (!modalBoletoManual || !manualValor || !manualDataVenc) return;
    setCriandoManual(true);
    try {
      await api.post('/boletos/manual', {
        nota_fiscal_id: modalBoletoManual.id,
        numero_parcela: 1,
        total_parcelas: 1,
        valor_nominal: parseFloat(manualValor),
        data_vencimento: manualDataVenc,
        forma_pagamento: manualForma,
        banco_pagamento: manualBanco || null,
        observacao: manualObs || null,
        ja_pago: manualJaPago,
        data_pagamento: manualJaPago ? manualDataPag : null,
        valor_recebido: manualJaPago ? parseFloat(manualValorRec) : null,
      });
      setModalBoletoManual(null);
      await carregarNotasSemBoleto();
      await carregarBoletos();
    } catch {
      alert('Erro ao criar boleto manual.');
    } finally {
      setCriandoManual(false);
    }
  };

  const gerarParcelasFaltantes = async (notaId: number) => {
    if (!confirm('Gerar as parcelas faltantes deste boleto no Banco Inter?')) return;
    setGerandoParcelas(notaId);
    try {
      const res = await api.post(`/boletos/gerar-parcelas-faltantes/${notaId}`);
      const { sucesso, erros } = res.data;
      await carregarBoletos();
      if (erros.length > 0) {
        alert(`${sucesso.length} parcela(s) gerada(s).\nErros: ${erros.map((e: { erro: string }) => e.erro).join(', ')}`);
      } else {
        alert(`${sucesso.length} parcela(s) gerada(s) com sucesso!`);
      }
    } catch {
      alert('Erro ao gerar parcelas faltantes.');
    } finally {
      setGerandoParcelas(null);
    }
  };

  const boletosFiltrados = useMemo(() => {
    return boletos.filter(b => {
      if (filtroSituacao !== 'todos' && b.situacao !== filtroSituacao) return false;

      if (search) {
        const q = search.toLowerCase();
        const match =
          b.nosso_numero?.toLowerCase().includes(q) ||
          b.seu_numero?.toLowerCase().includes(q) ||
          b.codigo_solicitacao?.toLowerCase().includes(q) ||
          String(b.nota_fiscal_id).includes(q);
        if (!match) return false;
      }

      const venc = parseLocalDate(b.data_vencimento);
      const emis = parseLocalDate(b.data_emissao);

      if (filtroMesVenc) {
        const [y, m] = filtroMesVenc.split('-').map(Number);
        if (venc.getFullYear() !== y || venc.getMonth() + 1 !== m) return false;
      }

      if (filtroMesEmis) {
        const [y, m] = filtroMesEmis.split('-').map(Number);
        if (emis.getFullYear() !== y || emis.getMonth() + 1 !== m) return false;
      }

      if (filtroVencDe && venc < parseLocalDate(filtroVencDe)) return false;
      if (filtroVencAte && venc > parseLocalDate(filtroVencAte)) return false;

      if (filtroEmisDe && emis < parseLocalDate(filtroEmisDe)) return false;
      if (filtroEmisAte && emis > parseLocalDate(filtroEmisAte)) return false;

      if (filtroValorMin && b.valor_nominal < parseFloat(filtroValorMin)) return false;
      if (filtroValorMax && b.valor_nominal > parseFloat(filtroValorMax)) return false;

      return true;
    });
  }, [boletos, filtroSituacao, search, filtroMesVenc, filtroMesEmis,
      filtroVencDe, filtroVencAte, filtroEmisDe, filtroEmisAte,
      filtroValorMin, filtroValorMax]);

  const notasSemBoletofiltradas = useMemo(() => {
    if (!searchNotasSemBoleto) return notasSemBoleto;
    const q = searchNotasSemBoleto.toLowerCase();
    return notasSemBoleto.filter(n =>
      n.numero_nota?.toLowerCase().includes(q) ||
      n.cliente_nome?.toLowerCase().includes(q) ||
      n.condominio?.nome?.toLowerCase().includes(q)
    );
  }, [notasSemBoleto, searchNotasSemBoleto]);

  const notasVincularFiltradas = useMemo(() => {
    if (!notaSearchVincular) return notasDisponiveis;
    const q = notaSearchVincular.toLowerCase();
    return notasDisponiveis.filter(n =>
      n.numero_nota?.toLowerCase().includes(q) ||
      n.cliente_nome?.toLowerCase().includes(q) ||
      n.condominio?.nome?.toLowerCase().includes(q)
    );
  }, [notasDisponiveis, notaSearchVincular]);

  const stats = useMemo(() => ({
    total: boletosFiltrados.length,
    emAberto: boletosFiltrados.filter(b => b.situacao === 'EMABERTO').length,
    pagos: boletosFiltrados.filter(b => b.situacao === 'PAGO').length,
    vencidos: boletosFiltrados.filter(b => b.situacao === 'VENCIDO').length,
    cancelados: boletosFiltrados.filter(b => b.situacao === 'CANCELADO').length,
    expirados: boletosFiltrados.filter(b => b.situacao === 'EXPIRADO' || b.situacao === 'BAIXADO').length,
    valorAberto: boletosFiltrados.filter(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO').reduce((s, b) => s + b.valor_nominal, 0),
    valorPago: boletosFiltrados.filter(b => b.situacao === 'PAGO').reduce((s, b) => s + (b.valor_total_recebido ?? b.valor_nominal), 0),
    valorTotal: boletosFiltrados.reduce((s, b) => s + b.valor_nominal, 0),
  }), [boletosFiltrados]);

  const doughnutData = {
    labels: ['Em Aberto', 'Pago', 'Vencido', 'Cancelado', 'Expirado/Baixado'],
    datasets: [{
      data: [stats.emAberto, stats.pagos, stats.vencidos, stats.cancelados, stats.expirados],
      backgroundColor: ['#3b82f6', '#22c55e', '#f97316', '#ef4444', '#94a3b8'],
      borderWidth: 0,
    }],
  };

  const ultimos6Meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { mes: d.getMonth(), ano: d.getFullYear(), nome: d.toLocaleDateString('pt-BR', { month: 'short' }) };
  });

  const barData = {
    labels: ultimos6Meses.map(m => m.nome),
    datasets: [
      {
        label: 'Valor Pago',
        data: ultimos6Meses.map(m =>
          boletosFiltrados.filter(b => {
            const d = b.data_pagamento ? new Date(b.data_pagamento) : null;
            return d && d.getMonth() === m.mes && d.getFullYear() === m.ano && b.situacao === 'PAGO';
          }).reduce((s, b) => s + (b.valor_total_recebido ?? b.valor_nominal), 0)
        ),
        backgroundColor: '#22c55e',
        borderRadius: 6,
      },
      {
        label: 'Valor Emitido',
        data: ultimos6Meses.map(m =>
          boletosFiltrados.filter(b => {
            const d = parseLocalDate(b.data_emissao);
            return d.getMonth() === m.mes && d.getFullYear() === m.ano;
          }).reduce((s, b) => s + b.valor_nominal, 0)
        ),
        backgroundColor: '#6366f1',
        borderRadius: 6,
      },
    ],
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

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
                <Link href="/notas" className="text-slate-400 hover:text-indigo-600 transition-colors">
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
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setShowSyncModal(true)}
                disabled={sincronizandoInter}
                className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {sincronizandoInter
                  ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importando...</>
                  : <><span className="text-xl">🏦</span> Importar do Inter</>}
              </button>
              <button
                onClick={sincronizarStatus}
                disabled={sincronizando}
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {sincronizando
                  ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                  : <><span className="text-xl">🔄</span> Sincronizar Status</>}
              </button>
              <Link
                href="/notas"
                className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">📄</span> Notas Fiscais
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 border-b border-slate-200 dark:border-slate-800 -mb-px">
            {([
              { key: 'boletos', label: 'Todos os Boletos', count: boletos.length },
              { key: 'notas_sem_boleto', label: 'Notas sem Boleto', count: notasSemBoleto.length },
            ] as { key: PageTab; label: string; count: number }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key)}
                className={`px-6 py-3 font-bold text-sm rounded-t-xl transition-all flex items-center gap-2 ${
                  pageTab === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    pageTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* ===== ABA: TODOS OS BOLETOS ===== */}
        {pageTab === 'boletos' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total', value: stats.total, cls: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800', textCls: 'text-slate-900 dark:text-white' },
                { label: 'Em Aberto', value: stats.emAberto, cls: 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-800/50', textCls: 'text-blue-700 dark:text-blue-400' },
                { label: 'Pagos', value: stats.pagos, cls: 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/50', textCls: 'text-green-700 dark:text-green-400' },
                { label: 'Vencidos', value: stats.vencidos, cls: 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/50', textCls: 'text-orange-700 dark:text-orange-400' },
              ].map(card => (
                <div key={card.label} className={`${card.cls} p-5 rounded-2xl shadow-sm`}>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">{card.label}</p>
                  <p className={`text-3xl font-black ${card.textCls}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Valores resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Valor Total Emitido</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{fmt(stats.valorTotal)}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/50 p-5 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase mb-2">Valor Recebido</p>
                <p className="text-2xl font-black text-green-700 dark:text-green-400">{fmt(stats.valorPago)}</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/50 p-5 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase mb-2">Valor Pendente</p>
                <p className="text-2xl font-black text-orange-700 dark:text-orange-400">{fmt(stats.valorAberto)}</p>
              </div>
            </div>

            {/* Graficos */}
            {boletosFiltrados.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">🥧</span> Distribuição por Status
                  </h3>
                  <div className="h-56">
                    <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">📊</span> Valores — Últimos 6 Meses
                  </h3>
                  <div className="h-56">
                    <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#64748b' } } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }} />
                  </div>
                </div>
              </div>
            )}

            {/* Filtros */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">

              {/* Linha 1: busca + mês vencimento + mês emissão */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Buscar</label>
                  <input
                    type="text"
                    placeholder="Nosso número, seu número, nota..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Mês de Vencimento</label>
                  <input
                    type="month"
                    value={filtroMesVenc}
                    onChange={e => { setFiltroMesVenc(e.target.value); setFiltroVencDe(''); setFiltroVencAte(''); }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Mês de Emissão</label>
                  <input
                    type="month"
                    value={filtroMesEmis}
                    onChange={e => { setFiltroMesEmis(e.target.value); setFiltroEmisDe(''); setFiltroEmisAte(''); }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>

              {/* Filtros avançados (expansível) */}
              <div>
                <button
                  onClick={() => setShowFiltrosAvancados(p => !p)}
                  className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <svg className={`w-3 h-3 transition-transform ${showFiltrosAvancados ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  {showFiltrosAvancados ? 'Ocultar filtros avançados' : 'Filtros avançados (datas e valores)'}
                </button>

                {showFiltrosAvancados && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Vencimento — De</label>
                      <input
                        type="date"
                        value={filtroVencDe}
                        onChange={e => { setFiltroVencDe(e.target.value); setFiltroMesVenc(''); }}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Vencimento — Até</label>
                      <input
                        type="date"
                        value={filtroVencAte}
                        onChange={e => { setFiltroVencAte(e.target.value); setFiltroMesVenc(''); }}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Emissão — De</label>
                      <input
                        type="date"
                        value={filtroEmisDe}
                        onChange={e => { setFiltroEmisDe(e.target.value); setFiltroMesEmis(''); }}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Emissão — Até</label>
                      <input
                        type="date"
                        value={filtroEmisAte}
                        onChange={e => { setFiltroEmisAte(e.target.value); setFiltroMesEmis(''); }}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Valor — Mínimo (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={filtroValorMin}
                        onChange={e => setFiltroValorMin(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Valor — Máximo (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="9999,99"
                        value={filtroValorMax}
                        onChange={e => setFiltroValorMax(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Linha 3: status + limpar */}
              <div className="flex flex-wrap items-center gap-2">
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

                {temFiltroAtivo && (
                  <button
                    onClick={limparFiltros}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Limpar filtros
                  </button>
                )}
              </div>

              {/* Contador de resultados */}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exibindo <span className="font-bold text-slate-700 dark:text-slate-300">{boletosFiltrados.length}</span> de <span className="font-bold">{boletos.length}</span> boletos
                {temFiltroAtivo && <span className="ml-1 text-indigo-600 dark:text-indigo-400">(com filtros ativos)</span>}
              </p>
            </div>

            {/* Tabela */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      {['Nota Fiscal', 'Parcela', 'Nosso Número', 'Valor', 'Emissão', 'Vencimento', 'Pagamento', 'Forma', 'Situação', 'Ações'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {boletosFiltrados.map((boleto) => {
                      const cfg = SITUACAO_CONFIG[boleto.situacao];
                      const formaCfg = FORMA_PAGAMENTO_CONFIG[boleto.forma_pagamento] ?? { label: boleto.forma_pagamento, cls: 'bg-slate-100 text-slate-700' };
                      const podeAcao = boleto.situacao === 'EMABERTO' || boleto.situacao === 'VENCIDO';
                      const podePagar = boleto.situacao !== 'PAGO' && boleto.situacao !== 'CANCELADO' && boleto.situacao !== 'BAIXADO';
                      return (
                        <tr key={boleto.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-5">
                            <Link href={`/notas/${boleto.nota_fiscal_id}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                              Nota #{boleto.nota_fiscal_id}
                            </Link>
                          </td>
                          <td className="px-6 py-5">
                            {boleto.total_parcelas > 1 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">
                                {boleto.numero_parcela}/{boleto.total_parcelas}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-600">à vista</span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <p className="font-mono text-sm text-slate-700 dark:text-slate-300">{boleto.nosso_numero || '—'}</p>
                            {boleto.seu_numero && <p className="text-xs text-slate-400 font-mono">{boleto.seu_numero}</p>}
                          </td>
                          <td className="px-6 py-5">
                            <p className="font-bold text-slate-900 dark:text-white">{fmt(boleto.valor_nominal)}</p>
                            {(boleto.valor_juros > 0 || boleto.valor_multa > 0) && (
                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                +{fmt(boleto.valor_juros + boleto.valor_multa)} juros/multa
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {parseLocalDate(boleto.data_emissao).toLocaleDateString('pt-BR')}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {parseLocalDate(boleto.data_vencimento).toLocaleDateString('pt-BR')}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {boleto.data_pagamento ? parseLocalDate(boleto.data_pagamento).toLocaleDateString('pt-BR') : '—'}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${formaCfg.cls}`}>
                              {formaCfg.label}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg?.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot}`} />
                              {cfg?.label}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-1">
                              {/* Vincular nota */}
                              <button
                                onClick={() => abrirModalVincular(boleto)}
                                title="Vincular Nota Fiscal"
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                              </button>

                              {/* Registrar pagamento */}
                              {podePagar && (
                                <button
                                  onClick={() => abrirModalPagamento(boleto)}
                                  title="Registrar Pagamento"
                                  className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-all"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              )}

                              {/* Baixar PDF */}
                              {boleto.codigo_solicitacao && (
                                <button
                                  onClick={() => baixarPdf(boleto.codigo_solicitacao!)}
                                  disabled={baixandoPdf === boleto.codigo_solicitacao}
                                  title="Baixar PDF"
                                  className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {baixandoPdf === boleto.codigo_solicitacao
                                    ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                  }
                                </button>
                              )}

                              {/* Cancelar na Inter */}
                              {podeAcao && boleto.codigo_solicitacao && (
                                <button
                                  onClick={() => { setModalCancelar({ codigo: boleto.codigo_solicitacao!, nosso_numero: boleto.nosso_numero }); setMotivoCancelamento(''); }}
                                  disabled={cancelandoId === boleto.codigo_solicitacao}
                                  title="Cancelar boleto no Inter"
                                  className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {cancelandoId === boleto.codigo_solicitacao
                                    ? <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  }
                                </button>
                              )}

                              {/* Deletar */}
                              <button
                                onClick={() => deletarBoleto(boleto.id)}
                                disabled={deletandoId === boleto.id}
                                title="Deletar boleto"
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                              >
                                {deletandoId === boleto.id
                                  ? <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                }
                              </button>
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
                  {temFiltroAtivo && (
                    <button onClick={limparFiltros} className="inline-flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">
                      Limpar filtros
                    </button>
                  )}
                  {boletos.length === 0 && (
                    <Link href="/notas" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                      <span>📄</span> Ver Notas Fiscais
                    </Link>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== ABA: NOTAS SEM BOLETO ===== */}
        {pageTab === 'notas_sem_boleto' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Notas Fiscais sem Boleto</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {notasSemBoleto.length} nota{notasSemBoleto.length !== 1 ? 's' : ''} aguardando geração de boleto
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={carregarNotasSemBoleto}
                  disabled={loadingNotasSemBoleto}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:brightness-105 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${loadingNotasSemBoleto ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizar
                </button>
                {notasSemBoletofiltradas.length > 0 && (
                  <button
                    onClick={gerarTodosBoletos}
                    disabled={gerandoTodos}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {gerandoTodos
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
                      : <><span>⚡</span> Gerar Todos ({notasSemBoletofiltradas.length})</>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Busca */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <input
                type="text"
                placeholder="Buscar por número da nota, condomínio ou cliente..."
                value={searchNotasSemBoleto}
                onChange={e => setSearchNotasSemBoleto(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
              />
            </div>

            {/* Tabela notas sem boleto */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              {loadingNotasSemBoleto ? (
                <div className="py-16 text-center">
                  <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">Carregando notas...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        {['ID', 'Número Nota', 'Condomínio / Cliente', 'Valor', 'Vencimento', 'Status', 'Ação'].map(h => (
                          <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {notasSemBoletofiltradas.map(nota => {
                        const vencida = parseLocalDate(nota.data_vencimento) < new Date();
                        return (
                          <tr key={nota.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">#{nota.id}</td>
                            <td className="px-6 py-4">
                              <Link href={`/notas/${nota.id}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                {nota.numero_nota || `Nota #${nota.id}`}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-slate-700 dark:text-slate-300">
                                {nota.condominio?.nome || nota.cliente_nome || '—'}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-900 dark:text-white">{fmt(nota.valor)}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                {parseLocalDate(nota.data_vencimento).toLocaleDateString('pt-BR')}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              {vencida ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  Vencida
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  OK
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => abrirModalGerarBoleto(nota)}
                                  className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:brightness-110 transition-all flex items-center gap-1.5"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Inter
                                </button>
                                <button
                                  onClick={() => abrirModalBoletoManual(nota)}
                                  title="Criar boleto manual (PIX, dinheiro, outro banco)"
                                  className="px-3 py-2 bg-green-600 text-white rounded-xl font-bold text-xs hover:brightness-110 transition-all flex items-center gap-1.5"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                  Manual
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {notasSemBoletofiltradas.length === 0 && (
                    <div className="py-16 text-center">
                      <span className="text-4xl mb-4 block">✅</span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        {notasSemBoleto.length === 0 ? 'Todas as notas têm boleto!' : 'Nenhuma nota encontrada'}
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400">
                        {notasSemBoleto.length === 0
                          ? 'Todas as notas fiscais já possuem boleto gerado.'
                          : 'Tente ajustar o termo de busca.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Sincronizar do Inter */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full mb-4">
                <span className="text-3xl">🏦</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Importar do Banco Inter</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Busca todas as cobranças no período e cria vínculos com as notas fiscais cadastradas.
              </p>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data Inicial</label>
                <input type="date" value={syncDataInicio} onChange={e => setSyncDataInicio(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data Final</label>
                <input type="date" value={syncDataFim} onChange={e => setSyncDataFim(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSyncModal(false)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
                Cancelar
              </button>
              <button onClick={sincronizarInter}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar cancelamento */}
      {modalCancelar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Cancelar Boleto no Inter</h2>
              <p className="text-slate-600 dark:text-slate-400">
                Boleto <span className="font-mono font-bold">{modalCancelar.nosso_numero || modalCancelar.codigo}</span> será cancelado no Banco Inter. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Motivo do cancelamento (opcional)</label>
              <textarea value={motivoCancelamento} onChange={e => setMotivoCancelamento(e.target.value)} rows={3}
                placeholder="Ex: Pagamento realizado por outro meio..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalCancelar(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
                Voltar
              </button>
              <button onClick={confirmarCancelamento}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                Cancelar Boleto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Pagamento */}
      {modalPagamento && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full mb-4">
                <span className="text-3xl">💳</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Registrar Pagamento</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Nota #{modalPagamento.nota_fiscal_id}
                {modalPagamento.total_parcelas > 1 && ` — Parcela ${modalPagamento.numero_parcela}/${modalPagamento.total_parcelas}`}
              </p>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data de Pagamento</label>
                <input
                  type="date"
                  value={pagDataPagamento}
                  onChange={e => setPagDataPagamento(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Valor Recebido (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pagValorRecebido}
                  onChange={e => setPagValorRecebido(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Forma de Pagamento</label>
                <select
                  value={pagFormaPagamento}
                  onChange={e => setPagFormaPagamento(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                >
                  {FORMAS_PAGAMENTO.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              {(pagFormaPagamento === 'BOLETO_ITAU' || pagFormaPagamento === 'TRANSFERENCIA') && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Banco / Instituição</label>
                  <input
                    type="text"
                    placeholder="Ex: Itaú, Bradesco, Nubank..."
                    value={pagBancoPagamento}
                    onChange={e => setPagBancoPagamento(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Observação (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Pago via PIX pelo síndico..."
                  value={pagObservacao}
                  onChange={e => setPagObservacao(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModalPagamento(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPagamento}
                disabled={registrandoPagamento || !pagDataPagamento || !pagValorRecebido}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {registrandoPagamento
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular Nota */}
      {modalVincular && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] flex flex-col">
            <div className="text-center mb-6 shrink-0">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-500/20 rounded-full mb-4">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Vincular Nota ao Boleto</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Boleto #{modalVincular.id} — atual: Nota #{modalVincular.nota_fiscal_id}
              </p>
            </div>

            <div className="shrink-0 mb-4">
              <input
                type="text"
                placeholder="Buscar nota por número, condomínio ou cliente..."
                value={notaSearchVincular}
                onChange={e => setNotaSearchVincular(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 border border-slate-200 dark:border-slate-800 rounded-xl">
              {notasVincularFiltradas.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Nenhuma nota encontrada</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {notasVincularFiltradas.map(nota => (
                    <button
                      key={nota.id}
                      onClick={() => setNotaSelecionadaId(nota.id)}
                      className={`w-full text-left px-4 py-3 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        notaSelecionadaId === nota.id ? 'bg-blue-50 dark:bg-blue-500/10 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">
                            Nota #{nota.id} — {nota.numero_nota || 'sem número'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {nota.condominio?.nome || nota.cliente_nome || '—'} · Venc: {parseLocalDate(nota.data_vencimento).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white shrink-0 ml-4">{fmt(nota.valor)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 shrink-0">
              <button
                onClick={() => setModalVincular(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarVincular}
                disabled={vinculando || !notaSelecionadaId}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {vinculando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Vinculando...</>
                  : 'Vincular Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar Boleto para Nota */}
      {modalGerarBoleto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 rounded-full mb-4">
                <span className="text-3xl">🏦</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Gerar Boleto</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Nota #{modalGerarBoleto.id} — {fmt(modalGerarBoleto.valor)}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {modalGerarBoleto.condominio?.nome || modalGerarBoleto.cliente_nome || '—'}
              </p>
            </div>

            {parseLocalDate(modalGerarBoleto.data_vencimento) < new Date() && (
              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/30 rounded-xl p-4 mb-6">
                <p className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-1">Nota vencida</p>
                <p className="text-xs text-orange-600 dark:text-orange-500">
                  A data de vencimento original ({parseLocalDate(modalGerarBoleto.data_vencimento).toLocaleDateString('pt-BR')}) já passou.
                  Informe uma nova data de vencimento para o boleto.
                </p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              {parseLocalDate(modalGerarBoleto.data_vencimento) < new Date() && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Nova Data de Vencimento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={gerarDataVencOverride}
                    min={hoje}
                    onChange={e => setGerarDataVencOverride(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalGerarBoleto(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarGerarBoleto}
                disabled={gerando || (parseLocalDate(modalGerarBoleto.data_vencimento) < new Date() && !gerarDataVencOverride)}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gerando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
                  : 'Gerar Boleto'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Criar Boleto Manual */}
      {modalBoletoManual && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full mb-4">
                <span className="text-3xl">📋</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Boleto Manual</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Nota #{modalBoletoManual.id} — {fmt(modalBoletoManual.valor)}
                {modalBoletoManual.condominio?.nome && ` · ${modalBoletoManual.condominio.nome}`}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">PIX, dinheiro, cheque ou boleto de outro banco</p>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Forma de Pagamento</label>
                <select value={manualForma} onChange={e => setManualForma(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none">
                  {FORMAS_PAGAMENTO.filter(f => f.value !== 'BOLETO_INTER').map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              {(manualForma === 'BOLETO_ITAU' || manualForma === 'TRANSFERENCIA') && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Banco / Instituição</label>
                  <input type="text" placeholder="Ex: Itaú, Bradesco..." value={manualBanco} onChange={e => setManualBanco(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Valor (R$) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" value={manualValor} onChange={e => setManualValor(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Vencimento <span className="text-red-500">*</span></label>
                  <input type="date" value={manualDataVenc} onChange={e => setManualDataVenc(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Observação (opcional)</label>
                <textarea rows={2} placeholder="Ex: Pago pelo síndico em dinheiro..." value={manualObs} onChange={e => setManualObs(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none" />
              </div>

              {/* Opção: já pago */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={manualJaPago} onChange={e => setManualJaPago(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500" />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Já foi pago</span>
                </label>
                {manualJaPago && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Data de Pagamento</label>
                      <input type="date" value={manualDataPag} onChange={e => setManualDataPag(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Valor Recebido (R$)</label>
                      <input type="number" min="0" step="0.01" value={manualValorRec} onChange={e => setManualValorRec(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalBoletoManual(null)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarBoletoManual} disabled={criandoManual || !manualValor || !manualDataVenc}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {criandoManual
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Criando...</>
                  : 'Criar Boleto Manual'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
