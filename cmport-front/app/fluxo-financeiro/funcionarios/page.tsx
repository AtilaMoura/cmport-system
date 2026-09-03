"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { fmtValor, fmtData, FORMAS_PAGAMENTO, FORMA_LABEL } from '@/lib/fluxoFinanceiro';

const EMPRESAS = [
  { cnpj: '22761557000188', label: 'CMPORT' },
  { cnpj: '65756913000188', label: 'TEC' },
];
const empresaLabel = (cnpj: string) => EMPRESAS.find(e => e.cnpj === cnpj)?.label ?? cnpj;

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
  funcionario_id: number | null;
  cnpj: string;
  tipo_pagamento: string;
  parcelas: Parcela[];
}

interface Funcionario {
  id: number;
  nome: string;
  empresa_padrao_cnpj: string;
  ativo: boolean;
}

interface Categoria { id: number; nome: string; }
interface Banco { id: number; nome: string; ativo: boolean; }

type LinhaParcela = { despesa: Despesa; parcela: Parcela };

// agrupa a folha do mês por funcionário
type GrupoFuncionario = {
  funcionario: Funcionario | null;
  funcionarioId: number;
  linhas: LinhaParcela[];
  total: number;
  pago: number;
  pendente: number;
};

function FolhaFuncionariosContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();
  const searchParams = useSearchParams();
  const funcFiltro = Number(searchParams.get('func')) || null;

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [soPendentes, setSoPendentes] = useState(false);

  // pagamento inline
  const [pagandoId, setPagandoId] = useState<number | null>(null);
  const [pagValor, setPagValor] = useState('');
  const [pagData, setPagData] = useState('');
  const [pagBanco, setPagBanco] = useState<number | ''>('');
  const [pagForma, setPagForma] = useState('PIX');
  const [pagLoading, setPagLoading] = useState(false);

  // lançamento avulso
  const [avulsoAberto, setAvulsoAberto] = useState(false);
  const [avFuncionario, setAvFuncionario] = useState<number | ''>('');
  const [avCategoria, setAvCategoria] = useState<number | ''>('');
  const [avDescricao, setAvDescricao] = useState('');
  const [avValor, setAvValor] = useState('');
  const [avData, setAvData] = useState(new Date().toISOString().slice(0, 10));
  const [avLoading, setAvLoading] = useState(false);

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rFunc, rDesp] = await Promise.all([
        api.get('/funcionarios'),
        api.get('/despesas', { params: { ano, mes, origem: 'FUNCIONARIO' } }),
      ]);
      setFuncionarios(rFunc.data);
      setDespesas(rDesp.data);
    } catch {
      setFuncionarios([]);
      setDespesas([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.get('/categorias-financeiras', { params: { grupo: 'FUNCIONARIO', ativo: true } })
      .then(({ data }) => setCategorias(data)).catch(() => {});
    api.get('/configuracoes/bancos')
      .then(({ data }) => setBancos(data.filter((b: Banco) => b.ativo))).catch(() => {});
  }, []);

  const bancoNome = (id: number | null) => bancos.find(b => b.id === id)?.nome ?? '';

  // ── monta os grupos por funcionário (só parcelas com vencimento no mês selecionado) ──
  const grupos = useMemo<GrupoFuncionario[]>(() => {
    const alvo = `${ano}-${String(mes).padStart(2, '0')}`;
    const porFunc = new Map<number, LinhaParcela[]>();

    for (const d of despesas) {
      if (d.funcionario_id == null) continue;
      if (cnpjFiltro && d.cnpj !== cnpjFiltro) continue;
      if (funcFiltro && d.funcionario_id !== funcFiltro) continue;
      for (const p of d.parcelas) {
        if (p.data_vencimento.slice(0, 7) !== alvo) continue;
        if (soPendentes && p.status === 'PAGO') continue;
        if (!porFunc.has(d.funcionario_id)) porFunc.set(d.funcionario_id, []);
        porFunc.get(d.funcionario_id)!.push({ despesa: d, parcela: p });
      }
    }

    const lista: GrupoFuncionario[] = [];
    for (const [fid, linhas] of porFunc.entries()) {
      linhas.sort((a, b) => a.parcela.data_vencimento.localeCompare(b.parcela.data_vencimento));
      let pago = 0, pendente = 0;
      for (const l of linhas) {
        const v = Number(l.parcela.valor);
        if (l.parcela.status === 'PAGO') pago += v; else pendente += v;
      }
      lista.push({
        funcionario: funcionarios.find(f => f.id === fid) ?? null,
        funcionarioId: fid,
        linhas,
        total: pago + pendente,
        pago,
        pendente,
      });
    }
    lista.sort((a, b) => (a.funcionario?.nome ?? '').localeCompare(b.funcionario?.nome ?? ''));
    return lista;
  }, [despesas, funcionarios, ano, mes, cnpjFiltro, funcFiltro, soPendentes]);

  const totalGeral = grupos.reduce((s, g) => s + g.total, 0);
  const pagoGeral = grupos.reduce((s, g) => s + g.pago, 0);
  const pendenteGeral = grupos.reduce((s, g) => s + g.pendente, 0);
  const totalCmport = grupos.reduce((s, g) => g.funcionario?.empresa_padrao_cnpj === EMPRESAS[0].cnpj ? s + g.total : s, 0);
  const totalTec = grupos.reduce((s, g) => g.funcionario?.empresa_padrao_cnpj === EMPRESAS[1].cnpj ? s + g.total : s, 0);

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
    } catch {
      alert('Erro ao registrar o pagamento.');
    } finally {
      setPagLoading(false);
    }
  };

  const abrirAvulso = () => {
    setAvFuncionario(funcFiltro ?? '');
    setAvCategoria('');
    setAvDescricao('');
    setAvValor('');
    setAvData(new Date().toISOString().slice(0, 10));
    setAvulsoAberto(true);
  };

  const criarAvulso = async () => {
    if (!avFuncionario) { alert('Escolha o funcionário.'); return; }
    if (!avCategoria) { alert('Escolha o tipo (categoria).'); return; }
    if (!avValor || num(avValor) <= 0) { alert('Informe o valor.'); return; }
    setAvLoading(true);
    try {
      const func = funcionarios.find(f => f.id === avFuncionario);
      const cat = categorias.find(c => c.id === avCategoria);
      await api.post('/despesas', {
        descricao: avDescricao.trim() || `${cat?.nome ?? 'Lançamento'} — ${func?.nome ?? ''}`.trim(),
        categoria_id: Number(avCategoria),
        funcionario_id: Number(avFuncionario),
        cnpj: func?.empresa_padrao_cnpj ?? EMPRESAS[0].cnpj,
        tipo_pagamento: 'UNICO',
        valor_total: num(avValor),
        data_primeira_parcela: avData,
      });
      setAvulsoAberto(false);
      await carregar();
    } catch {
      alert('Erro ao criar o lançamento.');
    } finally {
      setAvLoading(false);
    }
  };

  const funcAlvo = funcFiltro ? funcionarios.find(f => f.id === funcFiltro) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Funcionários — Folha do Mês</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Salário, adiantamento, vales e lançamentos avulsos — registre o pagamento com o valor real
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo
          ano={ano} mes={mes} cnpjFiltro={cnpjFiltro}
          onAnoChange={setAno} onMesChange={setMes} onCnpjChange={setCnpjFiltro}
          mostrarFiltroCnpj
          acoesExtra={
            <button onClick={abrirAvulso}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap">
              + Lançamento avulso
            </button>
          }
        />

        {funcFiltro && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Filtrando por</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200">
              {funcAlvo?.nome ?? `funcionário #${funcFiltro}`}
            </span>
            <Link href={`/fluxo-financeiro/funcionarios?ano=${ano}&mes=${mes}`}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              ver todos
            </Link>
          </div>
        )}

        {/* Totais */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Folha do mês</div>
            <div className="text-xl font-black text-slate-900 dark:text-white">{fmtValor(totalGeral)}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-4">
            <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Pago</div>
            <div className="text-xl font-black text-green-800 dark:text-green-300">{fmtValor(pagoGeral)}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4">
            <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Pendente</div>
            <div className="text-xl font-black text-amber-800 dark:text-amber-300">{fmtValor(pendenteGeral)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Por empresa</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">CMPORT {fmtValor(totalCmport)}</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">TEC {fmtValor(totalTec)}</div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} />
          Só pendentes
        </label>

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : grupos.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            Nenhum lançamento de folha {soPendentes ? 'pendente ' : ''}nesse mês.
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(g => (
              <div key={g.funcionarioId} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900 dark:text-white">
                        {g.funcionario?.nome ?? `Funcionário #${g.funcionarioId}`}
                      </span>
                      {g.funcionario && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {empresaLabel(g.funcionario.empresa_padrao_cnpj)}
                        </span>
                      )}
                      {g.funcionario && !g.funcionario.ativo && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">Desligado</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {g.linhas.length} lançamento{g.linhas.length > 1 ? 's' : ''} ·
                      {g.pendente > 0 ? ` pendente ${fmtValor(g.pendente)}` : ' tudo pago'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-sm text-slate-900 dark:text-white">{fmtValor(g.total)}</div>
                    <div className="text-[10px] font-bold text-green-600 dark:text-green-400">{fmtValor(g.pago)} pago</div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.linhas.map(l => {
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

      {/* ── Modal Lançamento avulso ── */}
      {avulsoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAvulsoAberto(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">+ Lançamento avulso</h2>
            <p className="text-xs text-slate-500 mb-5">Férias, 13º, rescisão, PRL, adiantamento extra, reembolso…</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Funcionário</label>
                <select value={avFuncionario} onChange={e => setAvFuncionario(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                  <option value="">— escolher —</option>
                  {funcionarios.filter(f => f.ativo || f.id === avFuncionario).map(f => (
                    <option key={f.id} value={f.id}>{f.nome} ({empresaLabel(f.empresa_padrao_cnpj)})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo</label>
                  <select value={avCategoria} onChange={e => setAvCategoria(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                    <option value="">— escolher —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor (R$)</label>
                  <input type="number" step="0.01" min="0" value={avValor} onChange={e => setAvValor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data</label>
                  <input type="date" value={avData} onChange={e => setAvData(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição (opcional)</label>
                  <input type="text" value={avDescricao} onChange={e => setAvDescricao(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setAvulsoAberto(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={criarAvulso} disabled={avLoading}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {avLoading ? 'Salvando...' : 'Lançar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FolhaFuncionariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <FolhaFuncionariosContent />
    </Suspense>
  );
}
