"use client"

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
  type ChartOptions,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

interface Boleto {
  id: number;
  nota_fiscal_id: number;
  valor_nominal: number;
  valor_total_recebido: number | null;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  situacao: 'EMABERTO' | 'PAGO' | 'CANCELADO' | 'EXPIRADO' | 'VENCIDO' | 'BAIXADO';
  numero_parcela: number;
  total_parcelas: number;
}

interface Nota {
  id: number;
  numero_nota: string;
  valor: number;
  tipo: string;
  status: 'AUTORIZADA' | 'CANCELADA' | 'DESCONHECIDO';
  data_vencimento: string;
  condominio_id: number | null;
  cliente_nome: string | null;
  parcelas: number;
  nota_vinculada_id: number | null;
}

interface Servico {
  id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  condominio_id: number;
}

interface Condominio {
  id: number;
  nome: string;
}

type Periodo = 'mes_atual' | 'trimestre' | '6_meses' | 'ano_atual' | 'ano_passado';

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'mes_atual',   label: 'Este Mês' },
  { key: 'trimestre',   label: 'Trimestre' },
  { key: '6_meses',     label: '6 Meses' },
  { key: 'ano_atual',   label: 'Este Ano' },
  { key: 'ano_passado', label: 'Ano Passado' },
];

function pd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getPeriodRange(p: Periodo): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const a = hoje.getFullYear(), m = hoje.getMonth();
  switch (p) {
    case 'mes_atual':   return { inicio: new Date(a, m, 1),     fim: new Date(a, m + 1, 0) };
    case 'trimestre':   return { inicio: new Date(a, m - 2, 1), fim: new Date(a, m + 1, 0) };
    case '6_meses':     return { inicio: new Date(a, m - 5, 1), fim: new Date(a, m + 1, 0) };
    case 'ano_atual':   return { inicio: new Date(a, 0, 1),     fim: new Date(a, 11, 31) };
    case 'ano_passado': return { inicio: new Date(a - 1, 0, 1), fim: new Date(a - 1, 11, 31) };
  }
}

function getMesesList(inicio: Date, fim: Date) {
  const list = [];
  const cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (cur <= fim) {
    list.push({
      mes: cur.getMonth(),
      ano: cur.getFullYear(),
      label: cur.toLocaleDateString('pt-BR', { month: 'short', year: cur.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
}

export default function DashboardPage() {
  const [boletos, setBoletos]     = useState<Boleto[]>([]);
  const [notas, setNotas]         = useState<Nota[]>([]);
  const [servicos, setServicos]   = useState<Servico[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading]     = useState(true);
  const [periodo, setPeriodo]     = useState<Periodo>('6_meses');
  const [issRate, setIssRate]     = useState(3);

  // Estados da lista de notas
  const [notasBusca, setNotasBusca]       = useState('');
  const [notasFiltroTipo, setNotasFiltroTipo] = useState('todos');
  const [notasPagina, setNotasPagina]     = useState(1);
  const NOTAS_POR_PAGINA = 10;

  useEffect(() => {
    Promise.all([
      api.get('/boletos'),
      api.get('/notas-fiscais'),
      api.get('/servicos'),
      api.get('/condominios'),
    ]).then(([b, n, s, c]) => {
      setBoletos(b.data);
      setNotas(n.data);
      setServicos(s.data);
      setCondominios(c.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const { inicio, fim } = useMemo(() => getPeriodRange(periodo), [periodo]);

  const bF = useMemo(() => boletos.filter(b => { const d = pd(b.data_emissao); return d >= inicio && d <= fim; }), [boletos, inicio, fim]);
  const nF = useMemo(() => notas.filter(n => { if (n.status !== 'AUTORIZADA') return false; const d = pd(n.data_vencimento); return d >= inicio && d <= fim; }), [notas, inicio, fim]);
  const sF = useMemo(() => servicos.filter(s => { const d = pd(s.data_servico); return d >= inicio && d <= fim; }), [servicos, inicio, fim]);

  const mesesPeriodo = useMemo(() => getMesesList(inicio, fim), [inicio, fim]);

  // Periodo anterior (mesma duração)
  const { inicioAnt, fimAnt } = useMemo(() => {
    const durMs = fim.getTime() - inicio.getTime() + 86400000;
    return { inicioAnt: new Date(inicio.getTime() - durMs), fimAnt: new Date(inicio.getTime() - 1) };
  }, [inicio, fim]);

  const bAnt = useMemo(() => boletos.filter(b => { const d = pd(b.data_emissao); return d >= inicioAnt && d <= fimAnt; }), [boletos, inicioAnt, fimAnt]);
  const nAnt = useMemo(() => notas.filter(n => { if (n.status !== 'AUTORIZADA') return false; const d = pd(n.data_vencimento); return d >= inicioAnt && d <= fimAnt; }), [notas, inicioAnt, fimAnt]);
  const sAnt = useMemo(() => servicos.filter(s => { const d = pd(s.data_servico); return d >= inicioAnt && d <= fimAnt; }), [servicos, inicioAnt, fimAnt]);

  const kpis = useMemo(() => {
    const valorEmitido    = nF.reduce((s, n) => s + n.valor, 0);
    const bPagos          = bF.filter(b => b.situacao === 'PAGO');
    const valorRecebido   = bPagos.reduce((s, b) => s + (b.valor_total_recebido ?? b.valor_nominal), 0);
    const bPendentes      = bF.filter(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');
    const valorPendente   = bPendentes.reduce((s, b) => s + b.valor_nominal, 0);
    const issEstimado     = valorEmitido * (issRate / 100);
    const receitaLiquida  = valorRecebido - issEstimado;
    return {
      totalServicos: sF.length, totalNotas: nF.length, totalBoletos: bF.length,
      valorEmitido, valorRecebido, valorPendente, issEstimado, receitaLiquida,
      boletosPagos:    bPagos.length,
      boletosAberto:   bF.filter(b => b.situacao === 'EMABERTO').length,
      boletosVencidos: bF.filter(b => b.situacao === 'VENCIDO').length,
      boletosCanc:     bF.filter(b => b.situacao === 'CANCELADO').length,
      boletosExp:      bF.filter(b => b.situacao === 'EXPIRADO' || b.situacao === 'BAIXADO').length,
    };
  }, [nF, bF, sF, issRate]);

  const kpisAnt = useMemo(() => ({
    totalServicos: sAnt.length,
    totalNotas:    nAnt.length,
    totalBoletos:  bAnt.length,
    valorEmitido:  nAnt.reduce((s, n) => s + n.valor, 0),
  }), [sAnt, nAnt, bAnt]);

  const varPct = (atual: number, ant: number) => ant === 0 ? (atual > 0 ? 100 : 0) : ((atual - ant) / ant) * 100;

  // Grafico: Quantidade comparativa por mes
  const comparativoQtdData = useMemo(() => ({
    labels: mesesPeriodo.map(m => m.label),
    datasets: [
      {
        label: 'Servicos',
        data: mesesPeriodo.map(m => sF.filter(s => { const d = pd(s.data_servico); return d.getMonth() === m.mes && d.getFullYear() === m.ano; }).length),
        backgroundColor: '#7c3aed', borderRadius: 6,
      },
      {
        label: 'Notas Fiscais',
        data: mesesPeriodo.map(m => nF.filter(n => { const d = pd(n.data_vencimento); return d.getMonth() === m.mes && d.getFullYear() === m.ano; }).length),
        backgroundColor: '#ea580c', borderRadius: 6,
      },
      {
        label: 'Boletos',
        data: mesesPeriodo.map(m => bF.filter(b => { const d = pd(b.data_emissao); return d.getMonth() === m.mes && d.getFullYear() === m.ano; }).length),
        backgroundColor: '#4f46e5', borderRadius: 6,
      },
    ],
  }), [mesesPeriodo, sF, nF, bF]);

  // Grafico: Valor comparativo por mes
  const comparativoValorData = useMemo(() => ({
    labels: mesesPeriodo.map(m => m.label),
    datasets: [
      {
        label: 'Emitido',
        data: mesesPeriodo.map(m => nF.filter(n => { const d = pd(n.data_vencimento); return d.getMonth() === m.mes && d.getFullYear() === m.ano; }).reduce((s, n) => s + n.valor, 0)),
        backgroundColor: '#ea580c', borderRadius: 6,
      },
      {
        label: 'Recebido',
        data: mesesPeriodo.map(m => bF.filter(b => {
          const d = b.data_pagamento ? pd(b.data_pagamento) : null;
          return d && d.getMonth() === m.mes && d.getFullYear() === m.ano && b.situacao === 'PAGO';
        }).reduce((s, b) => s + (b.valor_total_recebido ?? b.valor_nominal), 0)),
        backgroundColor: '#16a34a', borderRadius: 6,
      },
      {
        label: 'Pendente',
        data: mesesPeriodo.map(m => bF.filter(b => {
          const d = pd(b.data_vencimento);
          return d.getMonth() === m.mes && d.getFullYear() === m.ano && (b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');
        }).reduce((s, b) => s + b.valor_nominal, 0)),
        backgroundColor: '#f97316', borderRadius: 6,
      },
    ],
  }), [mesesPeriodo, nF, bF]);

  // Grafico: Ano atual vs ano passado (valor notas)
  const anoAtual = new Date().getFullYear();
  const meses12 = Array.from({ length: 12 }, (_, i) => ({
    mes: i, label: new Date(anoAtual, i, 1).toLocaleDateString('pt-BR', { month: 'short' }),
  }));
  const anoVsAnoData = useMemo(() => ({
    labels: meses12.map(m => m.label),
    datasets: [
      {
        label: String(anoAtual),
        data: meses12.map(m => notas.filter(n => { const d = pd(n.data_vencimento); return d.getMonth() === m.mes && d.getFullYear() === anoAtual; }).reduce((s, n) => s + n.valor, 0)),
        borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', tension: 0.4, fill: true, pointRadius: 4,
      },
      {
        label: String(anoAtual - 1),
        data: meses12.map(m => notas.filter(n => { const d = pd(n.data_vencimento); return d.getMonth() === m.mes && d.getFullYear() === anoAtual - 1; }).reduce((s, n) => s + n.valor, 0)),
        borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', tension: 0.4, fill: true, borderDash: [5, 5], pointRadius: 4,
      },
    ],
  }), [notas, anoAtual]);

  // Grafico: Servicos por semana no mes atual
  const mesAtualNum = new Date().getMonth();
  const anoAtualNum = new Date().getFullYear();
  const semanasData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    servicos.filter(s => { const d = pd(s.data_servico); return d.getMonth() === mesAtualNum && d.getFullYear() === anoAtualNum; })
      .forEach(s => {
        const dia = pd(s.data_servico).getDate();
        const idx = dia <= 7 ? 0 : dia <= 14 ? 1 : dia <= 21 ? 2 : dia <= 28 ? 3 : 4;
        counts[idx]++;
      });
    return {
      labels: ['Sem 1 (1-7)', 'Sem 2 (8-14)', 'Sem 3 (15-21)', 'Sem 4 (22-28)', 'Sem 5 (29+)'],
      datasets: [{ label: 'Servicos', data: counts, backgroundColor: '#7c3aed', borderRadius: 6 }],
    };
  }, [servicos, mesAtualNum, anoAtualNum]);

  // Grafico: Top condominios por valor no periodo
  const topCondominiosData = useMemo(() => {
    const totals = condominios
      .map(c => ({ nome: c.nome.length > 22 ? c.nome.slice(0, 22) + '…' : c.nome, valor: nF.filter(n => n.condominio_id === c.id).reduce((s, n) => s + n.valor, 0) }))
      .filter(c => c.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5);
    return {
      labels: totals.map(c => c.nome),
      datasets: [{ label: 'Valor', data: totals.map(c => c.valor), backgroundColor: '#1e3a5f', borderRadius: 8 }],
    };
  }, [condominios, nF]);

  // Grafico: Distribuicao tipo servicos
  const distribuicaoData = useMemo(() => ({
    labels: ['Manutencao', 'Assistencia'],
    datasets: [{ data: [sF.filter(s => s.tipo === 'manutencao').length, sF.filter(s => s.tipo === 'assistencia').length], backgroundColor: ['#7c3aed', '#3b82f6'], borderWidth: 0 }],
  }), [sF]);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmt(v);
  const varCls = (v: number) => v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const pctLabel = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const chartBase: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#64748b', boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { display: false } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,0.1)' } },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const taxaRecebimento = kpis.valorEmitido > 0 ? (kpis.valorRecebido / kpis.valorEmitido) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header + Period selector */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-3 sm:px-6 lg:px-8 py-3 lg:py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-6 sm:h-8 bg-indigo-600 rounded-full" />
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg ml-5">Analise completa do negocio</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {PERIODOS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                    periodo === p.key
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-6 lg:px-8 py-4 lg:py-8 space-y-4 lg:space-y-8">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          {[
            { label: 'Servicos',        value: kpis.totalServicos, fmt: String, prev: kpisAnt.totalServicos, icon: '🛠️', cls: 'bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-800/50', txtCls: 'text-purple-900 dark:text-purple-300', href: '/servicos' },
            { label: 'Notas Emitidas',  value: kpis.totalNotas,    fmt: String, prev: kpisAnt.totalNotas,    icon: '📄', cls: 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/50', txtCls: 'text-orange-900 dark:text-orange-300', href: '/notas' },
            { label: 'Boletos',         value: kpis.totalBoletos,  fmt: String, prev: kpisAnt.totalBoletos,  icon: '🏦', cls: 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800/50', txtCls: 'text-indigo-900 dark:text-indigo-300', href: '/boletos' },
            { label: 'Faturamento',     value: kpis.valorEmitido,  fmt: fmtK,   prev: kpisAnt.valorEmitido,  icon: '💰', cls: 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/50',   txtCls: 'text-green-900 dark:text-green-300',  href: '/notas' },
          ].map(card => {
            const v = varPct(card.value, card.prev);
            return (
              <Link key={card.label} href={card.href}
                className={`${card.cls} p-3 sm:p-5 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5`}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xl sm:text-2xl">{card.icon}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/20 ${varCls(v)}`}>{pctLabel(v)}</span>
                </div>
                <p className={`text-xl sm:text-2xl font-black ${card.txtCls} mb-0.5`}>{card.fmt(card.value)}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{card.label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">ant: {card.fmt(card.prev)}</p>
              </Link>
            );
          })}
        </div>

        {/* Comparativo Quantidade */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <span className="text-xl">📊</span> Comparativo Mensal — Quantidade: Servicos / Notas / Boletos
          </h3>
          <div className="h-52 sm:h-72">
            <Bar data={comparativoQtdData} options={chartBase} />
          </div>
        </div>

        {/* Comparativo Valor */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <span className="text-xl">💵</span> Comparativo Financeiro — Emitido / Recebido / Pendente por Mes
          </h3>
          <div className="h-52 sm:h-72">
            <Bar data={comparativoValorData} options={{
              ...chartBase,
              scales: {
                ...chartBase.scales,
                y: { ...chartBase.scales?.y, ticks: { ...chartBase.scales?.y?.ticks, callback: (v: unknown) => fmtK(Number(v)) } },
              },
            }} />
          </div>
        </div>

        {/* Ano vs Ano + Semana a semana */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
              <span className="text-xl">📈</span> Faturamento: {anoAtual} vs {anoAtual - 1}
            </h3>
            <div className="h-48 sm:h-64">
              <Line data={anoVsAnoData} options={{
                ...chartBase,
                scales: {
                  ...chartBase.scales,
                  y: { ...chartBase.scales?.y, ticks: { ...chartBase.scales?.y?.ticks, callback: (v: unknown) => fmtK(Number(v)) } },
                },
              } as ChartOptions<'line'>} />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
              <span className="text-xl">📅</span> Servicos por Semana — Mes Atual
            </h3>
            <div className="h-48 sm:h-64">
              <Bar data={semanasData} options={chartBase} />
            </div>
          </div>
        </div>

        {/* Analise Imposto / Lucro */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 lg:mb-6">
            <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xl">🧮</span> Analise Financeira — Imposto & Receita Liquida
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Taxa ISS:</span>
              <div className="flex gap-1">
                {[2, 3, 4, 5].map(r => (
                  <button key={r} onClick={() => setIssRate(r)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${issRate === r ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 lg:gap-4 mb-4 lg:mb-6">
            {[
              { label: 'Faturamento Bruto',     value: fmt(kpis.valorEmitido),   icon: '📄', cls: 'bg-slate-50 dark:bg-slate-800',                                                       txtCls: 'text-slate-900 dark:text-white' },
              { label: `ISS Est. (${issRate}%)`, value: fmt(kpis.issEstimado),    icon: '🏛️', cls: 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30',           txtCls: 'text-red-700 dark:text-red-400' },
              { label: 'Receita Liquida Est.',   value: fmt(kpis.receitaLiquida), icon: '✅', cls: 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30',   txtCls: 'text-green-700 dark:text-green-400' },
              { label: 'Recebido (Boletos)',      value: fmt(kpis.valorRecebido),  icon: '💳', cls: 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800/30', txtCls: 'text-indigo-700 dark:text-indigo-400' },
              { label: 'Inadimplencia',           value: fmt(kpis.valorPendente),  icon: '⚠️', cls: 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800/30', txtCls: 'text-orange-700 dark:text-orange-400' },
            ].map(card => (
              <div key={card.label} className={`${card.cls} p-3 lg:p-4 rounded-2xl`}>
                <div className="text-2xl mb-2">{card.icon}</div>
                <p className={`text-base lg:text-lg font-black mb-1 ${card.txtCls}`}>{card.value}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">{card.label}</p>
              </div>
            ))}
          </div>

          {kpis.valorEmitido > 0 && (
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                <span>Taxa de recebimento dos boletos</span>
                <span className={taxaRecebimento >= 80 ? 'text-green-600 dark:text-green-400' : taxaRecebimento >= 50 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}>
                  {taxaRecebimento.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, taxaRecebimento)}%`,
                    background: taxaRecebimento >= 80 ? 'linear-gradient(to right, #16a34a, #22c55e)' : taxaRecebimento >= 50 ? 'linear-gradient(to right, #ea580c, #f97316)' : 'linear-gradient(to right, #dc2626, #ef4444)',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>{fmt(kpis.valorRecebido)} recebido</span>
                <span>{fmt(kpis.valorEmitido)} emitido</span>
              </div>
            </div>
          )}
        </div>

        {/* Status Boletos */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2">
            <span className="text-xl">🏦</span> Status dos Boletos no Periodo
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 lg:gap-4">
            {[
              { label: 'Em Aberto',          value: kpis.boletosAberto,   cls: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-500/10' },
              { label: 'Pagos',              value: kpis.boletosPagos,    cls: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-500/10' },
              { label: 'Vencidos',           value: kpis.boletosVencidos, cls: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
              { label: 'Cancelados',         value: kpis.boletosCanc,     cls: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-500/10' },
              { label: 'Expirados/Baixados', value: kpis.boletosExp,      cls: 'text-slate-600 dark:text-slate-400',   bg: 'bg-slate-100 dark:bg-slate-800' },
            ].map(item => (
              <Link href="/boletos" key={item.label} className={`${item.bg} p-3 sm:p-5 rounded-2xl text-center hover:opacity-80 transition-opacity`}>
                <p className={`text-2xl sm:text-3xl font-black ${item.cls} mb-1`}>{item.value}</p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{item.label}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Top condominios + Distribuicao */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2">
              <span className="text-xl">🏆</span> Top 5 Condominios por Faturamento
            </h3>
            {topCondominiosData.labels.length > 0 ? (
              <div className="h-48 sm:h-64">
                <Bar data={topCondominiosData} options={{
                  ...chartBase,
                  indexAxis: 'y',
                  scales: {
                    ...chartBase.scales,
                    x: { ...chartBase.scales?.x, ticks: { ...chartBase.scales?.x?.ticks, callback: (v: unknown) => fmtK(Number(v)) } },
                  },
                }} />
              </div>
            ) : (
              <div className="h-48 sm:h-64 flex items-center justify-center text-slate-400">Sem dados no periodo</div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2">
              <span className="text-xl">🥧</span> Distribuicao de Servicos por Tipo
            </h3>
            {(distribuicaoData.datasets[0].data[0] + distribuicaoData.datasets[0].data[1]) > 0 ? (
              <>
                <div className="h-44 sm:h-52">
                  <Doughnut data={distribuicaoData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-purple-50 dark:bg-purple-500/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-purple-700 dark:text-purple-400">{sF.filter(s => s.tipo === 'manutencao').length}</p>
                    <p className="text-xs font-bold text-purple-600 dark:text-purple-500">Manutencoes</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-blue-700 dark:text-blue-400">{sF.filter(s => s.tipo === 'assistencia').length}</p>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-500">Assistencias</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-48 sm:h-64 flex items-center justify-center text-slate-400">Sem dados no periodo</div>
            )}
          </div>
        </div>

        {/* Lista de Notas Fiscais */}
        {(() => {
          const notasFiltradas = notas
            .filter(n => {
              if (notasFiltroTipo !== 'todos' && n.tipo !== notasFiltroTipo) return false;
              if (notasBusca.trim()) {
                const q = notasBusca.toLowerCase();
                const nomeCondominio = condominios.find(c => c.id === n.condominio_id)?.nome || '';
                return (
                  n.numero_nota?.toLowerCase().includes(q) ||
                  (n.cliente_nome || '').toLowerCase().includes(q) ||
                  nomeCondominio.toLowerCase().includes(q)
                );
              }
              return true;
            })
            .sort((a, b) => pd(b.data_vencimento).getTime() - pd(a.data_vencimento).getTime());

          const totalPaginas = Math.max(1, Math.ceil(notasFiltradas.length / NOTAS_POR_PAGINA));
          const paginaAtual  = Math.min(notasPagina, totalPaginas);
          const notasPagina_ = notasFiltradas.slice((paginaAtual - 1) * NOTAS_POR_PAGINA, paginaAtual * NOTAS_POR_PAGINA);

          const tipoCls: Record<string, string> = {
            MANUTENCAO:  'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
            ASSISTENCIA: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
            PRODUTO:     'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
          };
          const tipoLabel: Record<string, string> = {
            MANUTENCAO: 'Manut.', ASSISTENCIA: 'Assist.', PRODUTO: 'Produto',
          };
          const tipoIcon: Record<string, string> = {
            MANUTENCAO: '🛠️', ASSISTENCIA: '🔧', PRODUTO: '📦',
          };

          const situacaoBoletoCls: Record<string, string> = {
            EMABERTO:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
            PAGO:      'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
            CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
            EXPIRADO:  'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
            VENCIDO:   'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
            BAIXADO:   'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
          };
          const situacaoLabel: Record<string, string> = {
            EMABERTO: 'Em Aberto', PAGO: 'Pago', CANCELADO: 'Cancelado',
            EXPIRADO: 'Expirado', VENCIDO: 'Vencido', BAIXADO: 'Baixado',
          };

          return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {/* Cabeçalho + filtros */}
              <div className="px-4 lg:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">📄</span> Notas Fiscais
                    <span className="text-xs font-normal text-slate-400">({notasFiltradas.length})</span>
                  </h3>
                  <Link href="/notas" className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline">
                    Ver todas →
                  </Link>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Busca */}
                  <input
                    type="text"
                    placeholder="Buscar por número, cliente ou condomínio..."
                    value={notasBusca}
                    onChange={e => { setNotasBusca(e.target.value); setNotasPagina(1); }}
                    className="flex-1 px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  {/* Filtro tipo */}
                  <select
                    value={notasFiltroTipo}
                    onChange={e => { setNotasFiltroTipo(e.target.value); setNotasPagina(1); }}
                    className="px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                  >
                    <option value="todos">Todos os tipos</option>
                    <option value="MANUTENCAO">Manutenção</option>
                    <option value="ASSISTENCIA">Assistência</option>
                    <option value="PRODUTO">Produto</option>
                  </select>
                </div>
              </div>

              {/* Tabela */}
              {notasPagina_.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">Nenhuma nota encontrada</div>
              ) : (
                <>
                  {/* Desktop: tabela */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                          <th className="px-4 py-3 text-left">Nota</th>
                          <th className="px-4 py-3 text-left">Tipo</th>
                          <th className="px-4 py-3 text-left">Cliente / Condomínio</th>
                          <th className="px-4 py-3 text-right">Valor</th>
                          <th className="px-4 py-3 text-center">Vencimento</th>
                          <th className="px-4 py-3 text-center">Parcelas</th>
                          <th className="px-4 py-3 text-center">Boletos</th>
                          <th className="px-4 py-3 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notasPagina_.map(nota => {
                          const boletosNota = boletos.filter(b => b.nota_fiscal_id === nota.id);
                          const condominio  = condominios.find(c => c.id === nota.condominio_id);
                          const nomeExibir  = condominio?.nome || nota.cliente_nome || '—';
                          const hoje        = new Date(); hoje.setHours(0, 0, 0, 0);
                          const venc        = pd(nota.data_vencimento);
                          const vencida     = nota.status !== 'CANCELADA' && venc < hoje && boletosNota.every(b => b.situacao !== 'PAGO' && b.situacao !== 'BAIXADO');

                          return (
                            <tr key={nota.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                {nota.nota_vinculada_id && <span className="mr-1 text-violet-500 text-xs">🔗</span>}
                                #{nota.numero_nota}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${tipoCls[nota.tipo] || tipoCls['OUTROS']}`}>
                                  {tipoIcon[nota.tipo]} {tipoLabel[nota.tipo] || nota.tipo}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={nomeExibir}>
                                {nomeExibir}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                {fmt(nota.valor)}
                              </td>
                              <td className={`px-4 py-3 text-center text-xs font-bold ${vencida ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                {pd(nota.data_vencimento).toLocaleDateString('pt-BR')}
                                {vencida && <span className="ml-1">⚠️</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">
                                {nota.parcelas}x
                              </td>
                              <td className="px-4 py-3 text-center">
                                {boletosNota.length === 0 ? (
                                  <span className="text-xs text-slate-400 italic">sem boleto</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {boletosNota.map(b => (
                                      <span key={b.id} className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${situacaoBoletoCls[b.situacao] || ''}`}>
                                        {b.numero_parcela}/{b.total_parcelas} {situacaoLabel[b.situacao]}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Link href={`/notas/${nota.id}`} className="text-orange-600 dark:text-orange-400 hover:underline font-bold text-xs">
                                  Ver →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: cards */}
                  <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {notasPagina_.map(nota => {
                      const boletosNota = boletos.filter(b => b.nota_fiscal_id === nota.id);
                      const condominio  = condominios.find(c => c.id === nota.condominio_id);
                      const nomeExibir  = condominio?.nome || nota.cliente_nome || '—';
                      const hoje        = new Date(); hoje.setHours(0, 0, 0, 0);
                      const venc        = pd(nota.data_vencimento);
                      const vencida     = nota.status !== 'CANCELADA' && venc < hoje && boletosNota.every(b => b.situacao !== 'PAGO' && b.situacao !== 'BAIXADO');

                      return (
                        <Link key={nota.id} href={`/notas/${nota.id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${tipoCls[nota.tipo] || tipoCls['OUTROS']}`}>
                                {tipoIcon[nota.tipo]} {tipoLabel[nota.tipo]}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white text-sm">#{nota.numero_nota}</span>
                              {nota.nota_vinculada_id && <span className="text-violet-500 text-xs">🔗</span>}
                            </div>
                            <span className="font-black text-slate-900 dark:text-white text-sm">{fmt(nota.valor)}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1">{nomeExibir}</p>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${vencida ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              Venc. {pd(nota.data_vencimento).toLocaleDateString('pt-BR')}{vencida && ' ⚠️'}
                            </span>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {boletosNota.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">sem boleto</span>
                              ) : boletosNota.map(b => (
                                <span key={b.id} className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${situacaoBoletoCls[b.situacao] || ''}`}>
                                  {situacaoLabel[b.situacao]}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Paginação */}
              {totalPaginas > 1 && (
                <div className="px-4 lg:px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {(paginaAtual - 1) * NOTAS_POR_PAGINA + 1}–{Math.min(paginaAtual * NOTAS_POR_PAGINA, notasFiltradas.length)} de {notasFiltradas.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setNotasPagina(p => Math.max(1, p - 1))}
                      disabled={paginaAtual === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      ← Ant
                    </button>
                    {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                      const p = totalPaginas <= 5 ? i + 1 : Math.min(Math.max(paginaAtual - 2, 1) + i, totalPaginas);
                      return (
                        <button
                          key={p}
                          onClick={() => setNotasPagina(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${p === paginaAtual ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setNotasPagina(p => Math.min(totalPaginas, p + 1))}
                      disabled={paginaAtual === totalPaginas}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Próx →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
