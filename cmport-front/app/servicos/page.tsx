"use client"
// No topo do arquivo page.tsx (ou no componente que usa os gráficos)
import {
  Chart as ChartJS,
  CategoryScale,      // ← ESSA É A QUE ESTÁ FALTANDO (para eixo X categórico)
  LinearScale,        // para valores numéricos
  PointElement,
  LineElement,
  BarElement,
  ArcElement,         // para Doughnut/Pie
  Title,
  Tooltip,
  Legend,
  Filler,             // se usar preenchimento em Line
} from 'chart.js';

// Registre tudo uma única vez (pode ser no topo do arquivo ou em um arquivo separado)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

import { useState, useEffect } from 'react';
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

interface Condominio {
  id: number;
  nome: string;
}

type TabType = 'geral' | 'lista' | 'manutencoes' | 'assistencias' | 'kpis';

export default function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [condominios, setCondominios] = useState<Record<number, Condominio>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('geral');

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [condominioSelecionado, setCondominioSelecionado] = useState<number | null>(null);
  const [comNota, setComNota] = useState<string>('todos');

  useEffect(() => {
    carregarDados();
  }, []);



  const carregarDados = async () => {
    try {
      // Carrega condomínios (para o select/filtro)
      const condosRes = await api.get('/condominios/');
      const condosMap: Record<number, Condominio> = {};
      condosRes.data.forEach((c: Condominio) => {
        condosMap[c.id] = c;
      });
      setCondominios(condosMap);

      // Carrega TODOS os serviços de uma vez (muito mais eficiente)
      const servicosRes = await api.get('/servicos/');  // ← novo endpoint
      setServicos(servicosRes.data);

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

      const response = await api.get(`/dashboard/servicos/exportar?${params}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `servicos_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar relatório');
    }
  };

  const servicosFiltrados = servicos.filter(servico => {
    const matchTipo = filtroTipo === 'todos' || servico.tipo === filtroTipo;
    const nomeCondominio = condominios[servico.condominio_id]?.nome || '';
    const matchSearch =
      nomeCondominio.toLowerCase().includes(search.toLowerCase()) ||
      (servico.descricao?.toLowerCase().includes(search.toLowerCase()));

    const matchDataInicio = !dataInicio || new Date(servico.data_servico) >= new Date(dataInicio);
    const matchDataFim = !dataFim || new Date(servico.data_servico) <= new Date(dataFim);
    const matchCondominio = !condominioSelecionado || servico.condominio_id === condominioSelecionado;
    const matchNota = comNota === 'todos' || (comNota === 'com' ? servico.nota_fiscal_id : !servico.nota_fiscal_id);

    return matchTipo && matchSearch && matchDataInicio && matchDataFim && matchCondominio && matchNota;
  });

  const manutencoes = servicos.filter(s => s.tipo === 'manutencao');
  const assistencias = servicos.filter(s => s.tipo === 'assistencia');

  const stats = {
    total: servicos.length,
    manutencoes: manutencoes.length,
    assistencias: assistencias.length,
    esteMes: servicos.filter(s => {
      const dataServico = new Date(s.data_servico);
      const hoje = new Date();
      return dataServico.getMonth() === hoje.getMonth() &&
        dataServico.getFullYear() === hoje.getFullYear();
    }).length,
    comNota: servicos.filter(s => s.nota_fiscal_id).length,
    semNota: servicos.filter(s => !s.nota_fiscal_id).length,
    mediaPorMes: servicos.length > 0 ? (servicos.length / 12).toFixed(1) : 0
  };

  // Serviços por mês (últimos 6 meses)
  const hoje = new Date();
  const ultimos6Meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - (5 - i));
    return {
      mes: d.getMonth(),
      ano: d.getFullYear(),
      nome: d.toLocaleDateString('pt-BR', { month: 'short' })
    };
  });

  const servicosPorMesData = {
    labels: ultimos6Meses.map(m => m.nome),
    datasets: [{
      label: 'Serviços',
      data: ultimos6Meses.map(m =>
        servicos.filter(s => {
          const d = new Date(s.data_servico);
          return d.getMonth() === m.mes && d.getFullYear() === m.ano;
        }).length
      ),
      backgroundColor: 'rgba(124, 58, 237, 0.2)',
      borderColor: '#7c3aed',
      borderWidth: 2,
      tension: 0.4,
      fill: true
    }]
  };

  const distribuicaoTipoData = {
    labels: ['Manutenção', 'Assistência'],
    datasets: [{
      data: [stats.manutencoes, stats.assistencias],
      backgroundColor: ['#7c3aed', '#3b82f6'],
      borderWidth: 0
    }]
  };

  const topCondominiosData = {
    labels: Object.values(condominios).slice(0, 5).map(c => c.nome),
    datasets: [{
      label: 'Quantidade',
      data: Object.values(condominios).slice(0, 5).map(c =>
        servicos.filter(s => s.condominio_id === c.id).length
      ),
      backgroundColor: '#1e3a5f',
      borderRadius: 8
    }]
  };

  const getTipoColor = (tipo: string) => {
    return tipo === 'manutencao'
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
  };

  const getTipoIcon = (tipo: string) => {
    return tipo === 'manutencao' ? '🛠️' : '🔧';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando serviços...</p>
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
                <div className="w-2 h-8 bg-purple-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Manutenções & Assistências
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Análise completa de produtividade
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={exportarExcel}
                className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">📊</span> Exportar Excel
              </button>
              <Link
                href="/servicos/novo"
                className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">+</span> Novo Serviço
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('geral')}
              className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === 'geral'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              📊 Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === 'lista'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              📋 Todos os Serviços
            </button>
            <button
              onClick={() => setActiveTab('manutencoes')}
              className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === 'manutencoes'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              🛠️ Manutenções ({stats.manutencoes})
            </button>
            <button
              onClick={() => setActiveTab('assistencias')}
              className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === 'assistencias'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              🔧 Assistências ({stats.assistencias})
            </button>
            <button
              onClick={() => setActiveTab('kpis')}
              className={`px-6 py-4 text-sm font-bold transition-all ${activeTab === 'kpis'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              📈 KPIs
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* TAB: Visão Geral */}
        {activeTab === 'geral' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
                    <span className="text-2xl">📋</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Serviços Realizados</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-500/20 rounded-xl">
                    <span className="text-2xl">🛠️</span>
                  </div>
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-400">PREVENTIVA</span>
                </div>
                <p className="text-4xl font-black text-purple-900 dark:text-purple-400 mb-1">{stats.manutencoes}</p>
                <p className="text-sm text-purple-700 dark:text-purple-500 font-semibold">Manutenções</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-6 rounded-2xl border border-blue-200 dark:border-blue-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl">
                    <span className="text-2xl">🔧</span>
                  </div>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400">CORRETIVA</span>
                </div>
                <p className="text-4xl font-black text-blue-900 dark:text-blue-400 mb-1">{stats.assistencias}</p>
                <p className="text-sm text-blue-700 dark:text-blue-500 font-semibold">Assistências</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl">
                    <span className="text-2xl">📅</span>
                  </div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">ESTE MÊS</span>
                </div>
                <p className="text-4xl font-black text-green-900 dark:text-green-400 mb-1">{stats.esteMes}</p>
                <p className="text-sm text-green-700 dark:text-green-500 font-semibold">Serviços</p>
              </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📈</span>
                  Evolução (Últimos 6 Meses)
                </h3>
                <div className="h-64">
                  <Line data={servicosPorMesData} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span>
                  Distribuição por Tipo
                </h3>
                <div className="h-64">
                  <Doughnut data={distribuicaoTipoData} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🏆</span>
                  Top 5 Condomínios (Quantidade)
                </h3>
                <div className="h-64">
                  <Bar data={topCondominiosData} options={{ indexAxis: 'y' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: KPIs */}
        {activeTab === 'kpis' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-50 dark:bg-purple-500/10 rounded-full mb-4">
                  <span className="text-3xl">📊</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Média Mensal</p>
                <p className="text-5xl font-black text-purple-600 dark:text-purple-400 mb-2">{stats.mediaPorMes}</p>
                <p className="text-xs text-slate-500">Serviços por mês</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 dark:bg-green-500/10 rounded-full mb-4">
                  <span className="text-3xl">✅</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Com Nota Fiscal</p>
                <p className="text-5xl font-black text-green-600 dark:text-green-400 mb-2">{stats.comNota}</p>
                <p className="text-xs text-slate-500">{((stats.comNota / stats.total) * 100).toFixed(1)}% do total</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-50 dark:bg-orange-500/10 rounded-full mb-4">
                  <span className="text-3xl">⚠️</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Sem Nota Fiscal</p>
                <p className="text-5xl font-black text-orange-600 dark:text-orange-400 mb-2">{stats.semNota}</p>
                <p className="text-xs text-slate-500">{((stats.semNota / stats.total) * 100).toFixed(1)}% do total</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-600 to-purple-700 p-8 rounded-2xl shadow-lg text-white md:col-span-3">
              <div className="text-center">
                <p className="text-sm font-bold mb-2 uppercase opacity-90">Taxa de Manutenção Preventiva</p>
                <p className="text-6xl font-black mb-4">
                  {((stats.manutencoes / stats.total) * 100).toFixed(1)}%
                </p>
                <p className="text-sm opacity-90">
                  {stats.manutencoes} manutenções preventivas de {stats.total} serviços totais
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Lista / Manutenções / Assistências */}
        {(activeTab === 'lista' || activeTab === 'manutencoes' || activeTab === 'assistencias') && (
          <div className="space-y-6">
            {/* Filtros */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                    Buscar
                  </label>
                  <input
                    type="text"
                    placeholder="Condomínio ou descrição..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                    Condomínio
                  </label>
                  <select
                    value={condominioSelecionado || ''}
                    onChange={(e) => setCondominioSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  >
                    <option value="">Todos</option>
                    {Object.values(condominios).map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                    Nota Fiscal
                  </label>
                  <select
                    value={comNota}
                    onChange={(e) => setComNota(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="com">Com Nota</option>
                    <option value="sem">Sem Nota</option>
                  </select>
                </div>
              </div>

              {activeTab === 'lista' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setFiltroTipo('todos')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === 'todos'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFiltroTipo('manutencao')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === 'manutencao'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    🛠️ Manutenção
                  </button>
                  <button
                    onClick={() => setFiltroTipo('assistencia')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === 'assistencia'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    🔧 Assistência
                  </button>
                </div>
              )}
            </div>

            {/* Tabela */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Condomínio
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {servicosFiltrados
                      .filter(s => {
                        if (activeTab === 'manutencoes') return s.tipo === 'manutencao';
                        if (activeTab === 'assistencias') return s.tipo === 'assistencia';
                        return true;
                      })
                      .map((servico) => (
                        <tr key={servico.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                                <span className="text-sm font-bold">
                                  {condominios[servico.condominio_id]?.nome.substring(0, 2).toUpperCase() || '??'}
                                </span>
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {condominios[servico.condominio_id]?.nome || 'Desconhecido'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  ID: {servico.condominio_id}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(servico.tipo)}`}>
                              <span>{getTipoIcon(servico.tipo)}</span>
                              {servico.tipo === 'manutencao' ? 'Manutenção' : 'Assistência'}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {new Date(servico.data_servico).toLocaleDateString('pt-BR')}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-md">
                              {servico.descricao || 'Sem descrição'}
                            </p>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <Link
                              href={`/servicos/${servico.id}`}
                              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all group-hover:translate-x-1"
                            >
                              Ver detalhes
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {servicosFiltrados.length === 0 && (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <span className="text-3xl">🛠️</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                    Nenhum serviço encontrado
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">
                    Ajuste os filtros ou importe notas fiscais
                  </p>
                  <Link
                    href="/notas/importar"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
                  >
                    <span>📤</span> Importar Notas
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