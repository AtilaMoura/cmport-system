"use client"

import { Suspense } from 'react';
import { DespesaGenericaPage } from '@/components/fluxo-financeiro/DespesaGenericaPage';

export default function FornecedoresPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <DespesaGenericaPage modo="FORNECEDOR" />
    </Suspense>
  );
}
