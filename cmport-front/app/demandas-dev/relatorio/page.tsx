"use client"

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Relatorio, AUTOR_EMOJI, STATUS_CLASSE, STATUS_LABEL, fmtData,
} from '@/lib/demandas';

function primeiroDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function RelatorioPage() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [incluirDescartadas, setIncluirDescartadas] = useState(false);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | boolean> = { incluir_descartadas: incluirDescartadas };
      if (dataInicio) params.data_inicio = dataInicio;
      if (dataFim) params.data_fim = dataFim;
      const r = await api.get('/canal/relatorio', { params });
      setRel(r.data);
    } catch {
      setRel(null);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, incluirDescartadas]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixarPdf = async () => {
    setBaixando(true);
    try {
      const params: Record<string, string | boolean> = { incluir_descartadas: incluirDescartadas };
      if (dataInicio) params.data_inicio = dataInicio;
      if (dataFim) params.data_fim = dataFim;
      const r = await api.get('/canal/relatorio.pdf', { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-demandas${dataInicio ? '-' + dataInicio : ''}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      alert('Erro ao gerar o PDF.');
    } finally {
      setBaixando(false);
    }
  };

  const atalho = (ini: string, fim: string) => { setDataInicio(ini); setDataFim(fim); };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/demandas-dev" className="text-slate-500 hover:text-violet-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Relatório de Demandas</h1>
              <p className="text-xs text-slate-500">O que já foi resolvido — pronto pra repassar</p>
            </div>
          </div>
          <button onClick={baixarPdf} disabled={baixando || !rel || rel.itens.length === 0}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50">
            {baixando ? 'Gerando...' : '⬇ Baixar PDF'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">De</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pb-2">
              <input type="checkbox" checked={incluirDescartadas} onChange={e => setIncluirDescartadas(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600" />
              incluir descartadas
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => atalho('', '')} className="text-xs font-bold text-violet-600 hover:underline">Tudo</button>
            <button onClick={() => atalho(primeiroDiaMes(), hoje())} className="text-xs font-bold text-violet-600 hover:underline">Este mês</button>
          </div>
        </div>

        {/* Resultado */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : !rel || rel.itens.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center py-12 text-slate-500 text-sm">
            Nenhuma demanda resolvida no período.
          </div>
        ) : (
          <>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {rel.total_resolvidas} resolvida(s)
              {incluirDescartadas && rel.total_descartadas > 0 && ` · ${rel.total_descartadas} descartada(s)`}
            </div>
            <div className="space-y-3">
              {rel.itens.map((i, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1 flex-wrap">
                    <span className="font-mono font-bold text-slate-500">{i.codigo}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLASSE[i.status]}`}>
                      {STATUS_LABEL[i.status]}
                    </span>
                    <span>resolvida {fmtData(i.data_resolucao)}</span>
                    <span>· aberta por {AUTOR_EMOJI[i.autor]} {i.autor.charAt(0) + i.autor.slice(1).toLowerCase()} em {fmtData(i.data_abertura)}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{i.titulo || '(sem título)'}</div>
                  {(i.resolucao_texto || i.motivo_descarte) && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                      {i.status === 'RESOLVIDA' ? i.resolucao_texto : i.motivo_descarte}
                    </p>
                  )}
                  {i.commit_ref && <p className="text-xs text-slate-400 font-mono mt-1">commit: {i.commit_ref}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
