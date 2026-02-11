"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
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
} from 'chart.js';

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

interface DashboardStats {
  resumo_geral: {
    total_condominios: number;
    total_notas: number;
    total_valor_notas: number;
    total_servicos: number;
    total_manutencoes: number;
    total_assistencias: number;
  };
  mes_atual: {
    notas: number;
    valor: number;
    servicos: number;
    variacao_notas_percentual: number;
    variacao_valor_percentual: number;
    variacao_servicos_percentual: number;
  };
  mes_passado: {
    notas: number;
    valor: number;
    servicos: number;
  };
  ano_atual: {
    valor: number;
    variacao_percentual: number;
  };
  ano_passado: {
    valor: number;
  };
  rankings: {
    top_condominios: Array<{ nome: string; valor: number }>;
    top_meses_servicos: Array<{ mes: number; ano: number; quantidade: number; nome_mes: string }>;
    dias_semana: Array<{ dia: string; quantidade: number }>;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarEstatisticas();
  }, []);

  const carregarEstatisticas = async () => {
    try {
      const response = await api.get('/dashboard/estatisticas');
      setStats(response.data);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const getVariacaoIcon = (variacao: number) => {
    if (variacao > 0) return '📈';
    if (variacao < 0) return '📉';
    return '➡️';
  };

  const getVariacaoColor = (variacao: number) => {
    if (variacao > 0) return 'text-green-600 dark:text-green-400';
    if (variacao < 0) return 'text-red-600 dark:text-red-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  // Configurações dos gráficos
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: '#64748b'
        }
      }
    }
  };

  const topCondominiosData = {
    labels: stats.rankings.top_condominios.map(c => c.nome),
    datasets: [{
      label: 'Faturamento',
      data: stats.rankings.top_condominios.map(c => c.valor),
      backgroundColor: '#1e3a5f',
      borderRadius: 8
    }]
  };

  const diasSemanaData = {
    labels: stats.rankings.dias_semana.map(d => d.dia),
    datasets: [{
      label: 'Serviços',
      data: stats.rankings.dias_semana.map(d => d.quantidade),
      backgroundColor: [
        '#ef4444',
        '#f59e0b',
        '#10b981',
        '#3b82f6',
        '#8b5cf6',
        '#ec4899',
        '#06b6d4'
      ],
      borderWidth: 0
    }]
  };

  const mesesServicosData = {
    labels: stats.rankings.top_meses_servicos.map(m => `${m.nome_mes}/${m.ano}`),
    datasets: [{
      label: 'Quantidade de Serviços',
      data: stats.rankings.top_meses_servicos.map(m => m.quantidade),
      backgroundColor: 'rgba(123, 92, 237, 0.2)',
      borderColor: '#7c3aed',
      borderWidth: 2,
      tension: 0.4,
      fill: true
    }]
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-8 bg-brand rounded-full" />
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
            Visão geral do sistema de gestão
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Cards Principais Clicáveis */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Link 
            href="/condominios"
            className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">🏢</span>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Total</span>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">
              {stats.resumo_geral.total_condominios}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Condomínios</p>
          </Link>

          <Link
            href="/notas"
            className="group gradient-brand p-6 rounded-2xl shadow-lg hover:shadow-2xl transition-all hover:-translate-y-1 cursor-pointer text-white"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">💰</span>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Faturamento</span>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">
              {formatarMoeda(stats.mes_atual.valor)}
            </p>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="opacity-90">Este mês</span>
              <span className={`flex items-center gap-1 ${stats.mes_atual.variacao_valor_percentual >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {getVariacaoIcon(stats.mes_atual.variacao_valor_percentual)}
                {Math.abs(stats.mes_atual.variacao_valor_percentual).toFixed(1)}%
              </span>
            </div>
          </Link>

          <Link
            href="/servicos"
            className="group bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">🛠️</span>
              </div>
              <span className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase">Serviços</span>
            </div>
            <p className="text-4xl font-black text-purple-900 dark:text-purple-400 mb-1">
              {stats.mes_atual.servicos}
            </p>
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-500">
              <span>Este mês</span>
              <span className={getVariacaoColor(stats.mes_atual.variacao_servicos_percentual)}>
                {getVariacaoIcon(stats.mes_atual.variacao_servicos_percentual)}
                {Math.abs(stats.mes_atual.variacao_servicos_percentual).toFixed(1)}%
              </span>
            </div>
          </Link>

          <Link
            href="/notas"
            className="group bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">📄</span>
              </div>
              <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Notas</span>
            </div>
            <p className="text-4xl font-black text-green-900 dark:text-green-400 mb-1">
              {stats.mes_atual.notas}
            </p>
            <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-500">
              <span>Este mês</span>
              <span className={getVariacaoColor(stats.mes_atual.variacao_notas_percentual)}>
                {getVariacaoIcon(stats.mes_atual.variacao_notas_percentual)}
                {Math.abs(stats.mes_atual.variacao_notas_percentual).toFixed(1)}%
              </span>
            </div>
          </Link>
        </div>

        {/* Comparativos Temporais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📊</span>
                Comparativo Mensal
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Notas Fiscais</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {stats.mes_atual.notas} <span className="text-sm font-normal text-slate-500">vs {stats.mes_passado.notas}</span>
                  </p>
                </div>
                <div className={`text-2xl font-bold ${getVariacaoColor(stats.mes_atual.variacao_notas_percentual)}`}>
                  {stats.mes_atual.variacao_notas_percentual >= 0 ? '+' : ''}{stats.mes_atual.variacao_notas_percentual.toFixed(1)}%
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Faturamento</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {formatarMoeda(stats.mes_atual.valor)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">vs {formatarMoeda(stats.mes_passado.valor)}</p>
                </div>
                <div className={`text-2xl font-bold ${getVariacaoColor(stats.mes_atual.variacao_valor_percentual)}`}>
                  {stats.mes_atual.variacao_valor_percentual >= 0 ? '+' : ''}{stats.mes_atual.variacao_valor_percentual.toFixed(1)}%
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Serviços Prestados</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {stats.mes_atual.servicos} <span className="text-sm font-normal text-slate-500">vs {stats.mes_passado.servicos}</span>
                  </p>
                </div>
                <div className={`text-2xl font-bold ${getVariacaoColor(stats.mes_atual.variacao_servicos_percentual)}`}>
                  {stats.mes_atual.variacao_servicos_percentual >= 0 ? '+' : ''}{stats.mes_atual.variacao_servicos_percentual.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📈</span>
                Comparativo Anual
              </h3>
            </div>
            <div className="space-y-4">
              <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200 dark:border-blue-800/30">
                <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">Faturamento {new Date().getFullYear()}</p>
                <p className="text-3xl font-black text-blue-900 dark:text-blue-300 mb-4">
                  {formatarMoeda(stats.ano_atual.valor)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-blue-600 dark:text-blue-400">vs {new Date().getFullYear() - 1}</span>
                  <span className={`text-lg font-bold ${getVariacaoColor(stats.ano_atual.variacao_percentual)}`}>
                    {stats.ano_atual.variacao_percentual >= 0 ? '+' : ''}{stats.ano_atual.variacao_percentual.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Ano passado</p>
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                  {formatarMoeda(stats.ano_passado.valor)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-800/30">
                  <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">Manutenções</p>
                  <p className="text-2xl font-black text-purple-900 dark:text-purple-400">
                    {stats.resumo_geral.total_manutencoes}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800/30">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Assistências</p>
                  <p className="text-2xl font-black text-blue-900 dark:text-blue-400">
                    {stats.resumo_geral.total_assistencias}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rankings e Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Condomínios */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="text-xl">🏆</span>
              Top 5 Condomínios por Faturamento
            </h3>
            <div className="h-64">
              <Bar data={topCondominiosData} options={{...chartOptions, indexAxis: 'y'}} />
            </div>
          </div>

          {/* Dias da Semana */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="text-xl">📅</span>
              Serviços por Dia da Semana
            </h3>
            <div className="h-64">
              <Doughnut data={diasSemanaData} options={chartOptions} />
            </div>
          </div>

          {/* Top Meses */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="text-xl">📊</span>
              Top 5 Meses com Mais Serviços
            </h3>
            <div className="h-64">
              <Line data={mesesServicosData} options={chartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}