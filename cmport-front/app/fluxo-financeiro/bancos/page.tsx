"use client"

import { Suspense } from 'react';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { DashboardPorBanco } from '@/components/fluxo-financeiro/DashboardPorBanco';

function BancosContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo Financeiro — Por Banco</h1>
          <p className="text-xs text-slate-500 mt-0.5">Demonstrativo de cada conta: saldo inicial → entradas → saídas → saldo calculado × extrato</p>
        </div>
      </div>
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} />
        <DashboardPorBanco ano={ano} mes={mes} />
      </div>
    </div>
  );
}

export default function BancosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <BancosContent />
    </Suspense>
  );
}
