"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  fmtValor, type FluxoFinanceiroResponse, type AlertaDuplicata, type DashboardFinanceiro,
} from '@/lib/fluxoFinanceiro';

function FluxoFinanceiroContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [dadosServicos, setDadosServicos] = useState<FluxoFinanceiroResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertaDuplicata[]>([]);
  const [dashboard, setDashboard] = useState<DashboardFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rServicos, rAlertas, rDash] = await Promise.all([
        api.get('/financeiro/fluxo-mensal', { params: { ano, mes } }),
        api.get('/financeiro/fluxo-mensal/alertas', { params: { ano, mes } }),
        api.get('/financeiro/dashboard', { params: { ano, mes } }),
      ]);
      setDadosServicos(rServicos.data);
      setAlertas(rAlertas.data);
      // Decimal do backend serializa como string — normaliza pra number antes de usar em contas
      const d = rDash.data;
      setDashboard({
        ...d,
        saldo_inicial: Number(d.saldo_inicial),
        entradas: Number(d.entradas),
        fornecedores: Number(d.fornecedores),
        despesas: Number(d.despesas),
        saidas: Number(d.saidas),
        saldo_mes: Number(d.saldo_mes),
        saldo_acumulado: Number(d.saldo_acumulado),
      });
    } catch {
      setDadosServicos(null);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalServicos = dadosServicos?.total_geral ?? 0;
  const totalEntradaGeral = totalServicos + (dashboard?.entradas ?? 0);
  const totalSaidaGeral = dashboard?.saidas ?? 0;
  const saldoMes = totalEntradaGeral - totalSaidaGeral;

  const cards = [
    {
      href: '/fluxo-financeiro/entrada',
      titulo: 'Entrada de Serviços',
      valor: totalServicos,
      sub: 'Manutenção + Assistência + Recibos',
      cor: 'text-green-700 dark:text-green-400',
      icone: '🏢',
    },
    {
      href: '/fluxo-financeiro/transferencias',
      titulo: 'Transferências Internas',
      valor: dashboard?.entradas ?? 0,
      sub: 'Entre contas próprias, rendimentos, ajustes',
      cor: 'text-teal-700 dark:text-teal-400',
      icone: '↔️',
    },
    {
      href: '/fluxo-financeiro/despesas',
      titulo: 'Despesas Escritório',
      valor: dashboard?.despesas ?? 0,
      sub: 'Salários, aluguel, tarifas, etc.',
      cor: 'text-red-700 dark:text-red-400',
      icone: '🧾',
    },
    {
      href: '/fluxo-financeiro/fornecedores',
      titulo: 'Fornecedores',
      valor: dashboard?.fornecedores ?? 0,
      sub: 'Material e serviços de terceiros',
      cor: 'text-orange-700 dark:text-orange-400',
      icone: '📦',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo Financeiro</h1>
          <p className="text-xs text-slate-500 mt-0.5">Visão geral do mês — entrada, saída e comparativo, direto do sistema</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} />

        {alertas.length > 0 && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">
              ⚠️ {alertas.length} possível{alertas.length > 1 ? 'is' : ''} duplicata{alertas.length > 1 ? 's' : ''} detectada{alertas.length > 1 ? 's' : ''} na entrada de serviços
            </p>
            <Link href={`/fluxo-financeiro/entrada?ano=${ano}&mes=${mes}`} className="text-xs font-bold text-red-600 dark:text-red-400 underline">
              Ver detalhe →
            </Link>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <>
            {/* Comparativo geral */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-4">
                <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Total Entrada</div>
                <div className="text-2xl font-black text-green-800 dark:text-green-300">{fmtValor(totalEntradaGeral)}</div>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
                <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide mb-1">Total Saída</div>
                <div className="text-2xl font-black text-red-800 dark:text-red-300">{fmtValor(totalSaidaGeral)}</div>
              </div>
              <div className={`rounded-2xl p-4 border ${saldoMes >= 0 ? 'bg-slate-900 dark:bg-slate-800 border-slate-800' : 'bg-amber-900 dark:bg-amber-900/40 border-amber-800'}`}>
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">Saldo do Mês</div>
                <div className="text-2xl font-black text-white">{fmtValor(saldoMes)}</div>
              </div>
            </div>

            {/* Cards de navegação por seção */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cards.map(c => (
                <Link key={c.href} href={`${c.href}?ano=${ano}&mes=${mes}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-2xl mb-2">{c.icone}</div>
                      <div className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">{c.titulo}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{c.sub}</div>
                    </div>
                    <div className={`text-xl font-black ${c.cor} whitespace-nowrap`}>{fmtValor(c.valor)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function FluxoFinanceiroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <FluxoFinanceiroContent />
    </Suspense>
  );
}
