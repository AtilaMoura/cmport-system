"use client"

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

interface FluxoFinanceiroLinha {
  condominio_id: number | null;
  condominio_nome: string;
  numero_nota: string;
  numero_nota_normalizado: string;
  tipo: string;
  valor: number;
  data_pagamento: string;
  origem: string;
}

interface FluxoFinanceiroCnpj {
  cnpj: string;
  razao_social: string | null;
  total_manutencao: number;
  total_assistencia: number;
  total_recibos: number;
  total_geral: number;
  linhas: FluxoFinanceiroLinha[];
}

interface FluxoFinanceiroResponse {
  ano: number;
  mes: number;
  cnpjs: FluxoFinanceiroCnpj[];
  total_geral: number;
}

interface AlertaDuplicata {
  condominio_id: number | null;
  condominio_nome: string;
  numero_nota_1: string;
  numero_nota_2: string;
  valor: number;
  data_pagamento_1: string;
  data_pagamento_2: string;
}

const TIPO_CLS: Record<string, string> = {
  MANUTENCAO:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  ASSISTENCIA: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  RECIBO:      'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
};

export default function FluxoFinanceiroPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [cnpjFiltro, setCnpjFiltro] = useState(''); // '' = todos
  const [dados, setDados] = useState<FluxoFinanceiroResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertaDuplicata[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { ano, mes };
      if (cnpjFiltro) params.cnpj = cnpjFiltro;
      const [r, a] = await Promise.all([
        api.get('/financeiro/fluxo-mensal', { params }),
        api.get('/financeiro/fluxo-mensal/alertas', { params: { ano, mes } }),
      ]);
      setDados(r.data);
      setAlertas(a.data);
    } catch {
      setDados(null);
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, cnpjFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const cnpjs = dados?.cnpjs ?? [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo Financeiro</h1>
          <p className="text-xs text-slate-500 mt-0.5">Entrada do mês direto do sistema, por CNPJ — substitui a conferência manual da planilha</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} min={2020} max={2099}
              className="w-24 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <div className="flex gap-1 ml-2">
              {[
                { label: 'Ambos', value: '' },
                { label: 'CMPORT', value: '22761557000188' },
                { label: 'CMPORT TEC', value: '65756913000188' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setCnpjFiltro(opt.value)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                    cnpjFiltro === opt.value
                      ? 'bg-blue-900 text-white dark:bg-blue-500'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alerta de duplicata */}
        {alertas.length > 0 && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">
              ⚠️ {alertas.length} possível{alertas.length > 1 ? 'is' : ''} duplicata{alertas.length > 1 ? 's' : ''} detectada{alertas.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-1">
              {alertas.map((a, i) => (
                <div key={i} className="text-xs text-red-600 dark:text-red-400">
                  {a.condominio_nome} — <span className="font-mono">{a.numero_nota_1}</span> vs <span className="font-mono">{a.numero_nota_2}</span> — {fmtValor(a.valor)} ({fmtData(a.data_pagamento_1)} / {fmtData(a.data_pagamento_2)})
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : !dados ? (
          <div className="text-center py-12 text-slate-500">Erro ao carregar dados.</div>
        ) : (
          <>
            {/* Total geral */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total do mês</div>
              <div className="text-3xl font-black text-slate-900 dark:text-white">{fmtValor(dados.total_geral)}</div>
            </div>

            {cnpjs.map(c => (
              <div key={c.cnpj} className="space-y-3">
                <div className="flex items-center gap-2 pt-2">
                  <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    {c.razao_social ?? c.cnpj}
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">{fmtCnpj(c.cnpj)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Manutenção</div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{fmtValor(c.total_manutencao)}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-1">Assistência</div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{fmtValor(c.total_assistencia)}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-teal-600 uppercase tracking-wide mb-1">Recibos</div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{fmtValor(c.total_recibos)}</div>
                  </div>
                  <div className="bg-slate-900 dark:bg-slate-800 border border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">Total CNPJ</div>
                    <div className="text-xl font-black text-white">{fmtValor(c.total_geral)}</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {c.linhas.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">Sem lançamentos neste mês.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[32rem] overflow-y-auto">
                      {c.linhas.map((l, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{l.condominio_nome}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIPO_CLS[l.tipo] ?? ''}`}>{l.tipo}</span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              NF {l.numero_nota}
                              {l.numero_nota !== l.numero_nota_normalizado && ` (base: ${l.numero_nota_normalizado})`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-slate-900 dark:text-white">{fmtValor(l.valor)}</div>
                            <div className="text-xs text-slate-400">{fmtData(l.data_pagamento)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
