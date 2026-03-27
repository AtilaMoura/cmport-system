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
  nota_vinculada_id: number | null;
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
  const [vinculando, setVinculando] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const [revalidarMsg, setRevalidarMsg] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('AUTORIZADA');

  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    try {
      const [notasRes, condosRes, boletosRes] = await Promise.all([
        api.get('/notas-fiscais'),
        api.get('/condominios'),
        api.get('/boletos'),
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

  // Notas elegíveis para vínculo: MANUT/ASSIST, sem vinculo atual
  const elegivel = (n: NotaFiscal) =>
    (n.tipo === 'ASSISTENCIA' || n.tipo === 'MANUTENCAO') && !n.nota_vinculada_id;

  const toggleSelecionada = (id: number) => {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

  const handleVincularNotas = async () => {
    if (selecionadas.size !== 2) return;
    const [notaAId, notaBId] = Array.from(selecionadas);
    const notaA = notas.find(n => n.id === notaAId);
    const notaB = notas.find(n => n.id === notaBId);
    if (!notaA || !notaB) return;
    if (notaA.condominio_id !== notaB.condominio_id) {
      alert('As duas notas precisam ser do mesmo condomínio.');
      return;
    }
    setVinculando(true);
    try {
      await api.post('/notas-fiscais/vincular-notas', { nota_a_id: notaAId, nota_b_id: notaBId });
      setSelecionadas(new Set());
      await carregarDados();
    } catch {
      alert('Erro ao vincular notas.');
    } finally {
      setVinculando(false);
    }
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
  const selecionadasCount = Array.from(selecionadas).filter(id => listaAtiva.some(n => n.id === id)).length;
  const selecionadasArr = Array.from(selecionadas);
  const notaSel1 = selecionadasArr[0] ? notas.find(n => n.id === selecionadasArr[0]) : null;
  const notaSel2 = selecionadasArr[1] ? notas.find(n => n.id === selecionadasArr[1]) : null;
  const condominiosIguais = notaSel1 && notaSel2 && notaSel1.condominio_id === notaSel2.condominio_id && notaSel1.condominio_id !== null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 lg:gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-orange-600 rounded-full" />
                <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Notas Fiscais</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg ml-5">Gestao completa de faturamento</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Link href="/boletos" className="bg-indigo-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2 text-sm sm:text-base">
                <span>🏦</span> Boletos
              </Link>
              <button onClick={revalidarXmls} disabled={revalidando}
                className="bg-amber-600 text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-amber-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base">
                {revalidando
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Revalidando...</>
                  : <><span>🔍</span> Revalidar</>}
              </button>
              <button onClick={exportarExcel} className="bg-green-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2 text-sm sm:text-base">
                <span>📊</span> Exportar
              </button>
              <Link href="/notas/importar" className="bg-orange-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2 text-sm sm:text-base">
                <span>📤</span> Importar
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Revalidar feedback */}
      {revalidarMsg && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-800/30">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{revalidarMsg}</p>
            <button onClick={() => setRevalidarMsg(null)} className="text-amber-500 hover:text-amber-700 text-lg">×</button>
          </div>
        </div>
      )}

      {/* Filtros sempre visiveis */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-3">
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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* TAB: Visao Geral */}
        {activeTab === 'geral' && (
          <div className="space-y-4 lg:space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6">
              <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl"><span className="text-xl lg:text-2xl">📄</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold">Notas Emitidas</p>
              </div>

              <div className="gradient-brand p-4 lg:p-6 rounded-2xl shadow-lg text-white">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-white/20 backdrop-blur-sm rounded-xl"><span className="text-xl lg:text-2xl">💰</span></div>
                  <span className="text-xs font-bold text-white/70">FATURAMENTO</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-white mb-1">{fmt(stats.valorTotal)}</p>
                <p className="text-xs sm:text-sm text-white/80 font-semibold">Valor Total</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 lg:p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-green-100 dark:bg-green-500/20 rounded-xl"><span className="text-xl lg:text-2xl">📈</span></div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">A RECEBER</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-green-900 dark:text-green-400 mb-1">{fmt(stats.valorReceber)}</p>
                <p className="text-xs sm:text-sm text-green-700 dark:text-green-500 font-semibold">{notasAReceber.length} notas pendentes</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl"><span className="text-xl lg:text-2xl">📊</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">MEDIA</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white mb-1">{fmt(stats.mediaValor)}</p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold">Valor Medio</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
                <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span> Distribuicao por Tipo
                </h3>
                <div className="h-48 sm:h-64">
                  <Doughnut data={distribuicaoTipoData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
                <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📊</span> Top 5 Condominios (Valor)
                </h3>
                {top5Condominios.length > 0 ? (
                  <div className="h-48 sm:h-64">
                    <Bar data={valorPorCondominioData} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }} />
                  </div>
                ) : (
                  <div className="h-48 sm:h-64 flex items-center justify-center text-slate-400">Sem dados com filtros ativos</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Lista / A Receber */}
        {(activeTab === 'lista' || activeTab === 'receber') && (
          <div className="space-y-4 lg:space-y-6">
            {selecionadasCount > 0 && (
              <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-800 rounded-2xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-violet-700 dark:text-violet-400 font-bold">
                    {selecionadasCount}/2 nota(s) selecionada(s) para vínculo
                  </p>
                  {selecionadasCount === 2 && !condominiosIguais && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">As notas devem ser do mesmo condomínio</p>
                  )}
                  {selecionadasCount === 2 && condominiosIguais && (
                    <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                      {notaSel1?.numero_nota} + {notaSel2?.numero_nota} · Total: R$ {((notaSel1?.valor || 0) + (notaSel2?.valor || 0)).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelecionadas(new Set())}
                    className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-xl transition-all">
                    Cancelar
                  </button>
                  <button onClick={handleVincularNotas}
                    disabled={selecionadasCount !== 2 || !condominiosIguais || vinculando}
                    className="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-black hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
                    {vinculando ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Vinculando...</> : <><span>🔗</span> Vincular Notas</>}
                  </button>
                </div>
              </div>
            )}

            {/* Mobile cards (< md) */}
            <div className="md:hidden space-y-3">
              {listaAtiva.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center shadow-sm">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full"><span className="text-3xl">📄</span></div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhuma nota encontrada</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">Ajuste os filtros ou importe novas XMLs</p>
                  <Link href="/notas/importar" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                    <span>📤</span> Importar XMLs
                  </Link>
                </div>
              ) : listaAtiva.map(nota => {
                const notaBoletos = boletos[nota.id] || [];
                const isSel = selecionadas.has(nota.id);
                const totalParcelas = notaBoletos.length;
                const pagas = notaBoletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length;
                return (
                  <div key={nota.id} className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm ${isSel ? 'border-violet-300 dark:border-violet-700' : 'border-slate-200 dark:border-slate-800'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      {elegivel(nota) && (
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelecionada(nota.id)}
                          disabled={!isSel && selecionadas.size >= 2}
                          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-30 mt-1 shrink-0" />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm shrink-0">
                        <span className="text-lg">{getTipoIcon(nota.tipo)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-slate-900 dark:text-white">{nota.numero_nota}</p>
                          {nota.nota_vinculada_id && <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded-full">🔗</span>}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${getTipoColor(nota.tipo)}`}>{nota.tipo}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="font-black text-green-600 dark:text-green-400 text-sm">{fmt(nota.valor)}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{nota.parcelas > 1 ? `${nota.parcelas}x` : 'À vista'}</span>
                          <span className="text-xs text-slate-400">venc. {pd(nota.data_vencimento).toLocaleDateString('pt-BR')}</span>
                        </div>
                        {totalParcelas > 0 && (
                          <div className="mt-2 flex gap-1">
                            {notaBoletos.map(b => (
                              <div key={b.id}
                                title={`Parcela ${b.numero_parcela}: ${SITUACAO_CONFIG[b.situacao]?.label}`}
                                className={`h-1.5 flex-1 rounded-full ${
                                  b.situacao === 'PAGO' || b.situacao === 'BAIXADO' ? 'bg-green-500' :
                                  b.situacao === 'VENCIDO' ? 'bg-orange-500' :
                                  b.situacao === 'CANCELADO' ? 'bg-red-400' :
                                  b.situacao === 'EXPIRADO' ? 'bg-slate-400' : 'bg-blue-400'
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        {totalParcelas > 1 && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{pagas}/{totalParcelas} paga(s)</p>}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                      <Link href={`/notas/${nota.id}`} className="flex items-center gap-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
                        Ver detalhes
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table (md+) */}
            <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-4 w-10"></th>
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
                        <tr key={nota.id} className={`group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isSel ? 'bg-violet-50/50 dark:bg-violet-500/5' : ''}`}>
                          <td className="px-4 py-5">
                            {elegivel(nota) && (
                              <input type="checkbox" checked={isSel}
                                onChange={() => toggleSelecionada(nota.id)}
                                disabled={!isSel && selecionadas.size >= 2}
                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-30" />
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                                <span className="text-lg">{getTipoIcon(nota.tipo)}</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-slate-900 dark:text-white">{nota.numero_nota}</p>
                                  {nota.nota_vinculada_id && (
                                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded-full">🔗</span>
                                  )}
                                </div>
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

    </div>
  );
}
