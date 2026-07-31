"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  fmtValor, fmtData, fmtCnpj, TIPO_CLS,
  type FluxoFinanceiroResponse, type AlertaDuplicata,
} from '@/lib/fluxoFinanceiro';

function EntradaServicosContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();
  const [dados, setDados] = useState<FluxoFinanceiroResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertaDuplicata[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);

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

  const soDigitos = (v: string) => v.replace(/\D/g, '');
  const ORDEM_CNPJ = ['22761557000188', '65756913000188'];
  const LABEL_CURTO: Record<string, string> = {
    '22761557000188': 'CMPORT',
    '65756913000188': 'TEC',
  };

  const cnpjs = (dados?.cnpjs ?? [])
    .filter(c => c.linhas.length > 0)
    .slice()
    .sort((a, b) => ORDEM_CNPJ.indexOf(soDigitos(a.cnpj)) - ORDEM_CNPJ.indexOf(soDigitos(b.cnpj)));

  const cnpjsInfo = cnpjs.map(c => ({
    ...c,
    labelCurto: LABEL_CURTO[soDigitos(c.cnpj)] ?? c.razao_social ?? c.cnpj,
    qtdManutencao: c.linhas.filter(l => l.tipo === 'MANUTENCAO').length,
    qtdAssistencia: c.linhas.filter(l => l.tipo === 'ASSISTENCIA').length,
    qtdRecibo: c.linhas.filter(l => l.tipo === 'RECIBO').length,
    qtdTotal: c.linhas.length,
  }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Entrada de Serviços</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manutenção + Assistência + Recibos, por CNPJ — direto de notas fiscais/boletos/recibos</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} cnpjFiltro={cnpjFiltro} onAnoChange={setAno} onMesChange={setMes}
          onCnpjChange={setCnpjFiltro} mostrarFiltroCnpj />

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
            {/* Bloco fixo no topo: Total do mês + cards de cada CNPJ (CMPORT sempre antes da TEC) */}
            <div className="sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pb-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total do mês</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{fmtValor(dados.total_geral)}</div>
              </div>

              {cnpjsInfo.map(c => (
                <div key={c.cnpj} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      {c.razao_social ?? c.cnpj}
                    </h2>
                    <span className="text-xs text-slate-400 font-mono">{fmtCnpj(c.cnpj)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button type="button" onClick={() => setTipoFiltro(t => t === 'MANUTENCAO' ? null : 'MANUTENCAO')}
                      className={`text-left rounded-2xl p-4 border transition-colors ${
                        tipoFiltro === 'MANUTENCAO'
                          ? 'bg-blue-900 border-blue-900 dark:bg-blue-500 dark:border-blue-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}>
                      <div className={`text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1.5 ${tipoFiltro === 'MANUTENCAO' ? 'text-blue-100' : 'text-blue-600'}`}>
                        Manutenção
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tipoFiltro === 'MANUTENCAO' ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-500/20'}`}>{c.qtdManutencao}</span>
                      </div>
                      <div className={`text-xl font-black ${tipoFiltro === 'MANUTENCAO' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{fmtValor(c.total_manutencao)}</div>
                    </button>
                    <button type="button" onClick={() => setTipoFiltro(t => t === 'ASSISTENCIA' ? null : 'ASSISTENCIA')}
                      className={`text-left rounded-2xl p-4 border transition-colors ${
                        tipoFiltro === 'ASSISTENCIA'
                          ? 'bg-blue-900 border-blue-900 dark:bg-blue-500 dark:border-blue-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}>
                      <div className={`text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1.5 ${tipoFiltro === 'ASSISTENCIA' ? 'text-blue-100' : 'text-violet-600'}`}>
                        Assistência
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tipoFiltro === 'ASSISTENCIA' ? 'bg-white/20' : 'bg-violet-100 dark:bg-violet-500/20'}`}>{c.qtdAssistencia}</span>
                      </div>
                      <div className={`text-xl font-black ${tipoFiltro === 'ASSISTENCIA' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{fmtValor(c.total_assistencia)}</div>
                    </button>
                    <button type="button" onClick={() => setTipoFiltro(t => t === 'RECIBO' ? null : 'RECIBO')}
                      className={`text-left rounded-2xl p-4 border transition-colors ${
                        tipoFiltro === 'RECIBO'
                          ? 'bg-blue-900 border-blue-900 dark:bg-blue-500 dark:border-blue-500'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}>
                      <div className={`text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-1.5 ${tipoFiltro === 'RECIBO' ? 'text-blue-100' : 'text-teal-600'}`}>
                        Recibos
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tipoFiltro === 'RECIBO' ? 'bg-white/20' : 'bg-teal-100 dark:bg-teal-500/20'}`}>{c.qtdRecibo}</span>
                      </div>
                      <div className={`text-xl font-black ${tipoFiltro === 'RECIBO' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{fmtValor(c.total_recibos)}</div>
                    </button>
                    <div className="bg-slate-900 dark:bg-slate-800 border border-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                        Total CNPJ
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10">{c.qtdTotal}</span>
                      </div>
                      <div className="text-xl font-black text-white">{fmtValor(c.total_geral)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Lançamentos, abaixo do bloco fixo — cada linha marcada com CMPORT ou CMPORT TEC */}
            {cnpjsInfo.map(c => (
              <div key={`${c.cnpj}-linhas`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {(() => {
                  const linhasFiltradas = tipoFiltro ? c.linhas.filter(l => l.tipo === tipoFiltro) : c.linhas;
                  if (linhasFiltradas.length === 0) {
                    return (
                      <div className="text-center py-8 text-sm text-slate-400">
                        {tipoFiltro ? `Nenhum lançamento deste tipo neste mês (${c.labelCurto}).` : `Sem lançamentos neste mês (${c.labelCurto}).`}
                      </div>
                    );
                  }
                  return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {linhasFiltradas.map((l, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.labelCurto}</span>
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
                  );
                })()}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function EntradaServicosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <EntradaServicosContent />
    </Suspense>
  );
}
