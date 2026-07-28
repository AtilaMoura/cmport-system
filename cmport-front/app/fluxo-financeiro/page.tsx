"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
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

// ── Tipos: Entrada de Serviços (notas/boletos/recibos) ──────────────────────
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

// ── Tipos: Movimentações (Entrada Bancos, Despesas, Fornecedores) ───────────
interface CategoriaFinanceira {
  id: number;
  nome: string;
  grupo: string;
  tipo: string;
}
interface Movimentacao {
  id: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  categoria_id: number | null;
  categoria: CategoriaFinanceira | null;
  origem: string;
  status: string;
}
interface DashboardFinanceiro {
  mes: number;
  ano: number;
  saldo_inicial: number;
  entradas: number;
  fornecedores: number;
  despesas: number;
  saidas: number;
  saldo_mes: number;
  saldo_acumulado: number;
}

const TIPO_CLS: Record<string, string> = {
  MANUTENCAO:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  ASSISTENCIA: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  RECIBO:      'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
};

function agruparPorCategoria(movs: Movimentacao[]) {
  const grupos = new Map<string, { nome: string; total: number; itens: Movimentacao[] }>();
  for (const m of movs) {
    const nome = m.categoria?.nome ?? 'Sem categoria';
    if (!grupos.has(nome)) grupos.set(nome, { nome, total: 0, itens: [] });
    const g = grupos.get(nome)!;
    g.total += m.valor;
    g.itens.push(m);
  }
  return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
}

function SecaoMovimentacoes({ titulo, cor, movs, busca, setBusca }: {
  titulo: string; cor: string; movs: Movimentacao[]; busca: string; setBusca: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const filtradas = busca ? movs.filter(m => m.descricao.toLowerCase().includes(busca.toLowerCase())) : movs;
  const total = filtradas.reduce((s, m) => s + m.valor, 0);
  const porCategoria = useMemo(() => agruparPorCategoria(filtradas), [filtradas]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">{titulo}</h2>
        <div className="flex items-center gap-2">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição..."
            className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white w-48" />
          <span className={`text-lg font-black ${cor}`}>{fmtValor(total)}</span>
          <button onClick={() => setAberto(a => !a)}
            className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
            {aberto ? '▲ Ocultar' : '▼ Detalhar'}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {filtradas.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">Sem lançamentos neste mês.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
                {porCategoria.map(g => (
                  <div key={g.nome} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-400">{g.nome}</span>{' '}
                    <span className="font-black text-slate-900 dark:text-white">{fmtValor(g.total)}</span>
                    <span className="text-slate-400"> ({g.itens.length})</span>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                {filtradas
                  .slice()
                  .sort((a, b) => a.data < b.data ? 1 : -1)
                  .map(m => (
                    <div key={m.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{m.descricao}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{m.categoria?.nome ?? 'Sem categoria'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-black text-sm ${cor}`}>{fmtValor(m.valor)}</div>
                        <div className="text-xs text-slate-400">{fmtData(m.data)}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FluxoFinanceiroPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [cnpjFiltro, setCnpjFiltro] = useState('');
  const [dadosServicos, setDadosServicos] = useState<FluxoFinanceiroResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertaDuplicata[]>([]);
  const [dashboard, setDashboard] = useState<DashboardFinanceiro | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);

  const [buscaBancos, setBuscaBancos] = useState('');
  const [buscaDespesas, setBuscaDespesas] = useState('');
  const [buscaFornecedores, setBuscaFornecedores] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const paramsServicos: Record<string, string | number> = { ano, mes };
      if (cnpjFiltro) paramsServicos.cnpj = cnpjFiltro;
      const [rServicos, rAlertas, rDash, rMovs] = await Promise.all([
        api.get('/financeiro/fluxo-mensal', { params: paramsServicos }),
        api.get('/financeiro/fluxo-mensal/alertas', { params: { ano, mes } }),
        api.get('/financeiro/dashboard', { params: { ano, mes } }),
        api.get('/financeiro/movimentacoes', { params: { ano, mes } }),
      ]);
      setDadosServicos(rServicos.data);
      setAlertas(rAlertas.data);
      setDashboard(rDash.data);
      setMovimentacoes(rMovs.data);
    } catch {
      setDadosServicos(null);
      setDashboard(null);
      setMovimentacoes([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, cnpjFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const cnpjs = dadosServicos?.cnpjs ?? [];
  const totalServicos = dadosServicos?.total_geral ?? 0;

  const movBancos = movimentacoes.filter(m => m.tipo === 'ENTRADA');
  const movDespesas = movimentacoes.filter(m => m.tipo === 'SAIDA' && m.categoria?.grupo === 'DESPESA');
  const movFornecedores = movimentacoes.filter(m => m.tipo === 'SAIDA' && m.categoria?.grupo === 'FORNECEDOR');

  const totalEntradaGeral = totalServicos + (dashboard?.entradas ?? 0);
  const totalSaidaGeral = dashboard?.saidas ?? 0;
  const saldoMes = totalEntradaGeral - totalSaidaGeral;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo Financeiro</h1>
          <p className="text-xs text-slate-500 mt-0.5">Resumo completo do mês direto do sistema — entrada, saída e comparativo</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

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
                { label: 'Ambos CNPJ', value: '' },
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
              ⚠️ {alertas.length} possível{alertas.length > 1 ? 'is' : ''} duplicata{alertas.length > 1 ? 's' : ''} detectada{alertas.length > 1 ? 's' : ''} na entrada de serviços
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
        ) : (
          <>
            {/* Comparativo geral */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-4">
                <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Total Entrada</div>
                <div className="text-2xl font-black text-green-800 dark:text-green-300">{fmtValor(totalEntradaGeral)}</div>
                <div className="text-[10px] text-green-600/70 dark:text-green-400/60 mt-1">Serviços {fmtValor(totalServicos)} + Transferências Internas {fmtValor(dashboard?.entradas ?? 0)}</div>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
                <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide mb-1">Total Saída</div>
                <div className="text-2xl font-black text-red-800 dark:text-red-300">{fmtValor(totalSaidaGeral)}</div>
                <div className="text-[10px] text-red-600/70 dark:text-red-400/60 mt-1">Despesas {fmtValor(dashboard?.despesas ?? 0)} + Fornecedores {fmtValor(dashboard?.fornecedores ?? 0)}</div>
              </div>
              <div className={`rounded-2xl p-4 border ${saldoMes >= 0 ? 'bg-slate-900 dark:bg-slate-800 border-slate-800' : 'bg-amber-900 dark:bg-amber-900/40 border-amber-800'}`}>
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-1">Saldo do Mês</div>
                <div className="text-2xl font-black text-white">{fmtValor(saldoMes)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Entrada − Saída (não inclui saldo acumulado de meses anteriores)</div>
              </div>
            </div>

            {/* Seção 1: Entrada de Serviços */}
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Entrada de Serviços (Manutenção + Assistência + Recibos)</h2>
              {cnpjs.map(c => (
                <div key={c.cnpj} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{c.razao_social ?? c.cnpj}</h3>
                    <span className="text-[10px] text-slate-400 font-mono">{fmtCnpj(c.cnpj)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Manutenção</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white">{fmtValor(c.total_manutencao)}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wide mb-1">Assistência</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white">{fmtValor(c.total_assistencia)}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1">Recibos</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white">{fmtValor(c.total_recibos)}</div>
                    </div>
                    <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wide mb-1">Total CNPJ</div>
                      <div className="text-lg font-black text-white">{fmtValor(c.total_geral)}</div>
                    </div>
                  </div>
                  {c.linhas.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
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
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Seção 2: Transferências Internas */}
            <SecaoMovimentacoes titulo="Transferências Internas (entre contas próprias, rendimentos, ajustes)" cor="text-green-700 dark:text-green-400"
              movs={movBancos} busca={buscaBancos} setBusca={setBuscaBancos} />

            {/* Seção 3: Despesas */}
            <SecaoMovimentacoes titulo="Despesas Escritório" cor="text-red-700 dark:text-red-400"
              movs={movDespesas} busca={buscaDespesas} setBusca={setBuscaDespesas} />

            {/* Seção 4: Fornecedores */}
            <SecaoMovimentacoes titulo="Fornecedores" cor="text-red-700 dark:text-red-400"
              movs={movFornecedores} busca={buscaFornecedores} setBusca={setBuscaFornecedores} />
          </>
        )}
      </div>
    </div>
  );
}
