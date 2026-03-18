"use client"

import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  criado_em: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  valor: number;
  data_vencimento: string;
  status: string;
  condominio_id: number | null;
}

interface Boleto {
  nota_fiscal_id: number;
  situacao: string;
  valor_nominal: number;
}

const BOLETO_STATUS: Record<string, { label: string; cls: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' },
};

interface Condominio {
  id: number;
  nome: string;
}

type TabType = 'geral' | 'lista' | 'manutencoes' | 'assistencias' | 'kpis';

function pd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function ServicosPage() {
  const [servicos, setServicos]           = useState<Servico[]>([]);
  const [condominios, setCondominios]     = useState<Record<number, Condominio>>({});
  const [notas, setNotas]                 = useState<Record<number, NotaFiscal>>({});
  const [boletosPorNota, setBoletosPorNota] = useState<Record<number, Boleto>>({});
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<TabType>('geral');

  // Gerar boleto inline
  const [gerandoBoletoId, setGerandoBoletoId] = useState<number | null>(null);

  // Vincular nota modal
  const [vincularServicoId, setVincularServicoId] = useState<number | null>(null);
  const [vincularNotaId, setVincularNotaId] = useState<string>('');
  const [vinculando, setVinculando] = useState(false);
  const [vincularErro, setVincularErro] = useState<string | null>(null);

  // Filtros (sempre ativos, afetam todas as tabs)
  const [filtroTipo, setFiltroTipo]         = useState<string>('todos');
  const [search, setSearch]                 = useState('');
  const [filtroMes, setFiltroMes]           = useState('');   // "YYYY-MM"
  const [dataInicio, setDataInicio]         = useState('');
  const [dataFim, setDataFim]               = useState('');
  const [condominioSelecionado, setCondominioSelecionado] = useState<number | null>(null);
  const [comNota, setComNota]               = useState<string>('todos');
  const [showFiltrosAvancados, setShowFiltrosAvancados]   = useState(false);

  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    try {
      const [condosRes, servicosRes, notasRes] = await Promise.all([
        api.get('/condominios/'),
        api.get('/servicos/'),
        api.get('/notas-fiscais/'),
      ]);

      const condosMap: Record<number, Condominio> = {};
      condosRes.data.forEach((c: Condominio) => { condosMap[c.id] = c; });
      setCondominios(condosMap);

      setServicos(servicosRes.data);

      const notasMap: Record<number, NotaFiscal> = {};
      notasRes.data.forEach((n: NotaFiscal) => { notasMap[n.id] = n; });
      setNotas(notasMap);

      try {
        const boletosRes = await api.get('/boletos/');
        const map: Record<number, Boleto> = {};
        boletosRes.data.forEach((b: Boleto) => { map[b.nota_fiscal_id] = b; });
        setBoletosPorNota(map);
      } catch { /* boletos opcionais */ }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarBoleto = async (servico: Servico) => {
    if (!servico.nota_fiscal_id) return;
    setGerandoBoletoId(servico.id);
    try {
      const res = await api.post('/boletos/gerar', { nota_ids: [servico.nota_fiscal_id] });
      const { sucesso, erros } = res.data;
      if (sucesso.length > 0) {
        const map = { ...boletosPorNota };
        for (const b of sucesso) map[b.nota_fiscal_id] = b;
        setBoletosPorNota(map);
      }
      if (erros.length > 0) alert(`Erro: ${erros[0].erro}`);
    } catch {
      alert('Erro ao gerar boleto.');
    } finally {
      setGerandoBoletoId(null);
    }
  };

  const handleVincularNota = async () => {
    if (!vincularServicoId || !vincularNotaId) return;
    setVinculando(true);
    setVincularErro(null);
    try {
      await api.put(`/servicos/${vincularServicoId}`, { nota_fiscal_id: parseInt(vincularNotaId) });
      setVincularServicoId(null);
      setVincularNotaId('');
      await carregarDados();
    } catch {
      setVincularErro('Erro ao vincular nota. Verifique se o ID está correto.');
    } finally {
      setVinculando(false);
    }
  };

  const exportarExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);
      if (condominioSelecionado) params.append('condominio_id', String(condominioSelecionado));
      if (filtroTipo !== 'todos') params.append('tipo', filtroTipo);
      const response = await api.get(`/dashboard/servicos/exportar?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `servicos_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Erro ao exportar relatorio');
    }
  };

  const limparFiltros = () => {
    setFiltroTipo('todos'); setSearch(''); setFiltroMes('');
    setDataInicio(''); setDataFim(''); setCondominioSelecionado(null); setComNota('todos');
  };

  const temFiltroAtivo = filtroTipo !== 'todos' || search || filtroMes || dataInicio || dataFim || condominioSelecionado || comNota !== 'todos';

  // servicosFiltrados reflete todos os filtros
  const servicosFiltrados = useMemo(() => servicos.filter(s => {
    if (filtroTipo !== 'todos' && s.tipo !== filtroTipo) return false;
    const nomeCondominio = condominios[s.condominio_id]?.nome || '';
    if (search) {
      const q = search.toLowerCase();
      if (!nomeCondominio.toLowerCase().includes(q) && !s.descricao?.toLowerCase().includes(q)) return false;
    }
    const data = pd(s.data_servico);
    if (filtroMes) {
      const [y, m] = filtroMes.split('-').map(Number);
      if (data.getFullYear() !== y || data.getMonth() + 1 !== m) return false;
    }
    if (dataInicio && data < pd(dataInicio)) return false;
    if (dataFim && data > pd(dataFim)) return false;
    if (condominioSelecionado && s.condominio_id !== condominioSelecionado) return false;
    if (comNota !== 'todos') {
      if (comNota === 'com' && !s.nota_fiscal_id) return false;
      if (comNota === 'sem' && s.nota_fiscal_id) return false;
    }
    return true;
  }), [servicos, filtroTipo, search, filtroMes, dataInicio, dataFim, condominioSelecionado, comNota, condominios]);

  const stats = useMemo(() => {
    const hoje = new Date();
    return {
      total:       servicosFiltrados.length,
      manutencoes: servicosFiltrados.filter(s => s.tipo === 'manutencao').length,
      assistencias: servicosFiltrados.filter(s => s.tipo === 'assistencia').length,
      esteMes:     servicosFiltrados.filter(s => { const d = pd(s.data_servico); return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); }).length,
      comNota:     servicosFiltrados.filter(s => s.nota_fiscal_id).length,
      semNota:     servicosFiltrados.filter(s => !s.nota_fiscal_id).length,
      mediaPorMes: servicosFiltrados.length > 0 ? (servicosFiltrados.length / 12).toFixed(1) : '0',
    };
  }, [servicosFiltrados]);

  const notasSemServico = useMemo(() =>
    Object.values(notas).filter(n => n.status === 'AUTORIZADA').sort((a, b) => a.numero_nota.localeCompare(b.numero_nota)),
  [notas]);

  // Ultimos 6 meses (baseado nos filtrados)
  const hoje = new Date();
  const ultimos6Meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - (5 - i));
    return { mes: d.getMonth(), ano: d.getFullYear(), nome: d.toLocaleDateString('pt-BR', { month: 'short' }) };
  });

  const servicosPorMesData = useMemo(() => ({
    labels: ultimos6Meses.map(m => m.nome),
    datasets: [{
      label: 'Servicos',
      data: ultimos6Meses.map(m => servicosFiltrados.filter(s => {
        const d = pd(s.data_servico);
        return d.getMonth() === m.mes && d.getFullYear() === m.ano;
      }).length),
      backgroundColor: 'rgba(124,58,237,0.2)',
      borderColor: '#7c3aed',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
    }],
  }), [servicosFiltrados, ultimos6Meses]);

  const distribuicaoTipoData = useMemo(() => ({
    labels: ['Manutencao', 'Assistencia'],
    datasets: [{
      data: [stats.manutencoes, stats.assistencias],
      backgroundColor: ['#7c3aed', '#3b82f6'],
      borderWidth: 0,
    }],
  }), [stats]);

  const topCondominiosData = useMemo(() => {
    const totals = Object.values(condominios)
      .map(c => ({
        nome: c.nome.length > 20 ? c.nome.slice(0, 20) + '…' : c.nome,
        qtd: servicosFiltrados.filter(s => s.condominio_id === c.id).length,
      }))
      .filter(c => c.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);
    return {
      labels: totals.map(c => c.nome),
      datasets: [{ label: 'Quantidade', data: totals.map(c => c.qtd), backgroundColor: '#1e3a5f', borderRadius: 8 }],
    };
  }, [condominios, servicosFiltrados]);

  const getTipoColor = (tipo: string) => tipo === 'manutencao'
    ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';

  const getTipoIcon = (tipo: string) => tipo === 'manutencao' ? '🛠️' : '🔧';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando servicos...</p>
        </div>
      </div>
    );
  }

  const listaFiltrada = servicosFiltrados.filter(s => {
    if (activeTab === 'manutencoes') return s.tipo === 'manutencao';
    if (activeTab === 'assistencias') return s.tipo === 'assistencia';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-purple-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Manutencoes & Assistencias</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">Analise completa de produtividade</p>
            </div>
            <div className="flex gap-3">
              <button onClick={exportarExcel} className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2">
                <span className="text-xl">📊</span> Exportar Excel
              </button>
              <Link href="/servicos/novo" className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all flex items-center gap-2">
                <span className="text-xl">+</span> Novo Servico
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros sempre visiveis */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar condominio ou descricao..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
            <input
              type="month"
              value={filtroMes}
              onChange={e => { setFiltroMes(e.target.value); setDataInicio(''); setDataFim(''); }}
              className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
            {['todos', 'manutencao', 'assistencia'].map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === t
                  ? t === 'todos' ? 'bg-purple-600 text-white' : t === 'manutencao' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {t === 'todos' ? 'Todos' : t === 'manutencao' ? '🛠️ Manutencao' : '🔧 Assistencia'}
              </button>
            ))}
            <select value={comNota} onChange={e => setComNota(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm font-bold text-slate-700 dark:text-slate-300">
              <option value="todos">Com/Sem Nota</option>
              <option value="com">Com Nota</option>
              <option value="sem">Sem Nota</option>
            </select>
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

          {showFiltrosAvancados && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data De</label>
                <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data Ate</label>
                <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Condominio</label>
                <select value={condominioSelecionado || ''} onChange={e => setCondominioSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm">
                  <option value="">Todos</option>
                  {Object.values(condominios).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exibindo <span className="font-bold text-slate-700 dark:text-slate-300">{servicosFiltrados.length}</span> de <span className="font-bold">{servicos.length}</span> servicos
            {temFiltroAtivo && <span className="ml-1 text-purple-600 dark:text-purple-400">(com filtros ativos)</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: 'geral',       label: '📊 Visao Geral' },
              { key: 'lista',       label: '📋 Todos' },
              { key: 'manutencoes', label: `🛠️ Manutencoes (${stats.manutencoes})` },
              { key: 'assistencias',label: `🔧 Assistencias (${stats.assistencias})` },
              { key: 'kpis',        label: '📈 KPIs' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as TabType)}
                className={`px-5 py-4 text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'text-purple-600 border-b-2 border-purple-600'
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
                  <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl"><span className="text-2xl">📋</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Servicos Realizados</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-500/20 rounded-xl"><span className="text-2xl">🛠️</span></div>
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-400">PREVENTIVA</span>
                </div>
                <p className="text-4xl font-black text-purple-900 dark:text-purple-400 mb-1">{stats.manutencoes}</p>
                <p className="text-sm text-purple-700 dark:text-purple-500 font-semibold">Manutencoes</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-6 rounded-2xl border border-blue-200 dark:border-blue-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl"><span className="text-2xl">🔧</span></div>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400">CORRETIVA</span>
                </div>
                <p className="text-4xl font-black text-blue-900 dark:text-blue-400 mb-1">{stats.assistencias}</p>
                <p className="text-sm text-blue-700 dark:text-blue-500 font-semibold">Assistencias</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl"><span className="text-2xl">📅</span></div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">ESTE MES</span>
                </div>
                <p className="text-4xl font-black text-green-900 dark:text-green-400 mb-1">{stats.esteMes}</p>
                <p className="text-sm text-green-700 dark:text-green-500 font-semibold">Servicos</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📈</span> Evolucao (Ultimos 6 Meses)
                </h3>
                <div className="h-64">
                  <Line data={servicosPorMesData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,0.1)' } } } }} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span> Distribuicao por Tipo
                </h3>
                <div className="h-64">
                  <Doughnut data={distribuicaoTipoData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🏆</span> Top 5 Condominios (Quantidade)
                </h3>
                {topCondominiosData.labels.length > 0 ? (
                  <div className="h-64">
                    <Bar data={topCondominiosData} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#64748b' } } } }} />
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400">Sem dados com filtros ativos</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: KPIs */}
        {activeTab === 'kpis' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-50 dark:bg-purple-500/10 rounded-full mb-4"><span className="text-3xl">📊</span></div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Media Mensal</p>
                <p className="text-5xl font-black text-purple-600 dark:text-purple-400 mb-2">{stats.mediaPorMes}</p>
                <p className="text-xs text-slate-500">Servicos por mes (periodo)</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 dark:bg-green-500/10 rounded-full mb-4"><span className="text-3xl">✅</span></div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Com Nota Fiscal</p>
                <p className="text-5xl font-black text-green-600 dark:text-green-400 mb-2">{stats.comNota}</p>
                <p className="text-xs text-slate-500">{stats.total > 0 ? ((stats.comNota / stats.total) * 100).toFixed(1) : 0}% do total</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-50 dark:bg-orange-500/10 rounded-full mb-4"><span className="text-3xl">⚠️</span></div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Sem Nota Fiscal</p>
                <p className="text-5xl font-black text-orange-600 dark:text-orange-400 mb-2">{stats.semNota}</p>
                <p className="text-xs text-slate-500">{stats.total > 0 ? ((stats.semNota / stats.total) * 100).toFixed(1) : 0}% do total</p>
              </div>
            </div>

            {stats.total > 0 && (
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 p-8 rounded-2xl shadow-lg text-white md:col-span-3">
                <div className="text-center">
                  <p className="text-sm font-bold mb-2 uppercase opacity-90">Taxa de Manutencao Preventiva</p>
                  <p className="text-6xl font-black mb-4">{((stats.manutencoes / stats.total) * 100).toFixed(1)}%</p>
                  <p className="text-sm opacity-90">{stats.manutencoes} manutencoes preventivas de {stats.total} servicos totais</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Lista / Manutencoes / Assistencias */}
        {(activeTab === 'lista' || activeTab === 'manutencoes' || activeTab === 'assistencias') && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    {['Condominio', 'Tipo', 'Data', 'Nota Fiscal', 'Cobrança', 'Acoes'].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {listaFiltrada.map(servico => (
                    <tr key={servico.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                            <span className="text-sm font-bold">{condominios[servico.condominio_id]?.nome.substring(0, 2).toUpperCase() || '??'}</span>
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{condominios[servico.condominio_id]?.nome || 'Desconhecido'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">ID: {servico.condominio_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(servico.tipo)}`}>
                          <span>{getTipoIcon(servico.tipo)}</span>
                          {servico.tipo === 'manutencao' ? 'Manutencao' : 'Assistencia'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{pd(servico.data_servico).toLocaleDateString('pt-BR')}</p>
                      </td>
                      <td className="px-6 py-5">
                        {servico.nota_fiscal_id ? (() => {
                          const nota = notas[servico.nota_fiscal_id];
                          return nota ? (
                            <div>
                              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">#{nota.numero_nota}</p>
                              <p className="text-sm font-black text-green-600 dark:text-green-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nota.valor)}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                Venc: {pd(nota.data_vencimento).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          ) : <span className="text-xs text-slate-400">Nota #{servico.nota_fiscal_id}</span>;
                        })() : (
                          <button
                            onClick={() => { setVincularServicoId(servico.id); setVincularNotaId(''); setVincularErro(null); }}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            + Vincular nota
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {servico.nota_fiscal_id ? (
                          boletosPorNota[servico.nota_fiscal_id] ? (
                            <Link href="/boletos">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${BOLETO_STATUS[boletosPorNota[servico.nota_fiscal_id].situacao]?.cls ?? ''}`}>
                                {BOLETO_STATUS[boletosPorNota[servico.nota_fiscal_id].situacao]?.label ?? boletosPorNota[servico.nota_fiscal_id].situacao}
                              </span>
                            </Link>
                          ) : (
                            <button
                              onClick={() => handleGerarBoleto(servico)}
                              disabled={gerandoBoletoId === servico.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                            >
                              {gerandoBoletoId === servico.id
                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : '🏦'}
                              {gerandoBoletoId === servico.id ? 'Gerando...' : 'Gerar Boleto'}
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link href={`/servicos/${servico.id}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all group-hover:translate-x-1">
                          Ver detalhes
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {listaFiltrada.length === 0 && (
              <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full"><span className="text-3xl">🛠️</span></div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhum servico encontrado</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4">Ajuste os filtros ou importe notas fiscais</p>
                <Link href="/notas/importar" className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
                  <span>📤</span> Importar Notas
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Vincular Nota */}
      {vincularServicoId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Vincular Nota Fiscal</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Selecione a nota fiscal para associar a este serviço.</p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-2">Nota Fiscal</label>
              <select
                value={vincularNotaId}
                onChange={e => setVincularNotaId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="">Selecione...</option>
                {notasSemServico.map(n => (
                  <option key={n.id} value={n.id}>
                    #{n.numero_nota} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n.valor)} · venc. {pd(n.data_vencimento).toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            </div>

            {vincularErro && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl">
                <p className="text-sm text-red-700 dark:text-red-400">{vincularErro}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setVincularServicoId(null); setVincularNotaId(''); setVincularErro(null); }}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleVincularNota}
                disabled={vinculando || !vincularNotaId}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {vinculando ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Vinculando...</> : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
