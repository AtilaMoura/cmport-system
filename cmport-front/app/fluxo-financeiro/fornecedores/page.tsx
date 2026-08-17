"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { DetalheMovimentacoes } from '@/components/fluxo-financeiro/DetalheMovimentacoes';
import { BuscaVinculo } from '@/components/fluxo-financeiro/BuscaVinculo';
import { BuscaCondominio } from '@/components/fluxo-financeiro/BuscaCondominio';
import { type Movimentacao, type ServicoVinculado, type OsFornecedorReferencia, FORMAS_PAGAMENTO, FORMA_LABEL } from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
}

interface FornecedorOpcao {
  id: number;
  nome: string;
}

interface GrupoCondominio {
  condominioId: number;
  condominioNome: string;
  servicos: ServicoVinculado[];
}

const NOVA_VAZIA = { data: '', descricao: '', valor: '', fornecedor_id: '', banco_id: '', forma_pagamento: 'PIX' };

function FornecedoresContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [soSemServico, setSoSemServico] = useState(false);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorOpcao[]>([]);
  const [modalNova, setModalNova] = useState(false);
  const [nova, setNova] = useState(NOVA_VAZIA);
  const [osFornecedorSel, setOsFornecedorSel] = useState<OsFornecedorReferencia[]>([]);
  const [grupos, setGrupos] = useState<GrupoCondominio[]>([]);
  const [adicionarCondAberto, setAdicionarCondAberto] = useState(false);
  const [salvandoNova, setSalvandoNova] = useState(false);
  const [osReferencia, setOsReferencia] = useState<OsFornecedorReferencia[]>([]);
  const [osRefAberto, setOsRefAberto] = useState(false);

  useEffect(() => {
    api.get('/configuracoes/bancos').then(({ data }) => setBancos(data.filter((b: { ativo: boolean }) => b.ativo))).catch(() => {});
    api.get('/condominios', { params: { tipo: 'FORNECEDOR', ativo: true, limit: 700 } })
      .then(({ data }) => setFornecedores(data))
      .catch(() => {});
  }, []);

  const abrirNova = () => {
    setNova({ ...NOVA_VAZIA });
    setOsFornecedorSel([]);
    setGrupos([]);
    setAdicionarCondAberto(false);
    setOsReferencia([]);
    setOsRefAberto(false);
    setModalNova(true);
  };

  useEffect(() => {
    if (!nova.fornecedor_id) {
      setOsReferencia([]);
      setOsRefAberto(false);
      return;
    }
    api.get('/financeiro/os-fornecedor-referencia', { params: { fornecedor_id: nova.fornecedor_id } })
      .then(({ data }) => {
        setOsReferencia(data);
        setOsRefAberto(true);
      })
      .catch(() => { setOsReferencia([]); setOsRefAberto(false); });
  }, [nova.fornecedor_id]);

  // Auto-preenche data/descrição SÓ quando a seleção de OS muda (não deve reagir a digitação manual)
  useEffect(() => {
    if (osFornecedorSel.length === 0) return;
    const dataMaisRecente = osFornecedorSel
      .map(o => o.task_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    if (dataMaisRecente && !nova.data) {
      setNova(p => ({ ...p, data: dataMaisRecente.slice(0, 10) }));
    }
    if (!nova.descricao) {
      const descricao = osFornecedorSel
        .map(o => o.report || o.orientation || '')
        .filter(Boolean)
        .join(' | ');
      if (descricao) setNova(p => ({ ...p, descricao }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osFornecedorSel]);

  const toggleOs = (o: OsFornecedorReferencia) => {
    setOsFornecedorSel(prev =>
      prev.some(s => s.id === o.id)
        ? prev.filter(s => s.id !== o.id)
        : [...prev, o]
    );
  };

  const removerGrupo = (condominioId: number) => {
    setGrupos(prev => prev.filter(g => g.condominioId !== condominioId));
  };

  const atualizarServicosGrupo = (condominioId: number, novosServicos: ServicoVinculado[]) => {
    setGrupos(prev => prev.map(g => g.condominioId === condominioId ? { ...g, servicos: novosServicos } : g));
  };

  const fmtOsData = (d?: string | null) => {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  };

  const salvarNova = async () => {
    if (!nova.data || !nova.descricao || !nova.valor) {
      alert('Preencha data, descrição e valor.'); return;
    }
    setSalvandoNova(true);
    try {
      await api.post('/financeiro/movimentacoes', {
        data: nova.data,
        descricao: nova.descricao,
        valor: Number(nova.valor),
        tipo: 'SAIDA',
        fornecedor_id: nova.fornecedor_id ? Number(nova.fornecedor_id) : null,
        banco_id: nova.banco_id ? Number(nova.banco_id) : null,
        forma_pagamento: nova.forma_pagamento || null,
        servico_ids: grupos.flatMap(g => g.servicos.map(s => s.id)),
        os_fornecedor_ids: osFornecedorSel.map(o => o.id),
      });
      setModalNova(false);
      await carregar();
    } catch {
      alert('Erro ao salvar a saída de fornecedor.');
    } finally {
      setSalvandoNova(false);
    }
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = { ano, mes, tipo: 'SAIDA', grupo: 'FORNECEDOR' };
      if (soSemServico) params.sem_servico_vinculado = true;
      const r = await api.get('/financeiro/movimentacoes', { params });
      // Decimal do backend serializa como string
      setMovs(r.data.map((m: Movimentacao) => ({ ...m, valor: Number(m.valor) })));
    } catch {
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, soSemServico]);

  useEffect(() => { carregar(); }, [carregar]);

  const semServicoCount = movs.filter(m => m.servicos_vinculados.length === 0).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fornecedores</h1>
            <p className="text-xs text-slate-500 mt-0.5">Material e serviços de terceiros usados nos condomínios</p>
          </div>
          <Link href="/fornecedores" target="_blank"
            className="text-xs font-bold text-orange-600 dark:text-orange-400 underline decoration-dotted underline-offset-2 whitespace-nowrap">
            Gerenciar cadastro de fornecedores →
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} acoesExtra={
          <button onClick={abrirNova}
            className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all whitespace-nowrap">
            + Nova Saída Fornecedor
          </button>
        } />

        {!loading && semServicoCount > 0 && (
          <button onClick={() => setSoSemServico(s => !s)}
            className={`w-full text-left rounded-2xl p-4 border transition-colors ${
              soSemServico
                ? 'bg-amber-900 border-amber-900 dark:bg-amber-600 dark:border-amber-600'
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20'
            }`}>
            <p className={`text-sm font-bold ${soSemServico ? 'text-white' : 'text-amber-700 dark:text-amber-400'}`}>
              ⚠️ {semServicoCount} saída{semServicoCount > 1 ? 's' : ''} de fornecedor sem serviço vinculado {soSemServico ? '(mostrando só essas — clique pra ver todas)' : '(clique pra filtrar)'}
            </p>
          </button>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <DetalheMovimentacoes movs={movs} cor="text-orange-700 dark:text-orange-400" mostrarFornecedor onAtualizado={carregar} />
        )}
      </div>

      {/* ── Modal Nova Saída Fornecedor ── */}
      {modalNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalNova(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">+ Nova Saída Fornecedor</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data</label>
                  <input type="date" value={nova.data} onChange={e => setNova(p => ({ ...p, data: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
                  <input type="number" step="0.01" min="0" value={nova.valor} onChange={e => setNova(p => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição</label>
                <input type="text" value={nova.descricao} onChange={e => setNova(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Material elétrico"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Fornecedor</label>
                <select value={nova.fornecedor_id} onChange={e => setNova(p => ({ ...p, fornecedor_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                  <option value="">— Nenhum —</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>

              {osReferencia.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button type="button" onClick={() => setOsRefAberto(s => !s)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <span>📋 Referência Auvo ({osReferencia.length}) — marque as OS</span>
                    <span>{osRefAberto ? '▴' : '▾'}</span>
                  </button>
                  {osRefAberto && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                      {osReferencia.map(o => {
                        const marcada = osFornecedorSel.some(s => s.id === o.id);
                        return (
                          <label key={o.id} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={() => toggleOs(o)}
                              className="mt-0.5 w-4 h-4 accent-orange-600"
                            />
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{fmtOsData(o.task_date)}</div>
                              {o.orientation && <div className="text-xs text-slate-500">{o.orientation}</div>}
                              {o.report && <div className="text-xs text-slate-400">{o.report}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Forma de pagamento</label>
                  <select value={nova.forma_pagamento} onChange={e => setNova(p => ({ ...p, forma_pagamento: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Conta bancária (quem pagou)</label>
                  <select value={nova.banco_id} onChange={e => setNova(p => ({ ...p, banco_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                    <option value="">— Nenhuma —</option>
                    {bancos.map(b => <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-4">
                <p className="text-xs text-slate-400">Serviços são opcionais — pode deixar em branco e preencher depois, quando a OS existir.</p>

                {grupos.length > 0 && (
                  <div className="space-y-3">
                    {grupos.map(g => (
                      <div key={g.condominioId} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{g.condominioNome}</h3>
                          <button type="button" onClick={() => removerGrupo(g.condominioId)}
                            className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 font-bold px-1">×</button>
                        </div>
                        <BuscaVinculo<ServicoVinculado>
                          label="Serviços vinculados"
                          placeholder="Buscar por nº OS..."
                          endpoint="/financeiro/servicos-para-vincular"
                          extraParams={{ condominio_id: g.condominioId }}
                          selecionados={g.servicos}
                          onChange={novosServicos => atualizarServicosGrupo(g.condominioId, novosServicos)}
                          renderOpcao={s => `NF ${s.numero_nota ?? 's/n'} · ${s.descricao?.slice(0, 40) ?? ''}`}
                          renderChip={s => s.condominio_nome ?? `Serviço #${s.id}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {adicionarCondAberto ? (
                  <BuscaCondominio
                    value={'' as const}
                    onChange={(id, nome) => {
                      if (id !== '') {
                        if (grupos.some(g => g.condominioId === id)) {
                          alert('Esse condomínio já está na lista.');
                        } else {
                          setGrupos(prev => [...prev, { condominioId: id, condominioNome: nome ?? `Condomínio #${id}`, servicos: [] }]);
                        }
                        setAdicionarCondAberto(false);
                      }
                    }}
                    placeholder="Buscar condomínio (mín. 3 letras)..."
                  />
                ) : (
                  <button type="button" onClick={() => setAdicionarCondAberto(true)}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-dashed border-orange-300 dark:border-orange-500/40 text-sm font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors">
                    + Adicionar Condomínio
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalNova(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvarNova} disabled={salvandoNova}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoNova
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FornecedoresPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <FornecedoresContent />
    </Suspense>
  );
}
