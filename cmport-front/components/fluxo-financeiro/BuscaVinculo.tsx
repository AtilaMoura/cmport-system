"use client"

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface Item {
  id: number;
}

interface Props<T extends Item> {
  label: string;
  placeholder: string;
  endpoint: string;
  selecionados: T[];
  onChange: (items: T[]) => void;
  renderOpcao: (item: T) => string;
  renderChip: (item: T) => string;
  extraParams?: Record<string, string | number>;
}

export function BuscaVinculo<T extends Item>({ label, placeholder, endpoint, selecionados, onChange, renderOpcao, renderChip, extraParams }: Props<T>) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<T[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarApi = useCallback(() => {
    setBuscando(true);
    const params = { ...extraParams, ...(busca.trim() ? { q: busca.trim() } : {}) };
    api.get(endpoint, { params })
      .then(({ data }) => setResultados(data))
      .catch(() => setResultados([]))
      .finally(() => setBuscando(false));
  }, [busca, endpoint, extraParams]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(buscarApi, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [buscarApi]);

  const adicionar = (item: T) => {
    if (!selecionados.some(s => s.id === item.id)) {
      onChange([...selecionados, item]);
    }
    setBusca('');
    setResultados([]);
    setAberto(false);
  };

  const remover = (id: number) => {
    onChange(selecionados.filter(s => s.id !== id));
  };

  const disponiveis = resultados.filter(r => !selecionados.some(s => s.id === r.id));

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={busca}
          onChange={e => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => { setAberto(true); if (!busca.trim()) buscarApi(); }}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
        />
        {aberto && (
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
            {buscando ? (
              <div className="px-3 py-2.5 text-xs text-slate-400">Buscando...</div>
            ) : disponiveis.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-400">Nada encontrado.</div>
            ) : (
              disponiveis.map(item => (
                <button key={item.id} type="button" onClick={() => adicionar(item)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {renderOpcao(item)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selecionados.map(item => (
            <span key={item.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
              {renderChip(item)}
              <button type="button" onClick={() => remover(item.id)} className="hover:text-red-600 dark:hover:text-red-400 font-bold">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
