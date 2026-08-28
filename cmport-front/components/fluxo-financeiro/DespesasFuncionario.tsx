"use client"

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { fmtValor, fmtData, FORMAS_PAGAMENTO, FORMA_LABEL } from '@/lib/fluxoFinanceiro';

interface Parcela {
  id: number;
  numero_parcela: number;
  total_parcelas: number;
  valor: number | string;
  data_vencimento: string;
  status: string;
  data_pagamento: string | null;
  banco_id: number | null;
}

interface Despesa {
  id: number;
  descricao: string;
  categoria_id: number | null;
  tipo_pagamento: string;
  funcionario_id: number | null;
  parcelas: Parcela[];
}

interface Categoria { id: number; nome: string; }
interface Banco { id: number; nome: string; razao_social_titular: string | null; ativo: boolean; }

type LinhaParcela = { despesa: Despesa; parcela: Parcela };

const mesLabel = (iso: string) => {
  const [y, m] = iso.split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(m) - 1]}/${y}`;
};

export function DespesasFuncionario({
  funcionarioId, funcionarioNome, empresaPadraoCnpj, onClose, onMudou,
}: {
  funcionarioId: number;
  funcionarioNome: string;
  empresaPadraoCnpj: string;
  onClose: () => void;
  onMudou?: () => void;
}) {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [soPendentes, setSoPendentes] = useState(true);

  // pagamento inline
  const [pagandoId, setPagandoId] = useState<number | null>(null);
  const [pagValor, setPagValor] = useState('');
  const [pagData, setPagData] = useState('');
  const [pagBanco, setPagBanco] = useState<number | ''>('');
  const [pagForma, setPagForma] = useState('PIX');
  const [pagLoading, setPagLoading] = useState(false);

  // lançamento avulso
  const [avulsoAberto, setAvulsoAberto] = useState(false);
  const [avCategoria, setAvCategoria] = useState<number | ''>('');
  const [avDescricao, setAvDescricao] = useState('');
  const [avValor, setAvValor] = useState('');
  const [avData, setAvData] = useState(new Date().toISOString().slice(0, 10));
  const [avLoading, setAvLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/despesas', { params: { funcionario_id: funcionarioId } });
      setDespesas(r.data);
    } catch {
      setDespesas([]);
    } finally {
      setLoading(false);
    }
  }, [funcionarioId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.get('/categorias-financeiras', { params: { grupo: 'FUNCIONARIO', ativo: true } })
      .then(({ data }) => setCategorias(data)).catch(() => {});
    api.get('/configuracoes/bancos')
      .then(({ data }) => setBancos(data.filter((b: Banco) => b.ativo))).catch(() => {});
  }, []);

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  // achata despesa -> parcela, ordena por vencimento
  const linhas: LinhaParcela[] = despesas
    .flatMap(d => d.parcelas.map(p => ({ despesa: d, parcela: p })))
    .filter(l => !soPendentes || l.parcela.status !== 'PAGO')
    .sort((a, b) => a.parcela.data_vencimento.localeCompare(b.parcela.data_vencimento));

  // agrupa por mês do vencimento
  const porMes = new Map<string, LinhaParcela[]>();
  for (const l of linhas) {
    const chave = l.parcela.data_vencimento.slice(0, 7);
    if (!porMes.has(chave)) porMes.set(chave, []);
    porMes.get(chave)!.push(l);
  }

  const abrirPagamento = (l: LinhaParcela) => {
    setPagandoId(l.parcela.id);
    setPagValor(String(l.parcela.valor ?? ''));
    setPagData(new Date().toISOString().slice(0, 10));
    setPagBanco(l.parcela.banco_id ?? '');
    setPagForma('PIX');
  };

  const confirmarPagamento = async (parcelaId: number) => {
    if (!pagBanco) { alert('Escolha o banco.'); return; }
    setPagLoading(true);
    try {
      await api.patch(`/despesas/parcelas/${parcelaId}/pagar`, {
        data_pagamento: pagData,
        banco_id: Number(pagBanco),
        forma_pagamento: pagForma,
        valor: num(pagValor),
      });
      setPagandoId(null);
      await carregar();
      onMudou?.();
    } catch {
      alert('Erro ao registrar o pagamento.');
    } finally {
      setPagLoading(false);
    }
  };

  const criarAvulso = async () => {
    if (!avCategoria) { alert('Escolha o tipo (categoria).'); return; }
    if (!avValor || num(avValor) <= 0) { alert('Informe o valor.'); return; }
    setAvLoading(true);
    try {
      const cat = categorias.find(c => c.id === avCategoria);
      await api.post('/despesas', {
        descricao: avDescricao.trim() || `${cat?.nome ?? 'Lançamento'} — ${funcionarioNome}`,
        categoria_id: Number(avCategoria),
        funcionario_id: funcionarioId,
        cnpj: empresaPadraoCnpj,
        tipo_pagamento: 'UNICO',
        valor_total: num(avValor),
        data_primeira_parcela: avData,
      });
      setAvulsoAberto(false);
      setAvCategoria(''); setAvDescricao(''); setAvValor('');
      await carregar();
      onMudou?.();
    } catch {
      alert('Erro ao criar o lançamento.');
    } finally {
      setAvLoading(false);
    }
  };

  const bancoNome = (id: number | null) => bancos.find(b => b.id === id)?.nome ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Despesas — {funcionarioNome}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Folha mensal + lançamentos avulsos (férias, 13º, rescisão…)</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="flex flex-wrap gap-2 items-center mb-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />
            Só pendentes
          </label>
          <button onClick={() => setAvulsoAberto(v => !v)}
            className="ml-auto px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">
            + Lançamento avulso
          </button>
        </div>

        {avulsoAberto && (
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo</label>
                <select value={avCategoria} onChange={e => setAvCategoria(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                  <option value="">— escolher —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={avValor} onChange={e => setAvValor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data</label>
                <input type="date" value={avData} onChange={e => setAvData(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição (opcional)</label>
                <input type="text" value={avDescricao} onChange={e => setAvDescricao(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAvulsoAberto(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500">Cancelar</button>
              <button onClick={criarAvulso} disabled={avLoading}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {avLoading ? 'Salvando...' : 'Lançar'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-slate-400 animate-pulse">Carregando...</div>
        ) : linhas.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            {soPendentes ? 'Nenhuma parcela pendente.' : 'Nenhuma despesa.'}
          </div>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {[...porMes.entries()].map(([mes, itens]) => (
              <div key={mes}>
                <div className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1.5">{mesLabel(mes + '-01')}</div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  {itens.map(l => {
                    const pago = l.parcela.status === 'PAGO';
                    const pagando = pagandoId === l.parcela.id;
                    return (
                      <div key={l.parcela.id} className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {l.despesa.descricao.split(' — ')[0]}
                              {l.parcela.total_parcelas > 1 && ` (${l.parcela.numero_parcela}/${l.parcela.total_parcelas})`}
                            </div>
                            <div className="text-xs text-slate-500">
                              venc {fmtData(l.parcela.data_vencimento)}
                              {pago && l.parcela.data_pagamento && ` · pago ${fmtData(l.parcela.data_pagamento)} · ${bancoNome(l.parcela.banco_id)}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-slate-900 dark:text-white">{fmtValor(Number(l.parcela.valor))}</div>
                            {pago
                              ? <span className="text-[10px] font-bold text-green-600 dark:text-green-400">PAGO</span>
                              : !pagando && (
                                <button onClick={() => abrirPagamento(l)}
                                  className="text-[10px] font-bold text-emerald-600 hover:underline">
                                  registrar pagamento
                                </button>
                              )}
                          </div>
                        </div>

                        {pagando && (
                          <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 rounded-lg p-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor real (R$)</label>
                              <input type="number" step="0.01" min="0" value={pagValor} onChange={e => setPagValor(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
                              <input type="date" value={pagData} onChange={e => setPagData(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Banco</label>
                              <select value={pagBanco} onChange={e => setPagBanco(e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                                <option value="">—</option>
                                {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Forma</label>
                              <select value={pagForma} onChange={e => setPagForma(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
                                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                              </select>
                            </div>
                            <div className="col-span-2 flex gap-2 justify-end mt-1">
                              <button onClick={() => setPagandoId(null)} className="px-2 py-1 text-[11px] font-bold text-slate-500">Cancelar</button>
                              <button onClick={() => confirmarPagamento(l.parcela.id)} disabled={pagLoading}
                                className="px-3 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded-md hover:bg-emerald-700 disabled:opacity-50">
                                {pagLoading ? '...' : 'Confirmar'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
