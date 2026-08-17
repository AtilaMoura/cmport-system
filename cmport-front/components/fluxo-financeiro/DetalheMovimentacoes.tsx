"use client"

import { useState, useMemo, useEffect } from 'react';
import { api } from '@/lib/api';
import { fmtValor, fmtData, agruparPorCategoria, agruparPorBanco, type Movimentacao, type ServicoVinculado, type OsFornecedorReferencia, FORMAS_PAGAMENTO, FORMA_LABEL } from '@/lib/fluxoFinanceiro';
import { BuscaVinculo } from './BuscaVinculo';
import { BuscaCondominio } from './BuscaCondominio';

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

interface Props {
  movs: Movimentacao[];
  cor: string;
  mostrarBancoOrigem?: boolean;
  mostrarFornecedor?: boolean;
  onAtualizado?: () => void;
}

export function DetalheMovimentacoes({ movs, cor, mostrarBancoOrigem, mostrarFornecedor, onAtualizado }: Props) {
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [bancoFiltro, setBancoFiltro] = useState('');
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorOpcao[]>([]);
  const [modalMov, setModalMov] = useState<Movimentacao | null>(null);
  const [bancoDestino, setBancoDestino] = useState<number | ''>('');
  const [bancoOrigem, setBancoOrigem] = useState<number | ''>('');
  const [fornecedorSel, setFornecedorSel] = useState<number | ''>('');
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [servicosExistentes, setServicosExistentes] = useState<ServicoVinculado[]>([]);
  const [osFornecedorSel, setOsFornecedorSel] = useState<OsFornecedorReferencia[]>([]);
  const [osReferencia, setOsReferencia] = useState<OsFornecedorReferencia[]>([]);
  const [osRefAberto, setOsRefAberto] = useState(false);
  const [grupos, setGrupos] = useState<GrupoCondominio[]>([]);
  const [adicionarCondAberto, setAdicionarCondAberto] = useState(false);
  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    api.get('/configuracoes/bancos')
      .then(({ data }) => setBancos(data.filter((b: { ativo: boolean }) => b.ativo)))
      .catch(() => { /* silencioso */ });
    if (mostrarFornecedor) {
      api.get('/condominios', { params: { tipo: 'FORNECEDOR', ativo: true, limit: 700 } })
        .then(({ data }) => setFornecedores(data))
        .catch(() => { /* silencioso */ });
    }
  }, [mostrarFornecedor]);

  const porCategoria = useMemo(() => agruparPorCategoria(movs), [movs]);
  const porBanco = useMemo(() => agruparPorBanco(movs), [movs]);

  const abrirDetalhe = (m: Movimentacao) => {
    setModalMov(m);
    setBancoDestino(m.banco_id ?? '');
    setBancoOrigem(m.banco_origem_id ?? '');
    setFornecedorSel(m.fornecedor_id ?? '');
    setFormaPagamento(m.forma_pagamento ?? 'PIX');
    setServicosExistentes(m.servicos_vinculados ?? []);
    setOsFornecedorSel(m.os_fornecedor_vinculadas ?? []);
    setOsReferencia([]);
    setOsRefAberto(false);
    setGrupos([]);
    setAdicionarCondAberto(false);
  };

  useEffect(() => {
    if (!mostrarFornecedor) return;
    if (!fornecedorSel) {
      setOsReferencia([]);
      setOsRefAberto(false);
      return;
    }
    api.get('/financeiro/os-fornecedor-referencia', { params: { fornecedor_id: fornecedorSel } })
      .then(({ data }) => {
        setOsReferencia(data);
        setOsRefAberto(true);
      })
      .catch(() => { setOsReferencia([]); setOsRefAberto(false); });
  }, [fornecedorSel, mostrarFornecedor]);

  const fmtOsData = (d?: string | null) => {
    if (!d) return '—';
    return d.slice(0, 10).split('-').reverse().join('/');
  };

  const toggleOs = (o: OsFornecedorReferencia) => {
    setOsFornecedorSel(prev =>
      prev.some(s => s.id === o.id)
        ? prev.filter(s => s.id !== o.id)
        : [...prev, o]
    );
  };

  const removerServicoExistente = (id: number) => {
    setServicosExistentes(prev => prev.filter(s => s.id !== id));
  };

  const removerGrupo = (condominioId: number) => {
    setGrupos(prev => prev.filter(g => g.condominioId !== condominioId));
  };

  const atualizarServicosGrupo = (condominioId: number, novosServicos: ServicoVinculado[]) => {
    setGrupos(prev => prev.map(g => g.condominioId === condominioId ? { ...g, servicos: novosServicos } : g));
  };

  const salvarBancos = async () => {
    if (!modalMov) return;
    setSalvandoBanco(true);
    try {
      await api.put(`/financeiro/movimentacoes/${modalMov.id}`, {
        banco_id: bancoDestino === '' ? null : Number(bancoDestino),
        banco_origem_id: bancoOrigem === '' ? null : Number(bancoOrigem),
        ...(mostrarFornecedor ? {
          fornecedor_id: fornecedorSel === '' ? null : Number(fornecedorSel),
          forma_pagamento: formaPagamento || null,
          servico_ids: [...servicosExistentes.map(s => s.id), ...grupos.flatMap(g => g.servicos.map(s => s.id))],
          os_fornecedor_ids: osFornecedorSel.map(o => o.id),
        } : {}),
      });
      setModalMov(null);
      onAtualizado?.();
    } catch {
      alert('Erro ao salvar. Tenta de novo.');
    } finally {
      setSalvandoBanco(false);
    }
  };

  const excluirMovimentacao = async () => {
    if (!modalMov) return;
    if (!confirm(`Excluir "${modalMov.descricao}" (${fmtValor(modalMov.valor)})? Essa ação pode ser desfeita só pela auditoria de exclusões.`)) return;
    setExcluindo(true);
    try {
      await api.delete(`/financeiro/movimentacoes/${modalMov.id}`);
      setModalMov(null);
      onAtualizado?.();
    } catch {
      alert('Erro ao excluir. Tenta de novo.');
    } finally {
      setExcluindo(false);
    }
  };

  const filtradas = movs.filter(m => {
    if (busca && !m.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    if (categoriaFiltro && (m.categoria?.nome ?? 'Sem categoria') !== categoriaFiltro) return false;
    if (bancoFiltro && (m.banco_nome ?? 'Sem banco') !== bancoFiltro) return false;
    return true;
  });
  const total = filtradas.reduce((s, m) => s + m.valor, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição..."
            className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            <option value="">Todas as categorias</option>
            {porCategoria.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
          </select>
          <select value={bancoFiltro} onChange={e => setBancoFiltro(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            <option value="">Todos os bancos</option>
            {porBanco.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total filtrado</div>
          <div className={`text-2xl font-black ${cor}`}>{fmtValor(total)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Lançamentos</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{filtradas.length}</div>
        </div>
      </div>

      {/* Breakdown por categoria */}
      <div className="flex flex-wrap gap-2">
        {porCategoria.map(g => (
          <button key={g.nome} onClick={() => setCategoriaFiltro(categoriaFiltro === g.nome ? '' : g.nome)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              categoriaFiltro === g.nome
                ? 'bg-blue-900 text-white dark:bg-blue-500'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            <span className="font-semibold">{g.nome}</span>{' '}
            <span className="font-black">{fmtValor(g.total)}</span>
            <span className="opacity-70"> ({g.itens.length})</span>
          </button>
        ))}
      </div>

      {/* Breakdown por banco */}
      <div className="flex flex-wrap gap-2">
        {porBanco.map(g => (
          <button key={g.nome} onClick={() => setBancoFiltro(bancoFiltro === g.nome ? '' : g.nome)}
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

      {/* Lista detalhada */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">Nenhum lançamento encontrado.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtradas
              .slice()
              .sort((a, b) => a.data < b.data ? 1 : -1)
              .map(m => (
                <div key={m.id} onClick={() => abrirDetalhe(m)}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{m.descricao}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{m.categoria?.nome ?? 'Sem categoria'}</span>
                      {m.banco_origem_nome && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {m.banco_origem_nome} → {m.banco_nome ?? '?'}
                        </span>
                      )}
                      {!m.banco_origem_nome && m.banco_nome && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400">💳 {m.banco_nome}</span>
                      )}
                      {mostrarFornecedor && m.fornecedor_nome && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">🏭 {m.fornecedor_nome}</span>
                      )}
                      {mostrarFornecedor && m.servicos_vinculados.length === 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">⚠️ sem serviço</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-black text-sm ${cor}`}>{fmtValor(m.valor)}</div>
                    <div className="text-xs text-slate-400">{fmtData(m.data)}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Modal de detalhe / banco ── */}
      {modalMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalMov(null)}>
          <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${mostrarFornecedor ? 'max-w-2xl' : 'max-w-md'} p-6 overflow-y-auto max-h-[90vh]`} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">{modalMov.descricao}</h2>
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-4 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {modalMov.categoria?.nome ?? 'Sem categoria'}
            </span>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Valor</span>
                <span className={`font-black ${cor}`}>{fmtValor(modalMov.valor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data</span>
                <span className="font-semibold text-slate-900 dark:text-white">{fmtData(modalMov.data)}</span>
              </div>
              {modalMov.observacao && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">Observação</span>
                  <span className="text-slate-700 dark:text-slate-300 text-right">{modalMov.observacao}</span>
                </div>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
              {mostrarBancoOrigem && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">De onde saiu (origem)</label>
                  <select
                    value={bancoOrigem}
                    onChange={e => setBancoOrigem(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                  >
                    <option value="">— Nenhuma —</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{mostrarBancoOrigem ? 'Pra onde foi (destino)' : 'Conta bancária'}</label>
                <select
                  value={bancoDestino}
                  onChange={e => setBancoDestino(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                >
                  <option value="">— Nenhuma —</option>
                  {bancos.map(b => (
                    <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>
                  ))}
                </select>
              </div>

              {mostrarFornecedor && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Fornecedor</label>
                    <select
                      value={fornecedorSel}
                      onChange={e => setFornecedorSel(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                    >
                      <option value="">— Nenhum —</option>
                      {fornecedores.map(f => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Forma de pagamento</label>
                    <select
                      value={formaPagamento}
                      onChange={e => setFormaPagamento(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                    >
                      {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
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
                  {servicosExistentes.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Serviços já vinculados</label>
                      <div className="flex flex-wrap gap-1.5">
                        {servicosExistentes.map(s => (
                          <span key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
                            {s.condominio_nome ?? `Serviço #${s.id}`} · NF {s.numero_nota ?? 's/n'}
                            <button type="button" onClick={() => removerServicoExistente(s.id)} className="hover:text-red-600 dark:hover:text-red-400 font-bold">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
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
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={excluirMovimentacao} disabled={excluindo}
                className="px-4 py-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl font-bold text-sm hover:brightness-95 transition-all disabled:opacity-50">
                {excluindo ? '...' : '🗑️'}
              </button>
              <button onClick={() => setModalMov(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvarBancos} disabled={salvandoBanco}
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
  );
}
