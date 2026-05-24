"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio {
  id: number;
  nome: string;
}

interface CondPendente {
  condominio_id: number;
  nome: string;
}

interface CorpoResumo {
  id: number;
  tipo_nota: string;
  numero_referencia: string | null;
  numero_os: string | null;
  mes_referencia: string | null;
  status: string;
  valor_bruto: number | null;
  valor_liquido: number | null;
  preenchimento_manual: boolean;
  nota_fiscal_id: number | null;
  criado_em: string;
}

interface Ciclo {
  id: number;
  condominio_id: number;
  tipo_nota: string;
  ano: number;
  mes: number;
  status_ciclo: string;
  corpos: CorpoResumo[];
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const STATUS_CICLO_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDENTE:     { label: 'Pendente',     cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  EM_ANDAMENTO: { label: 'Em Andamento', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  CONCLUIDO:    { label: 'Concluído',    cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
};

const STATUS_CORPO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  PENDENTE:      { label: 'Pendente',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',       dot: 'bg-slate-400' },
  EM_MONTAGEM:   { label: 'Em Montagem',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400', dot: 'bg-yellow-500' },
  GERADO:        { label: 'Gerado',        cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400', dot: 'bg-indigo-500' },
  XML_VINCULADO: { label: 'XML Vinculado', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',         dot: 'bg-cyan-500' },
  BOLETO_GERADO: { label: 'Boleto Gerado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400', dot: 'bg-purple-500' },
  PAGO:          { label: 'Pago',          cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',     dot: 'bg-green-500' },
  CANCELADO:     { label: 'Cancelado',     cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',            dot: 'bg-red-400' },
};

const TIPO_NOTA_CONFIG: Record<string, { label: string; icon: string }> = {
  MANUTENCAO: { label: 'Manutenção', icon: '🛠️' },
  SERVICO:    { label: 'Serviço',    icon: '🔧' },
  PRODUTO:    { label: 'Produto',    icon: '📦' },
};

function fmtValor(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 border ${color}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

export default function CorposNotaPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [condominioId, setCondominioId] = useState<number | null>(null);
  const [statusFiltro, setStatusFiltro] = useState('');
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [pendentes, setPendentes] = useState<CondPendente[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { ano, mes };
      if (condominioId) params.condominio_id = condominioId;
      if (statusFiltro) params.status = statusFiltro;
      const [rCiclos, rCond, rPendentes] = await Promise.all([
        api.get('/ciclos-nota', { params }),
        api.get('/condominios'),
        api.get('/corpos-nota/condominios-pendentes', { params: { tipo_nota: 'MANUTENCAO', ano, mes } }),
      ]);
      setCiclos(rCiclos.data);
      setCondominios(rCond.data);
      setPendentes(rPendentes.data);
    } catch {
      // silencioso — tabela pode não ter dados ainda
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [ano, mes, condominioId, statusFiltro]);

  const moverMes = (delta: number) => {
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes > 12) { novoMes = 1; novoAno++; }
    if (novoMes < 1)  { novoMes = 12; novoAno--; }
    setMes(novoMes);
    setAno(novoAno);
  };

  const cicloNomeCondominio = (c: Ciclo) =>
    condominios.find(co => co.id === c.condominio_id)?.nome ?? `Condomínio #${c.condominio_id}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <span className="text-xl sm:text-2xl">📝</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                  Corpos de Nota
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {ciclos.length} ciclo(s) em {MESES[mes - 1]}/{ano}
                </p>
              </div>
            </div>
            <Link
              href={`/corpos-nota/novo?mes=${mes}&ano=${ano}`}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold text-sm shadow hover:bg-violet-700 transition-colors text-center"
            >
              + Novo Corpo de Nota
            </Link>
          </div>
        </div>
      </div>

      {/* Stats de manutenção */}
      {!loading && (() => {
        const criados = ciclos.filter(c => c.tipo_nota === 'MANUTENCAO').length;
        const totalComContrato = criados + pendentes.length;
        return (
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div className="px-3 sm:px-6 lg:px-8 py-3">
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Com contrato"
                  value={totalComContrato}
                  color="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                />
                <StatCard
                  label="Pendentes"
                  value={pendentes.length}
                  color="border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5"
                />
                <StatCard
                  label="Criados"
                  value={criados}
                  color="border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/5"
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-3 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Navegação de mês */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-1.5">
              <button onClick={() => moverMes(-1)} className="p-1 hover:text-violet-600 transition-colors font-bold text-lg">‹</button>
              <span className="font-bold text-slate-800 dark:text-white text-sm min-w-[90px] text-center">
                {MESES[mes - 1]} / {ano}
              </span>
              <button onClick={() => moverMes(1)} className="p-1 hover:text-violet-600 transition-colors font-bold text-lg">›</button>
            </div>

            {/* Filtro condomínio */}
            <select
              value={condominioId ?? ''}
              onChange={e => setCondominioId(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            >
              <option value="">Todos os condomínios</option>
              {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>

            {/* Filtro status */}
            <select
              value={statusFiltro}
              onChange={e => setStatusFiltro(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANDAMENTO">Em Andamento</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-semibold">Carregando...</div>
        ) : ciclos.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📝</div>
            <div className="text-slate-500 font-semibold mb-2">
              Nenhum ciclo em {MESES[mes - 1]}/{ano}
            </div>
            <Link href="/corpos-nota/novo" className="mt-4 inline-block px-6 py-2 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">
              Criar primeiro corpo de nota
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {ciclos.map(ciclo => {
              const cicloStatus = STATUS_CICLO_CONFIG[ciclo.status_ciclo] ?? STATUS_CICLO_CONFIG.PENDENTE;
              const tipoConf = TIPO_NOTA_CONFIG[ciclo.tipo_nota] ?? { label: ciclo.tipo_nota, icon: '📄' };
              return (
                <div key={ciclo.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  {/* Header do ciclo */}
                  <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{tipoConf.icon}</span>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {cicloNomeCondominio(ciclo)}
                        </span>
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          {tipoConf.label} · {MESES[ciclo.mes - 1]}/{ciclo.ano}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cicloStatus.cls}`}>
                      {cicloStatus.label}
                    </span>
                  </div>

                  {/* Corpos do ciclo */}
                  {ciclo.corpos && ciclo.corpos.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ciclo.corpos.map(corpo => {
                        const corpoStatus = STATUS_CORPO_CONFIG[corpo.status] ?? STATUS_CORPO_CONFIG.PENDENTE;
                        return (
                          <Link
                            key={corpo.id}
                            href={`/corpos-nota/${corpo.id}`}
                            className="flex items-center gap-4 px-4 sm:px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${corpoStatus.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${corpoStatus.cls}`}>
                                  {corpoStatus.label}
                                </span>
                                {corpo.numero_referencia && (
                                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400">{corpo.numero_referencia}</span>
                                )}
                                {corpo.numero_os && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">OS #{corpo.numero_os}</span>
                                )}
                                {corpo.nota_fiscal_id && (
                                  <span className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold">XML ✓</span>
                                )}
                                {corpo.preenchimento_manual && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400">Manual</span>
                                )}
                              </div>
                              {corpo.mes_referencia && (
                                <span className="text-xs text-slate-400 dark:text-slate-500">{corpo.mes_referencia}</span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {corpo.valor_liquido != null ? (
                                <>
                                  <div className="text-sm font-bold text-slate-900 dark:text-white">{fmtValor(corpo.valor_liquido)}</div>
                                  {corpo.valor_bruto != null && corpo.valor_bruto !== corpo.valor_liquido && (
                                    <div className="text-xs text-slate-400 line-through">{fmtValor(corpo.valor_bruto)}</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-slate-400">Sem valor</span>
                              )}
                            </div>
                            <svg className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-6 py-4 text-sm text-slate-400 italic">
                      Nenhum corpo neste ciclo.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
