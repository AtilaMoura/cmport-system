"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { DetalheMovimentacoes } from '@/components/fluxo-financeiro/DetalheMovimentacoes';
import { type Movimentacao } from '@/lib/fluxoFinanceiro';

function TransferenciasContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/financeiro/movimentacoes', { params: { ano, mes, tipo: 'ENTRADA' } });
      // Decimal do backend serializa como string
      setMovs(r.data.map((m: Movimentacao) => ({ ...m, valor: Number(m.valor) })));
    } catch {
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Transferências Internas</h1>
          <p className="text-xs text-slate-500 mt-0.5">Entre contas próprias, rendimentos e ajustes — não é receita de condomínio</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} />
        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <DetalheMovimentacoes movs={movs} cor="text-teal-700 dark:text-teal-400" mostrarBancoOrigem onAtualizado={carregar} />
        )}
      </div>
    </div>
  );
}

export default function TransferenciasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <TransferenciasContent />
    </Suspense>
  );
}
