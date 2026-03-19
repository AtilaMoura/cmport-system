"use client"

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: 'ASSISTENCIA' | 'MANUTENCAO' | 'OUTROS';
  status: 'AUTORIZADA' | 'CANCELADA' | 'DESCONHECIDO';
  parcelas: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  condominio_id: number | null;
  criado_em: string;
}

interface Condominio {
  id: number;
  nome: string;
}

interface Boleto {
  id: number;
  nota_fiscal_id: number;
  codigo_solicitacao: string | null;
  nosso_numero: string | null;
  valor_nominal: number;
  data_vencimento: string;
  situacao: 'EMABERTO' | 'PAGO' | 'CANCELADO' | 'EXPIRADO' | 'VENCIDO' | 'BAIXADO';
  numero_parcela: number;
  total_parcelas: number;
}

interface ConfigImpostos {
  pct_pis: number;
  pct_cofins: number;
  pct_inss: number;
  pct_csll: number;
  valor_bruto: number;
  valor_liquido: number;
  numero_os: string | null;
  aplicar_juros_default: boolean;
}

type TabType = 'geral' | 'lista' | 'receber';

const SITUACAO_CONFIG: Record<string, { label: string; cls: string }> = {
  EMABERTO: { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  PAGO:     { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  CANCELADO:{ label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  EXPIRADO: { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  VENCIDO:  { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' },
  BAIXADO:  { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' },
};

function pd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function NotasPage() {
  const [notas, setNotas]           = useState<NotaFiscal[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [boletos, setBoletos]       = useState<Record<number, Boleto[]>>({});
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<TabType>('geral');

  // Filtros (sempre ativos, afetam todas as tabs)
  const [filtroTipo, setFiltroTipo]           = useState<string>('todos');
  const [search, setSearch]                   = useState('');
  const [filtroMes, setFiltroMes]             = useState('');   // "YYYY-MM"
  const [dataInicio, setDataInicio]           = useState('');
  const [dataFim, setDataFim]                 = useState('');
  const [valorMin, setValorMin]               = useState('');
  const [valorMax, setValorMax]               = useState('');
  const [condominioSelecionado, setCondominioSelecionado] = useState<number | null>(null);
  const [showFiltrosAvancados, setShowFiltrosAvancados]   = useState(false);

  const [selecionadas, setSelecionadas]   = useState<Set<number>>(new Set());
  const [gerandoBoletos, setGerandoBoletos] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [revalidarMsg, setRevalidarMsg] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('AUTORIZADA');

  // Modal geração em massa
  const [modalMassaAberto, setModalMassaAberto] = useState(false);
  const [modalMassaStep, setModalMassaStep] = useState<1 | 2 | 3>(1);
  const [configsNotas, setConfigsNotas] = useState<Record<number, ConfigImpostos>>({});
  const [carregandoConfigs, setCarregandoConfigs] = useState(false);
  const [massaMensagem, setMassaMensagem] = useState('');
  const [massaDataVencimento, setMassaDataVencimento] = useState('');
  const [massaAplicarJuros, setMassaAplicarJuros] = useState<boolean | null>(null);
  const [massaTaxaJuros, setMassaTaxaJuros] = useState(1.0);
  const [progressoMassa, setProgressoMassa] = useState<Record<number, 'pendente' | 'gerando' | 'ok' | 'erro'>>({});
  const [resultadosMassa, setResultadosMassa] = useState<{ notaId: number; erro?: string }[]>([]);

  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    try {
      const [notasRes, condosRes, boletosRes] = await Promise.all([
        api.get('/notas-fiscais/'),
        api.get('/condominios/'),
        api.get('/boletos/'),
      ]);
      setNotas(notasRes.data);
      setCondominios(condosRes.data);
      const map: Record<number, Boleto[]> = {};
      for (const b of boletosRes.data) {
        if (!map[b.nota_fiscal_id]) map[b.nota_fiscal_id] = [];
        map[b.nota_fiscal_id].push(b);
      }
      // Ordena parcelas por numero_parcela
      for (const key of Object.keys(map)) map[Number(key)].sort((a, b) => a.numero_parcela - b.numero_parcela);
      setBoletos(map);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);
      if (condominioSelecionado) params.append('condominio_id', String(condominioSelecionado));
      if (filtroTipo !== 'todos') params.append('tipo', filtroTipo);
      const response = await api.get(`notas-fiscais/exportar?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `notas_fiscais_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Erro ao exportar relatorio');
    }
  };

  const toggleSelecionada = (id: number) => {
    setSelecionadas(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelecionarTodas = (lista: NotaFiscal[]) => {
    const semBoleto = lista.filter(n => !boletos[n.id]?.length);
    const allSel = semBoleto.every(n => selecionadas.has(n.id));
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (allSel) semBoleto.forEach(n => next.delete(n.id));
      else semBoleto.forEach(n => next.add(n.id));
      return next;
    });
  };

  const abrirModalMassa = async () => {
    if (selecionadas.size === 0) return;
    setModalMassaAberto(true);
    setModalMassaStep(1);
    setMassaMensagem('');
    setMassaDataVencimento('');
    setMassaAplicarJuros(null);
    setMassaTaxaJuros(1.0);
    setProgressoMassa({});
    setResultadosMassa([]);
    setCarregandoConfigs(true);
    setConfigsNotas({});

    const configs: Record<number, ConfigImpostos> = {};
    for (const id of Array.from(selecionadas)) {
      try {
        const res = await api.get(`/boletos/config-impostos/${id}`);
        configs[id] = res.data;
      } catch {
        const nota = notas.find(n => n.id === id);
        configs[id] = {
          pct_pis: 0.65, pct_cofins: 3, pct_inss: 11, pct_csll: 1,
          valor_bruto: nota?.valor || 0,
          valor_liquido: nota?.valor ? nota.valor * (1 - (0.65 + 3 + 11 + 1) / 100) : 0,
          numero_os: null,
          aplicar_juros_default: nota?.tipo !== 'OUTROS',
        };
      }
    }
    setConfigsNotas(configs);
    setCarregandoConfigs(false);
  };

  const executarGeracaoMassa = async () => {
    setModalMassaStep(3);
    setGerandoBoletos(true);
    const notaIds = Array.from(selecionadas);
    const initProg: Record<number, 'pendente' | 'gerando' | 'ok' | 'erro'> = {};
    notaIds.forEach(id => { initProg[id] = 'pendente'; });
    setProgressoMassa(initProg);

    const resultados: { notaId: number; erro?: string }[] = [];

    for (const notaId of notaIds) {
      setProgressoMassa(prev => ({ ...prev, [notaId]: 'gerando' }));
      try {
        const config = configsNotas[notaId];
        const aplicarJuros = massaAplicarJuros !== null ? massaAplicarJuros : config?.aplicar_juros_default ?? true;
        const payload: Record<string, unknown> = {
          nota_ids: [notaId],
          pct_pis: config?.pct_pis,
          pct_cofins: config?.pct_cofins,
          pct_inss: config?.pct_inss,
          pct_csll: config?.pct_csll,
          aplicar_juros: aplicarJuros,
          taxa_juros: massaTaxaJuros,
        };
        if (massaDataVencimento) payload.data_vencimento_override = massaDataVencimento;
        if (massaMensagem) payload.mensagem = massaMensagem;

        const res = await api.post('/boletos/gerar', payload);
        if (res.data.erros?.length > 0) {
          throw new Error(res.data.erros[0]?.erro || 'Erro ao gerar');
        }
        setProgressoMassa(prev => ({ ...prev, [notaId]: 'ok' }));
        resultados.push({ notaId });
      } catch (err: unknown) {
        setProgressoMassa(prev => ({ ...prev, [notaId]: 'erro' }));
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        resultados.push({ notaId, erro: msg });
      }
    }

    setResultadosMassa(resultados);
    setGerandoBoletos(false);
    await carregarDados();
    setSelecionadas(new Set());
  };

  const revalidarXmls = async () => {
    setRevalidando(true);
    setRevalidarMsg(null);
    try {
      const res = await api.post('/notas-fiscais/revalidar-todas');
      setRevalidarMsg(res.data.mensagem);
      await carregarDados();
    } catch {
      setRevalidarMsg('Erro ao revalidar XMLs.');
    } finally {
      setRevalidando(false);
    }
  };

  const limparFiltros = () => {
    setFiltroTipo('todos'); setSearch(''); setFiltroMes('');
    setDataInicio(''); setDataFim(''); setValorMin(''); setValorMax('');
    setCondominioSelecionado(null); setFiltroStatus('AUTORIZADA');
  };

  const temFiltroAtivo = filtroTipo !== 'todos' || search || filtroMes || dataInicio || dataFim || valorMin || valorMax || condominioSelecionado || filtroStatus !== 'AUTORIZADA';

  // notasFiltradas reflete todos os filtros ativos
  const notasFiltradas = useMemo(() => notas.filter(nota => {
    if (filtroStatus !== 'todos' && nota.status !== filtroStatus) return false;
    if (filtroTipo !== 'todos' && nota.tipo !== filtroTipo) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!nota.numero_nota.toLowerCase().includes(q) && !nota.cliente_nome?.toLowerCase().includes(q)) return false;
    }
    const venc = pd(nota.data_vencimento);
    if (filtroMes) {
      const [y, m] = filtroMes.split('-').map(Number);
      if (venc.getFullYear() !== y || venc.getMonth() + 1 !== m) return false;
    }
    if (dataInicio && venc < pd(dataInicio)) return false;
    if (dataFim && venc > pd(dataFim)) return false;
    if (valorMin && nota.valor < parseFloat(valorMin)) return false;
    if (valorMax && nota.valor > parseFloat(valorMax)) return false;
    if (condominioSelecionado && nota.condominio_id !== condominioSelecionado) return false;
    return true;
  }), [notas, filtroTipo, search, filtroMes, dataInicio, dataFim, valorMin, valorMax, condominioSelecionado]);

  const notasAReceber = useMemo(() => notasFiltradas.filter(n => !n.data_pagamento), [notasFiltradas]);

  const stats = useMemo(() => ({
    total:       notasFiltradas.length,
    assistencias: notasFiltradas.filter(n => n.tipo === 'ASSISTENCIA').length,
    manutencoes:  notasFiltradas.filter(n => n.tipo === 'MANUTENCAO').length,
    valorTotal:  notasFiltradas.reduce((sum, n) => sum + n.valor, 0),
    valorReceber: notasAReceber.reduce((sum, n) => sum + n.valor, 0),
    mediaValor:  notasFiltradas.length > 0 ? notasFiltradas.reduce((sum, n) => sum + n.valor, 0) / notasFiltradas.length : 0,
  }), [notasFiltradas, notasAReceber]);

  // Top 5 condominios por valor (filtrado)
  const top5Condominios = useMemo(() => {
    return [...condominios]
      .map(c => ({ nome: c.nome, valor: notasFiltradas.filter(n => n.condominio_id === c.id).reduce((s, n) => s + n.valor, 0) }))
      .filter(c => c.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [condominios, notasFiltradas]);

  const distribuicaoTipoData = useMemo(() => ({
    labels: ['Assistencia', 'Manutencao', 'Outros'],
    datasets: [{
      data: [
        notasFiltradas.filter(n => n.tipo === 'ASSISTENCIA').length,
        notasFiltradas.filter(n => n.tipo === 'MANUTENCAO').length,
        notasFiltradas.filter(n => n.tipo === 'OUTROS').length,
      ],
      backgroundColor: ['#3b82f6', '#7c3aed', '#64748b'],
      borderWidth: 0,
    }],
  }), [notasFiltradas]);

  const valorPorCondominioData = useMemo(() => ({
    labels: top5Condominios.map(c => c.nome.length > 20 ? c.nome.slice(0, 20) + '…' : c.nome),
    datasets: [{
      label: 'Valor Total',
      data: top5Condominios.map(c => c.valor),
      backgroundColor: '#1e3a5f',
      borderRadius: 8,
    }],
  }), [top5Condominios]);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case 'MANUTENCAO':  return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400';
      default:            return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return '🔧';
      case 'MANUTENCAO':  return '🛠️';
      default:            return '📄';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando notas...</p>
        </div>
      </div>
    );
  }

  const listaAtiva = activeTab === 'receber' ? notasAReceber : notasFiltradas;
  const semBoletoVisiveis = listaAtiva.filter(n => !boletos[n.id]?.length);
  const selecionadasCount = Array.from(selecionadas).filter(id => listaAtiva.some(n => n.id === id)).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-orange-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Notas Fiscais</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">Gestao completa de faturamento</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href="/boletos" className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2">
                <span className="text-xl">🏦</span> Boletos
              </Link>
              <button onClick={revalidarXmls} disabled={revalidando}
                className="bg-amber-600 text-white px-5 py-3 rounded-2xl font-black shadow-lg shadow-amber-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
                {revalidando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Revalidando...</>
                  : <><span>🔍</span> Revalidar XMLs</>}
              </button>
              <button onClick={exportarExcel} className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2">
                <span className="text-xl">📊</span> Exportar
              </button>
              <Link href="/notas/importar" className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2">
                <span className="text-xl">📤</span> Importar XMLs
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Revalidar feedback */}
      {revalidarMsg && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-800/30">
          <div className="max-w-7xl mx-auto px-8 py-2 flex items-center justify-between">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{revalidarMsg}</p>
            <button onClick={() => setRevalidarMsg(null)} className="text-amber-500 hover:text-amber-700 text-lg">×</button>
          </div>
        </div>
      )}

      {/* Filtros sempre visiveis */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-4 space-y-3">
          {/* Filtro status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status:</span>
            {[
              { v: 'AUTORIZADA', label: '✓ Autorizadas', cls: 'bg-green-600' },
              { v: 'CANCELADA', label: '✕ Canceladas', cls: 'bg-red-600' },
              { v: 'DESCONHECIDO', label: '? Desconhecido', cls: 'bg-slate-500' },
              { v: 'todos', label: 'Todas', cls: 'bg-slate-700' },
            ].map(opt => (
              <button key={opt.v} onClick={() => setFiltroStatus(opt.v)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${filtroStatus === opt.v ? `${opt.cls} text-white` : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* Linha rapida */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar numero ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
            />
            <input
              type="month"
              value={filtroMes}
              onChange={e => { setFiltroMes(e.target.value); setDataInicio(''); setDataFim(''); }}
              className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
            />
            {['todos', 'ASSISTENCIA', 'MANUTENCAO'].map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === t
                  ? t === 'todos' ? 'bg-orange-600 text-white' : t === 'ASSISTENCIA' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {t === 'todos' ? 'Todos' : t === 'ASSISTENCIA' ? '🔧 Assistencia' : '🛠️ Manutencao'}
              </button>
            ))}
            <button
              onClick={() => setShowFiltrosAvancados(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 transition-all"
            >
              <svg className={`w-3 h-3 transition-transform ${showFiltrosAvancados ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Avancados
            </button>
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 transition-all">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Limpar
              </button>
            )}
          </div>

          {/* Filtros avancados */}
          {showFiltrosAvancados && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Venc. De</label>
                <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Venc. Ate</label>
                <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Valor Min</label>
                <input type="number" min="0" step="0.01" placeholder="0,00" value={valorMin} onChange={e => setValorMin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Valor Max</label>
                <input type="number" min="0" step="0.01" placeholder="9999,99" value={valorMax} onChange={e => setValorMax(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Condominio</label>
                <select value={condominioSelecionado || ''} onChange={e => setCondominioSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                  <option value="">Todos</option>
                  {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exibindo <span className="font-bold text-slate-700 dark:text-slate-300">{notasFiltradas.length}</span> de <span className="font-bold">{notas.length}</span> notas
            {temFiltroAtivo && <span className="ml-1 text-orange-600 dark:text-orange-400">(com filtros ativos)</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-1">
            {[
              { key: 'geral',   label: '📊 Visao Geral' },
              { key: 'lista',   label: '📋 Todas as Notas' },
              { key: 'receber', label: `💰 A Receber (${notasAReceber.length})` },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as TabType)}
                className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === tab.key
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* TAB: Visao Geral */}
        {activeTab === 'geral' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl"><span className="text-2xl">📄</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Notas Emitidas</p>
              </div>

              <div className="gradient-brand p-6 rounded-2xl shadow-lg text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl"><span className="text-2xl">💰</span></div>
                  <span className="text-xs font-bold text-white/70">FATURAMENTO</span>
                </div>
                <p className="text-3xl font-black text-white mb-1">{fmt(stats.valorTotal)}</p>
                <p className="text-sm text-white/80 font-semibold">Valor Total</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl"><span className="text-2xl">📈</span></div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">A RECEBER</span>
                </div>
                <p className="text-3xl font-black text-green-900 dark:text-green-400 mb-1">{fmt(stats.valorReceber)}</p>
                <p className="text-sm text-green-700 dark:text-green-500 font-semibold">{notasAReceber.length} notas pendentes</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl"><span className="text-2xl">📊</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">MEDIA</span>
                </div>
                <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">{fmt(stats.mediaValor)}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Valor Medio</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span> Distribuicao por Tipo
                </h3>
                <div className="h-64">
                  <Doughnut data={distribuicaoTipoData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📊</span> Top 5 Condominios (Valor)
                </h3>
                {top5Condominios.length > 0 ? (
                  <div className="h-64">
                    <Bar data={valorPorCondominioData} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }} />
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400">Sem dados com filtros ativos</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Lista / A Receber */}
        {(activeTab === 'lista' || activeTab === 'receber') && (
          <div className="space-y-6">
            {selecionadasCount > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 rounded-2xl px-6 py-4 flex items-center justify-between">
                <p className="text-indigo-700 dark:text-indigo-400 font-bold">{selecionadasCount} nota(s) selecionada(s) sem boleto</p>
                <button onClick={abrirModalMassa} disabled={gerandoBoletos}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
                  {gerandoBoletos ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</> : <><span>🏦</span> Gerar Boleto(s)</>}
                </button>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-4 w-10">
                        {semBoletoVisiveis.length > 0 && (
                          <input type="checkbox"
                            checked={semBoletoVisiveis.every(n => selecionadas.has(n.id))}
                            onChange={() => toggleSelecionarTodas(listaAtiva)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        )}
                      </th>
                      {['Nota Fiscal', 'Tipo', 'Status', 'Cliente', 'Valor', 'Vencimento', 'Boleto', 'Acoes'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {listaAtiva.map(nota => {
                      const notaBoletos = boletos[nota.id] || [];
                      const isSel = selecionadas.has(nota.id);
                      const totalParcelas = notaBoletos.length;
                      const pagas = notaBoletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length;
                      const vencidas = notaBoletos.filter(b => b.situacao === 'VENCIDO').length;
                      return (
                        <tr key={nota.id} className={`group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}>
                          <td className="px-4 py-5">
                            {!totalParcelas && <input type="checkbox" checked={isSel} onChange={() => toggleSelecionada(nota.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                                <span className="text-lg">{getTipoIcon(nota.tipo)}</span>
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">{nota.numero_nota}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{nota.parcelas > 1 ? `${nota.parcelas}x` : 'A vista'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(nota.tipo)}`}>{nota.tipo}</span>
                          </td>
                          <td className="px-6 py-5">
                            {nota.status === 'AUTORIZADA' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">✓ Autorizada</span>
                            )}
                            {nota.status === 'CANCELADA' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">✕ Cancelada</span>
                            )}
                            {nota.status === 'DESCONHECIDO' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">? Desconhecido</span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{nota.cliente_nome || 'Nao informado'}</p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(nota.valor)}</p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300">{pd(nota.data_vencimento).toLocaleDateString('pt-BR')}</p>
                          </td>
                          <td className="px-6 py-5 min-w-[160px]">
                            {totalParcelas === 0 ? (
                              <span className="text-xs text-slate-400 dark:text-slate-600">sem boleto</span>
                            ) : totalParcelas === 1 ? (
                              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${SITUACAO_CONFIG[notaBoletos[0].situacao]?.cls}`}>
                                {SITUACAO_CONFIG[notaBoletos[0].situacao]?.label}
                              </span>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{pagas}/{totalParcelas} pagas</span>
                                  {vencidas > 0 && <span className="text-orange-600 dark:text-orange-400 font-bold">{vencidas} vencida(s)</span>}
                                </div>
                                <div className="flex gap-1">
                                  {notaBoletos.map(b => (
                                    <div
                                      key={b.id}
                                      title={`Parcela ${b.numero_parcela}: ${SITUACAO_CONFIG[b.situacao]?.label}`}
                                      className={`h-2 flex-1 rounded-full ${
                                        b.situacao === 'PAGO' || b.situacao === 'BAIXADO' ? 'bg-green-500' :
                                        b.situacao === 'VENCIDO' ? 'bg-orange-500' :
                                        b.situacao === 'CANCELADO' ? 'bg-red-400' :
                                        b.situacao === 'EXPIRADO' ? 'bg-slate-400' :
                                        'bg-blue-400'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <Link href={`/notas/${nota.id}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-all group-hover:translate-x-1">
                              Ver detalhes
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {listaAtiva.length === 0 && (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full"><span className="text-3xl">📄</span></div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhuma nota encontrada</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">Ajuste os filtros ou importe novas XMLs</p>
                  <Link href="/notas/importar" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                    <span>📤</span> Importar XMLs
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Geração em Massa */}
      {modalMassaAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Geração em Massa de Boletos</h2>
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3].map(s => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        modalMassaStep === s ? 'bg-indigo-600 text-white' :
                        modalMassaStep > s ? 'bg-green-500 text-white' :
                        'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>{modalMassaStep > s ? '✓' : s}</div>
                      {s < 3 && <div className={`w-8 h-0.5 ${modalMassaStep > s ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                    </div>
                  ))}
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    {modalMassaStep === 1 ? 'Revisar Notas' : modalMassaStep === 2 ? 'Configurações' : 'Progresso'}
                  </span>
                </div>
              </div>
              {modalMassaStep !== 3 && (
                <button onClick={() => setModalMassaAberto(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none">&times;</button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Step 1: Revisar notas */}
              {modalMassaStep === 1 && (
                <div className="space-y-4">
                  {carregandoConfigs ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span className="ml-3 text-slate-600 dark:text-slate-400 font-semibold">Calculando valores líquidos...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-900 dark:text-white">{selecionadas.size}</span> nota(s) selecionada(s). Revise os valores antes de prosseguir.
                      </p>
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Nota</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Tipo</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Valor Bruto</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Impostos</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Valor Líquido</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Juros</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {Array.from(selecionadas).map(notaId => {
                              const nota = notas.find(n => n.id === notaId);
                              const cfg = configsNotas[notaId];
                              const totalPct = cfg ? cfg.pct_pis + cfg.pct_cofins + cfg.pct_inss + cfg.pct_csll : 0;
                              return (
                                <tr key={notaId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{nota?.numero_nota || `#${notaId}`}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getTipoColor(nota?.tipo || '')}`}>{nota?.tipo}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{fmt(cfg?.valor_bruto ?? nota?.valor ?? 0)}</td>
                                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 text-xs">-{totalPct.toFixed(2)}%</td>
                                  <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400">{fmt(cfg?.valor_liquido ?? 0)}</td>
                                  <td className="px-4 py-3 text-center">
                                    {cfg?.aplicar_juros_default
                                      ? <span className="text-xs text-orange-600 dark:text-orange-400 font-bold">Sim</span>
                                      : <span className="text-xs text-slate-400">Não</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                              <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Total Líquido</td>
                              <td className="px-4 py-3 text-right font-black text-green-600 dark:text-green-400">
                                {fmt(Object.values(configsNotas).reduce((s, c) => s + c.valor_liquido, 0))}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Configurações globais */}
              {modalMassaStep === 2 && (
                <div className="space-y-6">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Configurações aplicadas a todos os boletos desta geração. Campos em branco usam os padrões por tipo.
                  </p>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data de vencimento (opcional)</label>
                    <input
                      type="date"
                      value={massaDataVencimento}
                      onChange={e => setMassaDataVencimento(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Se não informada, usa vencimento original da nota (ou hoje +5 dias se já vencida).</p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Mensagem padrão (opcional)</label>
                    <input
                      type="text"
                      value={massaMensagem}
                      onChange={e => setMassaMensagem(e.target.value)}
                      placeholder="Ex: Ref. manutenção março/2026"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Se vazio, cada boleto usará &quot;OS: {'{num}'} | NF: {'{numero}'}&quot;.</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="massaJuros"
                        checked={massaAplicarJuros === null ? false : massaAplicarJuros}
                        onChange={e => setMassaAplicarJuros(e.target.checked ? true : null)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="massaJuros" className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Forçar aplicação de juros em todos
                      </label>
                    </div>
                    {massaAplicarJuros === null && (
                      <p className="text-xs text-slate-500">Cada nota usa seu padrão: MANUTENCAO/ASSISTENCIA aplicam juros, OUTROS não.</p>
                    )}
                    {massaAplicarJuros !== null && (
                      <div className="flex items-center gap-3 pl-7">
                        <label className="text-sm text-slate-600 dark:text-slate-400">Taxa % a.m.:</label>
                        <input
                          type="number"
                          min="0" max="10" step="0.1"
                          value={massaTaxaJuros}
                          onChange={e => setMassaTaxaJuros(parseFloat(e.target.value) || 1.0)}
                          className="w-24 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Progresso */}
              {modalMassaStep === 3 && (
                <div className="space-y-3">
                  {Array.from(selecionadas).map(notaId => {
                    const nota = notas.find(n => n.id === notaId);
                    const status = progressoMassa[notaId] || 'pendente';
                    const resultado = resultadosMassa.find(r => r.notaId === notaId);
                    return (
                      <div key={notaId} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                        status === 'ok' ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-800' :
                        status === 'erro' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800' :
                        status === 'gerando' ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-800' :
                        'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}>
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                          {status === 'pendente' && <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                          {status === 'gerando' && <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />}
                          {status === 'ok' && <span className="text-green-500 text-xl">✓</span>}
                          {status === 'erro' && <span className="text-red-500 text-xl">✕</span>}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{nota?.numero_nota || `Nota #${notaId}`}</p>
                          {resultado?.erro && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{resultado.erro}</p>}
                          {status === 'ok' && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Boleto gerado com sucesso</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-600 dark:text-green-400">
                            {fmt(configsNotas[notaId]?.valor_liquido ?? 0)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {resultadosMassa.length > 0 && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {resultadosMassa.filter(r => !r.erro).length} boleto(s) gerado(s) com sucesso
                        {resultadosMassa.filter(r => r.erro).length > 0 && ` · ${resultadosMassa.filter(r => r.erro).length} erro(s)`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                {modalMassaStep === 1 && !carregandoConfigs && (
                  <button onClick={() => setModalMassaAberto(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                    Cancelar
                  </button>
                )}
                {modalMassaStep === 2 && (
                  <button onClick={() => setModalMassaStep(1)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                    ← Voltar
                  </button>
                )}
                {modalMassaStep === 3 && resultadosMassa.length > 0 && (
                  <button onClick={() => setModalMassaAberto(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                    Fechar
                  </button>
                )}
              </div>
              <div>
                {modalMassaStep === 1 && !carregandoConfigs && (
                  <button onClick={() => setModalMassaStep(2)} className="px-6 py-2.5 rounded-xl text-sm font-black bg-indigo-600 text-white hover:brightness-110 transition-all">
                    Configurar →
                  </button>
                )}
                {modalMassaStep === 2 && (
                  <button onClick={executarGeracaoMassa} className="px-6 py-2.5 rounded-xl text-sm font-black bg-indigo-600 text-white hover:brightness-110 transition-all flex items-center gap-2">
                    <span>🏦</span> Gerar {selecionadas.size} Boleto(s)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
