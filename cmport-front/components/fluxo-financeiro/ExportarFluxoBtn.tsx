"use client"

import { useState } from 'react';
import { api } from '@/lib/api';
import { MESES } from '@/lib/fluxoFinanceiro';

const CNPJS = [
  { label: 'CMPORT + TEC', value: '' },
  { label: 'Só CMPORT', value: '22761557000188' },
  { label: 'Só TEC', value: '65756913000188' },
];

export function ExportarFluxoBtn({ ano, mes }: { ano: number; mes: number }) {
  const [aberto, setAberto] = useState(false);
  const [intervalo, setIntervalo] = useState(false);
  const [aIni, setAIni] = useState(ano);
  const [mIni, setMIni] = useState(mes);
  const [aFim, setAFim] = useState(ano);
  const [mFim, setMFim] = useState(mes);
  const [cnpj, setCnpj] = useState('');
  const [pendentes, setPendentes] = useState(true);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const baixar = async () => {
    setBaixando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({
        ano_inicio: String(intervalo ? aIni : ano),
        mes_inicio: String(intervalo ? mIni : mes),
        incluir_pendentes: String(pendentes),
      });
      if (intervalo) { params.set('ano_fim', String(aFim)); params.set('mes_fim', String(mFim)); }
      if (cnpj) params.set('cnpj', cnpj);
      const res = await api.get(`/financeiro/exportar-fluxo?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fluxo_financeiro_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setAberto(false);
    } catch {
      setErro('Erro ao gerar o Excel. Tente um período menor.');
    } finally {
      setBaixando(false);
    }
  };

  const selMes = (v: number, set: (n: number) => void) => (
    <select value={v} onChange={e => set(Number(e.target.value))}
      className="px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm">
      {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
    </select>
  );
  const selAno = (v: number, set: (n: number) => void) => (
    <input type="number" value={v} min={2020} max={2099} onChange={e => set(Number(e.target.value))}
      className="w-20 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm" />
  );

  return (
    <div className="relative">
      <button onClick={() => setAberto(a => !a)}
        className="px-3 py-2 rounded-xl text-sm font-bold bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 hover:bg-green-200 whitespace-nowrap">
        ⬇ Exportar Excel
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-2 z-20 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Exportar Fluxo</div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={intervalo} onChange={e => setIntervalo(e.target.checked)} />
              Intervalo de meses
            </label>

            {intervalo ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 w-8">De</span>
                  {selMes(mIni, setMIni)}{selAno(aIni, setAIni)}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 w-8">Até</span>
                  {selMes(mFim, setMFim)}{selAno(aFim, setAFim)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Mês: <span className="font-bold">{MESES[mes - 1]}/{ano}</span>
              </div>
            )}

            <div>
              <div className="text-xs text-slate-500 mb-1">Empresa</div>
              <div className="flex flex-wrap gap-1">
                {CNPJS.map(o => (
                  <button key={o.value} onClick={() => setCnpj(o.value)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold ${cnpj === o.value ? 'bg-blue-900 text-white dark:bg-blue-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={pendentes} onChange={e => setPendentes(e.target.checked)} />
              Incluir aba de pendências
            </label>

            {erro && <div className="text-xs text-red-600 dark:text-red-400">{erro}</div>}

            <button onClick={baixar} disabled={baixando}
              className="w-full px-3 py-2 rounded-xl text-sm font-bold bg-green-700 text-white hover:bg-green-800 disabled:opacity-50">
              {baixando ? 'Gerando...' : 'Baixar .xlsx'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
