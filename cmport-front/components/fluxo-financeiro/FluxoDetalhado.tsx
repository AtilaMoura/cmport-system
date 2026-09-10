"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import {
  fmtValor, fmtData, MESES, normalizarLancamentos,
  type LancamentosResponse, type LancamentoLinha,
} from '@/lib/fluxoFinanceiro';

interface CategoriaOpcao { id: number; nome: string; grupo?: string }

const TIPOS = [
  { v: '', l: 'Tudo' },
  { v: 'ENTRADA', l: 'Entradas' },
  { v: 'SAIDA', l: 'Saídas' },
  { v: 'TRANSFERENCIA', l: 'Transferências' },
];

const SUBTIPO_LABEL: Record<string, string> = {
  MANUTENCAO: 'Manutenção', ASSISTENCIA: 'Assistência', PRODUTO: 'Produto', RECIBO: 'Recibo',
  FORNECEDOR: 'Fornecedor', DESPESA: 'Despesa', FUNCIONARIO: 'Funcionário', TARIFA: 'Tarifa/Juros',
  RENDIMENTO: 'Rendimento', AVULSO: 'Avulso',
  TRANSF_ENTRADA: 'Transf. recebida', TRANSF_SAIDA: 'Transf. enviada',
};

function corValor(l: LancamentoLinha) {
  if (l.tipo === 'ENTRADA' || l.subtipo === 'TRANSF_ENTRADA') return 'text-green-700 dark:text-green-400';
  return 'text-red-700 dark:text-red-400';
}
function sinal(l: LancamentoLinha) {
  return (l.tipo === 'ENTRADA' || l.subtipo === 'TRANSF_ENTRADA') ? '+' : '−';
}

export function FluxoDetalhado({ ano, mes, cnpjFiltro }: {
  ano: number; mes: number; cnpjFiltro?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [mesFim, setMesFim] = useState(mes);
  const [tipo, setTipo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [busca, setBusca] = useState('');
  const [categorias, setCategorias] = useState<CategoriaOpcao[]>([]);

  const [dados, setDados] = useState<LancamentosResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [limite, setLimite] = useState(60);

  // o mês final acompanha o inicial quando este passa dele
  useEffect(() => { setMesFim(f => (f < mes ? mes : f)); }, [mes]);

  useEffect(() => {
    api.get('/categorias-financeiras', { params: { ativo: true } })
      .then(({ data }) => setCategorias(data ?? []))
      .catch(() => setCategorias([]));
  }, []);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { ano, mes_inicio: mes, mes_fim: Math.max(mesFim, mes) };
      if (cnpjFiltro) params.cnpj = cnpjFiltro;
      if (tipo) params.tipo = tipo;
      if (categoriaId) params.categoria_id = categoriaId;
      if (valorMin) params.valor_min = valorMin;
      if (valorMax) params.valor_max = valorMax;
      if (busca.trim()) params.busca = busca.trim();
      const r = await api.get('/financeiro/lancamentos', { params });
      setDados(normalizarLancamentos(r.data));
      setLimite(60);
    } catch {
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, mesFim, cnpjFiltro, tipo, categoriaId, valorMin, valorMax, busca]);

  useEffect(() => {
    if (!aberto) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(carregar, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [aberto, carregar]);

  const periodoLabel = mesFim > mes ? `${MESES[mes - 1]}–${MESES[mesFim - 1]}/${ano}` : `${MESES[mes - 1]}/${ano}`;
  const c = dados?.consolidado;

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
      <button onClick={() => setAberto(a => !a)}
        className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
        <span>{aberto ? '▾' : '▸'}</span> Fluxo detalhado — filtros avançados
        <span className="text-[11px] font-medium text-slate-400 normal-case">tudo que entrou e saiu, linha a linha, por CNPJ</span>
      </button>

      {aberto && (
        <div className="mt-4 space-y-4">
          {/* Painel de filtros */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Período (de {MESES[mes - 1]} até)</label>
                <select value={mesFim} onChange={e => setMesFim(Number(e.target.value))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm">
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1} disabled={i + 1 < mes}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {TIPOS.map(t => (
                    <button key={t.v || 'tudo'} type="button" onClick={() => setTipo(t.v)}
                      className={`px-3 py-2 text-sm font-bold transition-colors ${
                        tipo === t.v ? 'bg-blue-900 text-white dark:bg-blue-500'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}>{t.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Categoria</label>
                <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm max-w-48">
                  <option value="">Todas</option>
                  {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Valor (R$)</label>
                <div className="flex gap-1 items-center">
                  <input type="number" value={valorMin} onChange={e => setValorMin(e.target.value)} placeholder="mín"
                    className="w-24 px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm" />
                  <span className="text-slate-400">–</span>
                  <input type="number" value={valorMax} onChange={e => setValorMax(e.target.value)} placeholder="máx"
                    className="w-24 px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm" />
                </div>
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Busca (descrição)</label>
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex: aluguel, pix..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm" />
              </div>
              {(tipo || categoriaId || valorMin || valorMax || busca || mesFim > mes) && (
                <button onClick={() => { setTipo(''); setCategoriaId(''); setValorMin(''); setValorMax(''); setBusca(''); setMesFim(mes); }}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  limpar filtros
                </button>
              )}
            </div>
          </div>

          {loading && !dados ? (
            <div className="text-center py-8 text-slate-400 animate-pulse">Carregando lançamentos...</div>
          ) : !dados ? (
            <div className="text-center py-8 text-slate-400">Não foi possível carregar os lançamentos.</div>
          ) : (
            <>
              {/* Totais consolidados */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-3">
                  <div className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase mb-1">Entradas ({periodoLabel})</div>
                  <div className="text-lg font-black text-green-800 dark:text-green-300">{fmtValor(c!.entradas)}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-3">
                  <div className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase mb-1">Saídas</div>
                  <div className="text-lg font-black text-red-800 dark:text-red-300">{fmtValor(c!.saidas)}</div>
                </div>
                <div className={`rounded-2xl p-3 border ${c!.saldo >= 0 ? 'bg-slate-900 dark:bg-slate-800 border-slate-800' : 'bg-amber-100 dark:bg-amber-900/40 border-amber-300'}`}>
                  <div className={`text-[10px] font-bold uppercase mb-1 ${c!.saldo >= 0 ? 'text-slate-300' : 'text-amber-700 dark:text-amber-300'}`}>Saldo · {c!.qtd} lanç.</div>
                  <div className={`text-lg font-black ${c!.saldo >= 0 ? 'text-white' : 'text-amber-900 dark:text-amber-200'}`}>{fmtValor(c!.saldo)}</div>
                </div>
              </div>

              {/* Por CNPJ */}
              {dados.por_cnpj.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dados.por_cnpj.map(r => (
                    <div key={r.cnpj ?? 'sem'} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase mb-2">
                        {r.empresa ? `🏢 ${r.empresa}` : r.razao_social} <span className="font-medium text-slate-400">· {r.qtd}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><div className="text-[10px] text-slate-400 uppercase font-bold">Entrou</div><div className="text-sm font-black text-green-700 dark:text-green-400">{fmtValor(r.entradas)}</div></div>
                        <div><div className="text-[10px] text-slate-400 uppercase font-bold">Saiu</div><div className="text-sm font-black text-red-700 dark:text-red-400">{fmtValor(r.saidas)}</div></div>
                        <div><div className="text-[10px] text-slate-400 uppercase font-bold">Saldo</div><div className="text-sm font-black text-slate-900 dark:text-white">{fmtValor(r.saldo)}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabela de lançamentos */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {dados.linhas.length === 0 ? (
                  <div className="text-center py-10 text-sm text-slate-400">Nenhum lançamento com esses filtros.</div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dados.linhas.slice(0, limite).map((l, i) => (
                        <div key={`${l.origem}-${l.origem_id}-${l.subtipo}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{l.descricao}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                              <span>{SUBTIPO_LABEL[l.subtipo] ?? l.subtipo}</span>
                              {l.categoria && <span>· {l.categoria}</span>}
                              {l.empresa && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  l.empresa === 'TEC' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                                  : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'}`}>🏢 {l.empresa}</span>
                              )}
                              {l.banco_nome && <span>· {l.banco_nome}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-black ${corValor(l)}`}>{sinal(l)} {fmtValor(l.valor)}</div>
                            <div className="text-xs text-slate-400">{fmtData(l.data)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {dados.linhas.length > limite && (
                      <button onClick={() => setLimite(n => n + 100)}
                        className="w-full py-3 text-xs font-bold text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        Ver mais ({dados.linhas.length - limite} restantes)
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
