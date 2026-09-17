"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  type Movimentacao, type Despesa, type DespesaParcela,
  fmtValor, fmtData, FORMAS_PAGAMENTO, FORMA_LABEL,
} from '@/lib/fluxoFinanceiro';

interface EntidadeOpcao {
  id: number;
  nome: string;
}
interface ParcelaCandidata {
  parcela: DespesaParcela;
  despesa: Despesa;
}

function mensagemErro(err: unknown, padrao: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    if (resp?.data?.detail) return resp.data.detail;
  }
  return padrao;
}

function ConciliacaoContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();

  const [pendentes, setPendentes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);

  const [trocandoId, setTrocandoId] = useState<number | null>(null);
  const [candidatas, setCandidatas] = useState<ParcelaCandidata[]>([]);
  const [buscaTroca, setBuscaTroca] = useState('');
  const [confirmandoIgnorarId, setConfirmandoIgnorarId] = useState<number | null>(null);

  const [criandoId, setCriandoId] = useState<number | null>(null);
  const [entidades, setEntidades] = useState<EntidadeOpcao[]>([]);
  const [fornecedores, setFornecedores] = useState<EntidadeOpcao[]>([]);
  const [novaDespesa, setNovaDespesa] = useState({
    modo: 'DESPESA' as 'DESPESA' | 'FORNECEDOR',
    entidadeId: '', descricao: '', forma_pagamento: 'PIX',
  });
  const [salvandoNova, setSalvandoNova] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'DEV') router.replace('/fluxo-financeiro');
  }, [user, router]);

  useEffect(() => {
    api.get('/categorias-financeiras', { params: { grupo: 'DESPESA', ativo: true } }).then(({ data }) => setEntidades(data)).catch(() => {});
    api.get('/condominios', { params: { tipo: 'FORNECEDOR', ativo: true, limit: 700 } }).then(({ data }) => setFornecedores(data)).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/financeiro/movimentacoes/pendentes-banco', {
        params: { ano, mes, ...(cnpjFiltro ? { cnpj: cnpjFiltro } : {}) },
      });
      setPendentes(data.map((m: Movimentacao) => ({ ...m, valor: Number(m.valor) })));
    } catch {
      setPendentes([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, cnpjFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const puxarExtrato = async () => {
    setSincronizando(true);
    try {
      const ultimoDiaMes = new Date(ano, mes, 0);
      const hoje = new Date();
      const fim = ultimoDiaMes < hoje ? ultimoDiaMes : hoje;
      const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const dataFim = fim.toISOString().slice(0, 10);
      const { data } = await api.post('/financeiro/sincronizar-inter', null, {
        params: { data_inicio: dataInicio, data_fim: dataFim },
      });
      setMensagem({ texto: data.mensagem });
      await carregar();
    } catch (err) {
      setMensagem({ texto: mensagemErro(err, 'Erro ao puxar o extrato.'), erro: true });
    } finally {
      setSincronizando(false);
    }
  };

  const confirmar = async (movId: number, parcelaId: number) => {
    setConfirmandoId(movId);
    try {
      await api.post(`/financeiro/movimentacoes/${movId}/confirmar-parcela`, { parcela_id: parcelaId });
      setPendentes(prev => prev.filter(m => m.id !== movId));
    } catch (err) {
      setMensagem({ texto: mensagemErro(err, 'Erro ao confirmar.'), erro: true });
    } finally {
      setConfirmandoId(null);
    }
  };

  const ignorar = async (movId: number) => {
    if (confirmandoIgnorarId !== movId) {
      setConfirmandoIgnorarId(movId);
      return;
    }
    setConfirmandoIgnorarId(null);
    setConfirmandoId(movId);
    try {
      await api.post(`/financeiro/movimentacoes/${movId}/validar`);
      setPendentes(prev => prev.filter(m => m.id !== movId));
    } catch {
      setMensagem({ texto: 'Erro ao ignorar.', erro: true });
    } finally {
      setConfirmandoId(null);
    }
  };

  const abrirTroca = async (mov: Movimentacao) => {
    setTrocandoId(mov.id);
    setCriandoId(null);
    setBuscaTroca('');
    try {
      const { data } = await api.get('/despesas', { params: cnpjFiltro ? { cnpj: cnpjFiltro } : {} });
      const lista: ParcelaCandidata[] = [];
      for (const d of data as Despesa[]) {
        for (const p of d.parcelas) {
          if (p.status === 'PENDENTE') lista.push({ parcela: { ...p, valor: Number(p.valor) }, despesa: d });
        }
      }
      setCandidatas(lista);
    } catch {
      setCandidatas([]);
    }
  };

  const candidatasFiltradas = candidatas.filter(c => {
    if (!buscaTroca.trim()) return true;
    const alvo = `${c.despesa.descricao}`.toLowerCase();
    return alvo.includes(buscaTroca.trim().toLowerCase());
  }).slice(0, 30);

  const abrirCriarNova = (mov: Movimentacao) => {
    setCriandoId(mov.id);
    setTrocandoId(null);
    setNovaDespesa({ modo: 'DESPESA', entidadeId: '', descricao: mov.descricao, forma_pagamento: mov.forma_pagamento || 'PIX' });
  };

  const salvarNova = async (mov: Movimentacao) => {
    if (!novaDespesa.descricao || !novaDespesa.entidadeId) {
      setMensagem({ texto: `Preencha descrição e ${novaDespesa.modo === 'FORNECEDOR' ? 'fornecedor' : 'categoria'}.`, erro: true }); return;
    }
    if (!mov.banco_id) { setMensagem({ texto: 'Essa movimentação não tem banco definido.', erro: true }); return; }
    setSalvandoNova(true);
    try {
      const payload: Record<string, unknown> = {
        descricao: novaDespesa.descricao,
        cnpj: cnpjFiltro || '22761557000188',
        tipo_pagamento: 'UNICO',
        valor_total: mov.valor,
        data_primeira_parcela: mov.data,
        pagamentos: { 1: { data_pagamento: mov.data, banco_id: mov.banco_id, forma_pagamento: novaDespesa.forma_pagamento, movimentacao_id: mov.id } },
      };
      if (novaDespesa.modo === 'FORNECEDOR') payload.fornecedor_id = Number(novaDespesa.entidadeId);
      else payload.categoria_id = Number(novaDespesa.entidadeId);
      await api.post('/despesas', payload);
      setPendentes(prev => prev.filter(m => m.id !== mov.id));
      setCriandoId(null);
    } catch (err) {
      setMensagem({ texto: mensagemErro(err, 'Erro ao criar despesa.'), erro: true });
    } finally {
      setSalvandoNova(false);
    }
  };

  if (user && user.role !== 'DEV') return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Conciliação — Saídas do Extrato</h1>
          <p className="text-xs text-slate-500 mt-0.5">Puxa as saídas reais do banco (contas com API Inter) e sugere a despesa correspondente — só DEV, feature em teste</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} cnpjFiltro={cnpjFiltro}
          onAnoChange={setAno} onMesChange={setMes} onCnpjChange={setCnpjFiltro} mostrarFiltroCnpj
          acoesExtra={
            <button onClick={puxarExtrato} disabled={sincronizando}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
              {sincronizando ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Puxando...</> : '⬇ Puxar extrato'}
            </button>
          } />

        {mensagem && (
          <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm font-bold ${
            mensagem.erro ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                           : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
          }`}>
            <span>{mensagem.texto}</span>
            <button onClick={() => setMensagem(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : pendentes.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            Nenhuma saída pendente de conferência. Clique em &quot;Puxar extrato&quot; pra buscar as saídas do período.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {pendentes.map(mov => (
              <div key={mov.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtData(mov.data)} · {fmtValor(mov.valor)} · {mov.banco_nome}</p>
                    <p className="text-xs text-slate-400">{mov.descricao}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirTroca(mov)}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
                      Trocar
                    </button>
                    <button onClick={() => abrirCriarNova(mov)}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
                      Criar despesa nova
                    </button>
                    {confirmandoIgnorarId === mov.id ? (
                      <>
                        <button onClick={() => ignorar(mov.id)} disabled={confirmandoId === mov.id}
                          className="px-2.5 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:brightness-110 disabled:opacity-50">
                          Confirmar ignorar?
                        </button>
                        <button onClick={() => setConfirmandoIgnorarId(null)}
                          className="text-xs font-bold text-slate-400">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button onClick={() => ignorar(mov.id)}
                        className="px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400">
                        Ignorar
                      </button>
                    )}
                  </div>
                </div>

                {mov.sugestao && trocandoId !== mov.id && criandoId !== mov.id && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-bold">Sugestão:</span>{' '}
                      {mov.sugestao.fornecedor_nome || mov.sugestao.funcionario_nome || mov.sugestao.categoria_nome} —{' '}
                      {mov.sugestao.despesa_descricao}
                      {mov.sugestao.total_parcelas > 1 ? ` (parcela ${mov.sugestao.numero_parcela}/${mov.sugestao.total_parcelas})` : ''}
                      {' '}· vence {fmtData(mov.sugestao.data_vencimento)}
                    </div>
                    <button onClick={() => confirmar(mov.id, mov.sugestao!.parcela_id)} disabled={confirmandoId === mov.id}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap">
                      {confirmandoId === mov.id ? 'Confirmando...' : '✓ Confirmar'}
                    </button>
                  </div>
                )}
                {!mov.sugestao && trocandoId !== mov.id && criandoId !== mov.id && (
                  <p className="text-xs text-slate-400 italic">Sem sugestão automática — use &quot;Trocar&quot; pra buscar manualmente ou crie uma despesa nova.</p>
                )}

                {trocandoId === mov.id && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="text" autoFocus value={buscaTroca} onChange={e => setBuscaTroca(e.target.value)}
                        placeholder="Buscar despesa/fornecedor pendente..."
                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
                      <button onClick={() => setTrocandoId(null)} className="text-xs font-bold text-slate-400">Cancelar</button>
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {candidatasFiltradas.length === 0 ? (
                        <p className="text-xs text-slate-400 py-2">Nenhuma parcela pendente encontrada.</p>
                      ) : candidatasFiltradas.map(c => (
                        <button key={c.parcela.id} onClick={() => confirmar(mov.id, c.parcela.id)}
                          className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 px-1 rounded">
                          <span className="text-xs text-slate-700 dark:text-slate-300">
                            {c.despesa.descricao}{c.parcela.total_parcelas > 1 ? ` (${c.parcela.numero_parcela}/${c.parcela.total_parcelas})` : ''}
                            {' '}· vence {fmtData(c.parcela.data_vencimento)}
                          </span>
                          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{fmtValor(c.parcela.valor)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {criandoId === mov.id && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex gap-2">
                      {(['DESPESA', 'FORNECEDOR'] as const).map(m => (
                        <button key={m} onClick={() => setNovaDespesa(p => ({ ...p, modo: m, entidadeId: '' }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${novaDespesa.modo === m ? 'bg-indigo-900 text-white dark:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                          {m === 'DESPESA' ? 'Despesa geral' : 'Fornecedor'}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={novaDespesa.descricao} onChange={e => setNovaDespesa(p => ({ ...p, descricao: e.target.value }))}
                      placeholder="Descrição" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
                    <div className="flex gap-2">
                      <select value={novaDespesa.entidadeId} onChange={e => setNovaDespesa(p => ({ ...p, entidadeId: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                        <option value="">— {novaDespesa.modo === 'FORNECEDOR' ? 'Fornecedor' : 'Categoria'} —</option>
                        {(novaDespesa.modo === 'FORNECEDOR' ? fornecedores : entidades).map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                      </select>
                      <select value={novaDespesa.forma_pagamento} onChange={e => setNovaDespesa(p => ({ ...p, forma_pagamento: e.target.value }))}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                        {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setCriandoId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500">Cancelar</button>
                      <button onClick={() => salvarNova(mov)} disabled={salvandoNova}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:brightness-110 disabled:opacity-50">
                        {salvandoNova ? 'Salvando...' : 'Salvar e vincular'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConciliacaoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <ConciliacaoContent />
    </Suspense>
  );
}
