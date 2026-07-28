"use client"

import { useState, useMemo } from 'react';
import { fmtValor, fmtData, agruparPorCategoria, type Movimentacao } from '@/lib/fluxoFinanceiro';

interface Props {
  movs: Movimentacao[];
  cor: string;
}

export function DetalheMovimentacoes({ movs, cor }: Props) {
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  const porCategoria = useMemo(() => agruparPorCategoria(movs), [movs]);

  const filtradas = movs.filter(m => {
    if (busca && !m.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    if (categoriaFiltro && (m.categoria?.nome ?? 'Sem categoria') !== categoriaFiltro) return false;
    return true;
  });
  const total = filtradas.reduce((s, m) => s + m.valor, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição..."
            className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            <option value="">Todas as categorias</option>
            {porCategoria.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total filtrado</div>
          <div className={`text-2xl font-black ${cor}`}>{fmtValor(total)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Lançamentos</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{filtradas.length}</div>
        </div>
      </div>

      {/* Breakdown por categoria */}
      <div className="flex flex-wrap gap-2">
        {porCategoria.map(g => (
          <button key={g.nome} onClick={() => setCategoriaFiltro(categoriaFiltro === g.nome ? '' : g.nome)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              categoriaFiltro === g.nome
                ? 'bg-blue-900 text-white dark:bg-blue-500'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            <span className="font-semibold">{g.nome}</span>{' '}
            <span className="font-black">{fmtValor(g.total)}</span>
            <span className="opacity-70"> ({g.itens.length})</span>
          </button>
        ))}
      </div>

      {/* Lista detalhada */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">Nenhum lançamento encontrado.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtradas
              .slice()
              .sort((a, b) => a.data < b.data ? 1 : -1)
              .map(m => (
                <div key={m.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{m.descricao}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{m.categoria?.nome ?? 'Sem categoria'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-black text-sm ${cor}`}>{fmtValor(m.valor)}</div>
                    <div className="text-xs text-slate-400">{fmtData(m.data)}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
