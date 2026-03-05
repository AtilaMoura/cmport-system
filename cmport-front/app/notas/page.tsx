"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

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

export default function NotasPage() {
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [boletos, setBoletos] = useState<Record<number, Boleto>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('geral');

  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [condominioSelecionado, setCondominioSelecionado] = useState<number | null>(null);

  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [gerandoBoletos, setGerandoBoletos] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [notasRes, condosRes, boletosRes] = await Promise.all([
        api.get('/notas-fiscais/'),
        api.get('/condominios/'),
        api.get('/boletos/'),
      ]);
      setNotas(notasRes.data);
      setCondominios(condosRes.data);
      const map: Record<number, Boleto> = {};
      for (const b of boletosRes.data) map[b.nota_fiscal_id] = b;
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

      const response = await api.get(`notas-fiscais/exportar?${params}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `notas_fiscais_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar relatório');
    }
  };

  const toggleSelecionada = (id: number) => {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelecionarTodas = (listaVisivel: NotaFiscal[]) => {
    const semBoleto = listaVisivel.filter(n => !boletos[n.id]);
    const allSelected = semBoleto.every(n => selecionadas.has(n.id));
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (allSelected) semBoleto.forEach(n => next.delete(n.id));
      else semBoleto.forEach(n => next.add(n.id));
      return next;
    });
  };

  const gerarBoletos = async () => {
    if (selecionadas.size === 0) return;
    setGerandoBoletos(true);
    try {
      const res = await api.post('/boletos/gerar', { nota_ids: Array.from(selecionadas) });
      const { sucesso, erros } = res.data;
      setSelecionadas(new Set());
      const map = { ...boletos };
      for (const b of sucesso) map[b.nota_fiscal_id] = b;
      setBoletos(map);
      if (erros.length > 0) {
        alert(`Boletos gerados: ${sucesso.length}\nErros: ${erros.map((e: {nota_id: number; erro: string}) => `Nota ${e.nota_id}: ${e.erro}`).join('\n')}`);
      } else {
        alert(`${sucesso.length} boleto(s) gerado(s) com sucesso!`);
      }
    } catch (error) {
      console.error('Erro ao gerar boletos:', error);
      alert('Erro ao gerar boletos. Verifique as configurações da API Inter.');
    } finally {
      setGerandoBoletos(false);
    }
  };

  const notasFiltradas = notas.filter(nota => {
    const matchTipo = filtroTipo === 'todos' || nota.tipo === filtroTipo;
    const matchSearch =
      nota.numero_nota.toLowerCase().includes(search.toLowerCase()) ||
      (nota.cliente_nome?.toLowerCase().includes(search.toLowerCase()));
    const matchDataInicio = !dataInicio || new Date(nota.data_vencimento) >= new Date(dataInicio);
    const matchDataFim = !dataFim || new Date(nota.data_vencimento) <= new Date(dataFim);
    const matchValorMin = !valorMin || nota.valor >= parseFloat(valorMin);
    const matchValorMax = !valorMax || nota.valor <= parseFloat(valorMax);
    const matchCondominio = !condominioSelecionado || nota.condominio_id === condominioSelecionado;
    return matchTipo && matchSearch && matchDataInicio && matchDataFim && matchValorMin && matchValorMax && matchCondominio;
  });

  const notasAReceber = notasFiltradas.filter(n => !n.data_pagamento);

  const stats = {
    total: notas.length,
    assistencias: notas.filter(n => n.tipo === 'ASSISTENCIA').length,
    manutencoes: notas.filter(n => n.tipo === 'MANUTENCAO').length,
    valorTotal: notas.reduce((sum, n) => sum + n.valor, 0),
    valorReceber: notasAReceber.reduce((sum, n) => sum + n.valor, 0),
    mediaValor: notas.length > 0 ? notas.reduce((sum, n) => sum + n.valor, 0) / notas.length : 0
  };

  const distribuicaoTipoData = {
    labels: ['Assistência', 'Manutenção', 'Outros'],
    datasets: [{
      data: [
        notas.filter(n => n.tipo === 'ASSISTENCIA').length,
        notas.filter(n => n.tipo === 'MANUTENCAO').length,
        notas.filter(n => n.tipo === 'OUTROS').length
      ],
      backgroundColor: ['#3b82f6', '#7c3aed', '#64748b'],
      borderWidth: 0
    }]
  };

  const valorPorCondominioData = {
    labels: condominios.slice(0, 5).map(c => c.nome),
    datasets: [{
      label: 'Valor Total',
      data: condominios.slice(0, 5).map(c =>
        notas.filter(n => n.condominio_id === c.id).reduce((sum, n) => sum + n.valor, 0)
      ),
      backgroundColor: '#1e3a5f',
      borderRadius: 8
    }]
  };

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
  const semBoletoVisiveis = listaAtiva.filter(n => !boletos[n.id]);
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
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Notas Fiscais
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Gestão completa de faturamento
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/boletos"
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">🏦</span> Boletos
              </Link>
              <button
                onClick={exportarExcel}
                className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">📊</span> Exportar Excel
              </button>
              <Link
                href="/notas/importar"
                className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="text-xl">📤</span> Importar XMLs
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
              className={`px-6 py-4 text-sm font-bold transition-all ${
                activeTab === 'geral'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              📊 Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-6 py-4 text-sm font-bold transition-all ${
                activeTab === 'lista'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              📋 Todas as Notas
            </button>
            <button
              onClick={() => setActiveTab('receber')}
              className={`px-6 py-4 text-sm font-bold transition-all ${
                activeTab === 'receber'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              💰 A Receber ({notasAReceber.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* TAB: Visão Geral */}
        {activeTab === 'geral' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl">
                    <span className="text-2xl">📄</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Notas Emitidas</p>
              </div>

              <div className="gradient-brand p-6 rounded-2xl shadow-lg text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                    <span className="text-2xl">💰</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">FATURAMENTO</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorTotal)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Valor Total</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl">
                    <span className="text-2xl">📈</span>
                  </div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">A RECEBER</span>
                </div>
                <p className="text-4xl font-black text-green-900 dark:text-green-400 mb-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorReceber)}
                </p>
                <p className="text-sm text-green-700 dark:text-green-500 font-semibold">{notasAReceber.length} notas pendentes</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                    <span className="text-2xl">📊</span>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">MÉDIA</span>
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.mediaValor)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Valor Médio</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span>
                  Distribuição por Tipo
                </h3>
                <div className="h-64">
                  <Doughnut data={distribuicaoTipoData} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  Top 5 Condomínios (Valor)
                </h3>
                <div className="h-64">
                  <Bar data={valorPorCondominioData} options={{ indexAxis: 'y' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Lista / A Receber */}
        {(activeTab === 'lista' || activeTab === 'receber') && (
          <div className="space-y-6">
            {/* Filtros */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Buscar</label>
                  <input
                    type="text"
                    placeholder="Número ou cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Data Início</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Data Fim</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Valor Mínimo</label>
                  <input
                    type="number"
                    placeholder="R$ 0,00"
                    value={valorMin}
                    onChange={(e) => setValorMin(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Valor Máximo</label>
                  <input
                    type="number"
                    placeholder="R$ 9999,99"
                    value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Condomínio</label>
                  <select
                    value={condominioSelecionado || ''}
                    onChange={(e) => setCondominioSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  >
                    <option value="">Todos</option>
                    {condominios.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                {['todos', 'ASSISTENCIA', 'MANUTENCAO'].map(t => (
                  <button
                    key={t}
                    onClick={() => setFiltroTipo(t)}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                      filtroTipo === t
                        ? t === 'todos' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                          : t === 'ASSISTENCIA' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t === 'todos' ? 'Todos' : t === 'ASSISTENCIA' ? '🔧 Assistência' : '🛠️ Manutenção'}
                  </button>
                ))}
              </div>
            </div>

            {/* Barra de ação para boletos */}
            {selecionadasCount > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 rounded-2xl px-6 py-4 flex items-center justify-between">
                <p className="text-indigo-700 dark:text-indigo-400 font-bold">
                  {selecionadasCount} nota(s) selecionada(s) sem boleto
                </p>
                <button
                  onClick={gerarBoletos}
                  disabled={gerandoBoletos}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {gerandoBoletos ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
                  ) : (
                    <><span>🏦</span> Gerar Boleto(s)</>
                  )}
                </button>
              </div>
            )}

            {/* Tabela */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-4 w-10">
                        {semBoletoVisiveis.length > 0 && (
                          <input
                            type="checkbox"
                            checked={semBoletoVisiveis.length > 0 && semBoletoVisiveis.every(n => selecionadas.has(n.id))}
                            onChange={() => toggleSelecionarTodas(listaAtiva)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        )}
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nota Fiscal</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Vencimento</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Boleto</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {listaAtiva.map((nota) => {
                      const boleto = boletos[nota.id];
                      const temBoleto = !!boleto;
                      const isSelecionada = selecionadas.has(nota.id);
                      return (
                        <tr
                          key={nota.id}
                          className={`group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isSelecionada ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}
                        >
                          <td className="px-4 py-5">
                            {!temBoleto && (
                              <input
                                type="checkbox"
                                checked={isSelecionada}
                                onChange={() => toggleSelecionada(nota.id)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                                <span className="text-lg">{getTipoIcon(nota.tipo)}</span>
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">{nota.numero_nota}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {nota.parcelas > 1 ? `${nota.parcelas}x parcelas` : 'À vista'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(nota.tipo)}`}>
                              {nota.tipo}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {nota.cliente_nome || 'Não informado'}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm font-bold text-green-600 dark:text-green-400">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nota.valor)}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {new Date(nota.data_vencimento).toLocaleDateString('pt-BR')}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            {boleto ? (
                              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${SITUACAO_CONFIG[boleto.situacao]?.cls}`}>
                                {SITUACAO_CONFIG[boleto.situacao]?.label}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-600">— sem boleto</span>
                            )}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <Link
                              href={`/notas/${nota.id}`}
                              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-all group-hover:translate-x-1"
                            >
                              Ver detalhes
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
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
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <span className="text-3xl">📄</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhuma nota encontrada</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">Ajuste os filtros ou importe novas XMLs</p>
                  <Link
                    href="/notas/importar"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
                  >
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
