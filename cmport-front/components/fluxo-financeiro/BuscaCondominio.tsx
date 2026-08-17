"use client"

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface CondominioOpcao {
  id: number;
  nome: string;
}

interface Props {
  value: number | '';
  onChange: (id: number | '', nome?: string) => void;
  placeholder: string;
}

export function BuscaCondominio({ value, onChange, placeholder }: Props) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<CondominioOpcao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [nomeSel, setNomeSel] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarApi = useCallback(async (texto: string) => {
    if (texto.trim().length < 3) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      const { data } = await api.get('/condominios/search', { params: { nome: texto.trim() } });
      setResultados(data);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => buscarApi(busca), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [busca, buscarApi]);

  const selecionar = (c: CondominioOpcao) => {
    onChange(c.id, c.nome);
    setNomeSel(c.nome);
    setBusca('');
    setResultados([]);
    setAberto(false);
  };

  const limpar = () => {
    onChange('');
    setNomeSel('');
    setBusca('');
    setResultados([]);
  };

  const selecionado = value !== '';

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Condomínio (filtro)</label>
      {selecionado ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30">
          <span className="text-sm font-semibold text-orange-700 dark:text-orange-400 truncate">{nomeSel}</span>
          <button type="button" onClick={limpar} className="shrink-0 font-bold text-orange-700 dark:text-orange-400 hover:text-red-600">×</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={busca}
            onChange={e => { setBusca(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
            placeholder={placeholder}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
          />
          {aberto && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
              {buscando ? (
                <div className="px-3 py-2.5 text-xs text-slate-400">Buscando...</div>
              ) : busca.trim().length < 3 ? (
                <div className="px-3 py-2.5 text-xs text-slate-400">Digite pelo menos 3 letras.</div>
              ) : resultados.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-slate-400">Nada encontrado.</div>
              ) : (
                resultados.map(c => (
                  <button key={c.id} type="button" onClick={() => selecionar(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    {c.nome}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}