"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  fmtValor, fmtData, fmtCnpj, TIPO_CLS, agruparLinhasPorBanco,
  type FluxoFinanceiroResponse, type AlertaDuplicata, type FluxoFinanceiroLinha,
} from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
}

function EntradaServicosContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();
  const [dados, setDados] = useState<FluxoFinanceiroResponse | null>(null);
  const [alertas, setAlertas] = useState<AlertaDuplicata[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [bancoFiltro, setBancoFiltro] = useState<string | null>(null);
  const [dispensando, setDispensando] = useState<number | null>(null);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalLinha, setModalLinha] = useState<FluxoFinanceiroLinha | null>(null);
  const [bancoSelecionado, setBancoSelecionado] = useState<number | ''>('');
  const [salvandoBanco, setSalvandoBanco] = useState(false);

  const carregarBancos = async () => {
    try {
      const { data } = await api.get('/configuracoes/bancos');
      setBancos(data.filter((b: { ativo: boolean }) => b.ativo));
    } catch { /* silencioso */ }
  };

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
  useEffect(() => { carregarBancos(); }, []);

  const abrirDetalhe = (l: FluxoFinanceiroLinha) => {
    setModalLinha(l);
    setBancoSelecionado(l.banco_id ?? '');
  };

  const salvarBancoLinha = async () => {
    if (!modalLinha) return;
    setSalvandoBanco(true);
    const payload = { banco_id: bancoSelecionado === '' ? null : Number(bancoSelecionado) };
    try {
      if (modalLinha.origem === 'BOLETO') {
        await api.patch(`/boletos/${modalLinha.origem_id}/banco`, payload);
      } else {
        await api.patch(`/recibos/${modalLinha.origem_id}`, payload);
      }
      setModalLinha(null);
      await carregar();
    } catch {
      alert('Erro ao salvar o banco. Tenta de novo.');
    } finally {
      setSalvandoBanco(false);
    }
  };

  const dispensarDuplicata = async (a: AlertaDuplicata, index: number) => {
    if (!confirm(`Confirma que "${a.numero_nota_1}" e "${a.numero_nota_2}" NÃO são duplicata? Esse alerta não vai aparecer mais.`)) return;
    setDispensando(index);
    try {
      await api.post('/financeiro/fluxo-mensal/alertas/dispensar', {
        nota_id_1: a.nota_id_1,
        nota_id_2: a.nota_id_2,
      });
      setAlertas(prev => prev.filter((_, i) => i !== index));
    } catch {
      alert('Erro ao dispensar o alerta. Tenta de novo.');
    } finally {
      setDispensando(null);
    }
  };

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

  const porBanco = agruparLinhasPorBanco(cnpjsInfo.flatMap(c => c.linhas));

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
            <div className="space-y-1.5">
              {alertas.map((a, i) => (
                <div key={i} className="text-xs text-red-600 dark:text-red-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {a.condominio_nome} — <span className="font-mono">{a.numero_nota_1}</span> vs <span className="font-mono">{a.numero_nota_2}</span> — {fmtValor(a.valor)} ({fmtData(a.data_pagamento_1)} / {fmtData(a.data_pagamento_2)})
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Link href={`/notas/${a.nota_id_1}`} target="_blank"
                      className="underline decoration-dotted underline-offset-2 hover:text-red-800 dark:hover:text-red-300 font-semibold">
                      Ver nota {a.numero_nota_1}
                    </Link>
                    <Link href={`/notas/${a.nota_id_2}`} target="_blank"
                      className="underline decoration-dotted underline-offset-2 hover:text-red-800 dark:hover:text-red-300 font-semibold">
                      Ver nota {a.numero_nota_2}
                    </Link>
                    <button type="button" onClick={() => dispensarDuplicata(a, i)} disabled={dispensando === i}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                      {dispensando === i ? 'Salvando...' : 'Não é duplicata'}
                    </button>
                  </span>
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

              {porBanco.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {porBanco.map(g => (
                    <button key={g.nome} type="button" onClick={() => setBancoFiltro(b => b === g.nome ? null : g.nome)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        bancoFiltro === g.nome
                          ? 'bg-teal-900 text-white dark:bg-teal-600'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}>
                      <span className="font-semibold">💳 {g.nome}</span>{' '}
                      <span className="font-black">{fmtValor(g.total)}</span>
                      <span className="opacity-70"> ({g.itens.length})</span>
                    </button>
                  ))}
                </div>
              )}

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
                  const linhasFiltradas = c.linhas
                    .filter(l => !tipoFiltro || l.tipo === tipoFiltro)
                    .filter(l => !bancoFiltro || (l.banco_nome ?? 'Sem banco') === bancoFiltro);
                  if (linhasFiltradas.length === 0) {
                    return (
                      <div className="text-center py-8 text-sm text-slate-400">
                        {tipoFiltro || bancoFiltro ? `Nenhum lançamento com esse filtro neste mês (${c.labelCurto}).` : `Sem lançamentos neste mês (${c.labelCurto}).`}
                      </div>
                    );
                  }
                  return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {linhasFiltradas.map((l, i) => (
                      <div key={i} onClick={() => abrirDetalhe(l)}
                        className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.labelCurto}</span>
                            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{l.condominio_nome}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIPO_CLS[l.tipo] ?? ''}`}>{l.tipo}</span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>
                              NF {l.numero_nota}
                              {l.numero_nota !== l.numero_nota_normalizado && ` (base: ${l.numero_nota_normalizado})`}
                            </span>
                            {l.banco_nome && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold font-sans bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400">💳 {l.banco_nome}</span>
                            )}
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

        {/* ── Modal de detalhe / troca de banco ── */}
        {modalLinha && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalLinha(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">{modalLinha.condominio_nome}</h2>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-4 ${TIPO_CLS[modalLinha.tipo] ?? ''}`}>{modalLinha.tipo}</span>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Origem</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{modalLinha.origem === 'BOLETO' ? 'Boleto' : 'Recibo'} #{modalLinha.origem_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Número da nota</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {modalLinha.numero_nota}
                    {modalLinha.numero_nota !== modalLinha.numero_nota_normalizado && ` (base: ${modalLinha.numero_nota_normalizado})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmtValor(modalLinha.valor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data de pagamento</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{fmtData(modalLinha.data_pagamento)}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Conta bancária</label>
                <select
                  value={bancoSelecionado}
                  onChange={e => setBancoSelecionado(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                >
                  <option value="">— Nenhuma —</option>
                  {bancos.map(b => (
                    <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalLinha(null)}
                  className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                  Cancelar
                </button>
                <button onClick={salvarBancoLinha} disabled={salvandoBanco}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {salvandoBanco
                    ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                    : '💾 Salvar'}
                </button>
              </div>
            </div>
          </div>
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
