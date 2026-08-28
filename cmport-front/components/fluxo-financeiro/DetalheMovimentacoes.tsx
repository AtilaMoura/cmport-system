"use client"

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { fmtValor, fmtData, agruparPorCategoria, type Movimentacao, type ServicoVinculado, type OsFornecedorReferencia, FORMAS_PAGAMENTO, FORMA_LABEL } from '@/lib/fluxoFinanceiro';
import { BuscaVinculo } from './BuscaVinculo';
import { BuscaCondominio } from './BuscaCondominio';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
  cnpj_titular?: string | null;
}

// CNPJ (só dígitos) -> empresa titular da conta
const EMPRESA_POR_CNPJ: Record<string, string> = {
  '22761557000188': 'CMPORT',
  '65756913000188': 'TEC',
};

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
  breakdownExtra?: ReactNode;
}

export function DetalheMovimentacoes({ movs, cor, mostrarBancoOrigem, mostrarFornecedor, onAtualizado, breakdownExtra }: Props) {
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [bancoIdFiltro, setBancoIdFiltro] = useState<number | ''>('');  // conta específica (origem OU destino)
  const [empresaFiltro, setEmpresaFiltro] = useState('');   // '' | 'CMPORT' | 'TEC'
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
  const [novoFornecedorAberto, setNovoFornecedorAberto] = useState(false);
  const [novoFornecedorNome, setNovoFornecedorNome] = useState('');
  const [novoFornecedorCnpj, setNovoFornecedorCnpj] = useState('');
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);

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

  const bancoPorId = useMemo(() => {
    const map = new Map<number, BancoOpcao>();
    bancos.forEach(b => map.set(b.id, b));
    return map;
  }, [bancos]);

  // empresa curta (CMPORT/TEC) de um banco pelo id
  const empresaDeBanco = useMemo(() => (bancoId: number | null): string | null => {
    if (bancoId == null) return null;
    const b = bancoPorId.get(bancoId);
    if (!b) return null;
    const dig = (b.cnpj_titular ?? '').replace(/\D/g, '');
    return EMPRESA_POR_CNPJ[dig] ?? b.razao_social_titular ?? null;
  }, [bancoPorId]);

  // rótulo completo "Inter (CMPORT)" / "Inter (CMPORT TEC)"
  const bancoLabel = useMemo(() => (bancoId: number | null, nomeFallback: string | null): string => {
    const b = bancoId != null ? bancoPorId.get(bancoId) : null;
    if (b) return b.razao_social_titular ? `${b.nome} (${b.razao_social_titular})` : b.nome;
    return nomeFallback ?? '?';
  }, [bancoPorId]);

  // resumo por CONTA (banco+empresa): quanto SAIU (conta = origem) e quanto ENTROU (conta = destino)
  const porConta = useMemo(() => {
    const acc = new Map<number, { label: string; saiu: number; entrou: number; itens: number }>();
    const get = (id: number, nome: string | null) => {
      let g = acc.get(id);
      if (!g) { g = { label: bancoLabel(id, nome), saiu: 0, entrou: 0, itens: 0 }; acc.set(id, g); }
      return g;
    };
    for (const m of movs) {
      if (m.banco_origem_id != null) { const g = get(m.banco_origem_id, m.banco_origem_nome); g.saiu += m.valor; g.itens += 1; }
      if (m.banco_id != null && m.banco_id !== m.banco_origem_id) { const g = get(m.banco_id, m.banco_nome); g.entrou += m.valor; g.itens += 1; }
    }
    return [...acc.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => (b.saiu + b.entrou) - (a.saiu + a.entrou));
  }, [movs, bancoLabel]);

  // empresa da mov = a de ORIGEM (de onde o dinheiro saiu); cai pro destino se não houver origem
  const empresaOrigem = useMemo(
    () => (m: Movimentacao): string | null => empresaDeBanco(m.banco_origem_id) ?? empresaDeBanco(m.banco_id),
    [empresaDeBanco],
  );

  // todas as empresas que a mov toca (origem e/ou destino) — pro chip informativo da linha
  const empresasDaMov = useMemo(() => (m: Movimentacao): string[] => {
    const e = new Set<string>();
    const eo = empresaDeBanco(m.banco_origem_id);
    const ed = empresaDeBanco(m.banco_id);
    if (eo) e.add(eo);
    if (ed) e.add(ed);
    return [...e];
  }, [empresaDeBanco]);

  // resumo por empresa de ORIGEM
  const porEmpresa = useMemo(() => {
    const acc: Record<string, { total: number; itens: number }> = {};
    for (const m of movs) {
      const emp = empresaOrigem(m);
      if (!emp) continue;
      acc[emp] = acc[emp] || { total: 0, itens: 0 };
      acc[emp].total += m.valor;
      acc[emp].itens += 1;
    }
    return Object.entries(acc).sort((a, b) => b[1].total - a[1].total);
  }, [movs, empresaOrigem]);

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

  const criarFornecedorInline = async () => {
    if (!novoFornecedorNome.trim()) { alert('Preencha o nome do fornecedor.'); return; }
    setCriandoFornecedor(true);
    try {
      const { data } = await api.post('/condominios', {
        nome: novoFornecedorNome.trim(),
        cnpj: novoFornecedorCnpj.trim() || null,
        tipo: 'FORNECEDOR',
        ativo: true,
      });
      setFornecedores(prev => [...prev, { id: data.id, nome: data.nome }]);
      setFornecedorSel(data.id);
      setNovoFornecedorAberto(false);
      setNovoFornecedorNome('');
      setNovoFornecedorCnpj('');
    } catch {
      alert('Erro ao cadastrar fornecedor.');
    } finally {
      setCriandoFornecedor(false);
    }
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
    if (bancoIdFiltro !== '' && m.banco_id !== bancoIdFiltro && m.banco_origem_id !== bancoIdFiltro) return false;
    if (empresaFiltro && empresaOrigem(m) !== empresaFiltro) return false;
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
          <select value={bancoIdFiltro} onChange={e => setBancoIdFiltro(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            <option value="">Todas as contas</option>
            {porConta.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">De onde saiu</span>
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {['', 'CMPORT', 'TEC'].map(emp => (
                <button key={emp || 'todas'} type="button"
                  onClick={() => setEmpresaFiltro(emp)}
                  className={`px-3 py-2 text-sm font-bold transition-colors ${
                    empresaFiltro === emp
                      ? 'bg-teal-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  } ${emp ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}>
                  {emp || 'Todas'}
                </button>
              ))}
            </div>
          </div>
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

      {breakdownExtra}

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

      {/* Breakdown por conta (banco + empresa) — quanto saiu (origem) e quanto entrou (destino) */}
      <div className="flex flex-wrap gap-2">
        {porConta.map(g => (
          <button key={g.id} onClick={() => setBancoIdFiltro(bancoIdFiltro === g.id ? '' : g.id)}
            className={`px-3 py-1.5 rounded-lg text-xs text-left transition-colors ${
              bancoIdFiltro === g.id
                ? 'bg-teal-900 text-white dark:bg-teal-600'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            <div className="font-semibold">💳 {g.label}</div>
            <div className="flex gap-3 opacity-90">
              {g.saiu > 0 && <span>↑ saiu <span className="font-black">{fmtValor(g.saiu)}</span></span>}
              {g.entrou > 0 && <span>↓ entrou <span className="font-black">{fmtValor(g.entrou)}</span></span>}
            </div>
          </button>
        ))}
      </div>

      {/* Breakdown por empresa de ORIGEM (de onde o dinheiro saiu) */}
      {porEmpresa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porEmpresa.map(([emp, g]) => (
            <button key={emp} onClick={() => setEmpresaFiltro(empresaFiltro === emp ? '' : emp)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                empresaFiltro === emp
                  ? 'bg-slate-900 text-white dark:bg-slate-600'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}>
              <span className="font-semibold">🏢 Saiu de {emp}</span>{' '}
              <span className="font-black">{fmtValor(g.total)}</span>
              <span className="opacity-70"> ({g.itens})</span>
            </button>
          ))}
        </div>
      )}

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
                      {empresasDaMov(m).map(emp => (
                        <span key={emp} className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          emp === 'TEC'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>🏢 {emp}</span>
                      ))}
                      {(m.banco_origem_id != null || m.banco_origem_nome) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {bancoLabel(m.banco_origem_id, m.banco_origem_nome)} → {bancoLabel(m.banco_id, m.banco_nome)}
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
          <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${mostrarFornecedor ? 'max-w-3xl' : 'max-w-md'} p-6 overflow-y-auto max-h-[90vh]`} onClick={e => e.stopPropagation()}>
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
              {!mostrarFornecedor && (
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
              )}

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
                    <button type="button" onClick={() => setNovoFornecedorAberto(s => !s)}
                      className="mt-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 underline decoration-dotted underline-offset-2">
                      + Cadastrar novo fornecedor
                    </button>

                    {novoFornecedorAberto && (
                      <div className="mt-3 border-2 border-dashed border-orange-300 dark:border-orange-500/40 rounded-xl p-3 space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nome (obrigatório)</label>
                          <input type="text" autoFocus value={novoFornecedorNome} onChange={e => setNovoFornecedorNome(e.target.value)}
                            placeholder='Ex: Center G'
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">CNPJ (opcional)</label>
                          <input type="text" value={novoFornecedorCnpj} onChange={e => setNovoFornecedorCnpj(e.target.value)}
                            placeholder="12.345.678/0001-90"
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setNovoFornecedorAberto(false); setNovoFornecedorNome(''); setNovoFornecedorCnpj(''); }}
                            className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                            Cancelar
                          </button>
                          <button type="button" onClick={criarFornecedorInline} disabled={criandoFornecedor || !novoFornecedorNome.trim()}
                            className="flex-1 py-2 bg-orange-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {criandoFornecedor
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                              : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    )}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-700">
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
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Conta bancária (quem pagou)</label>
                      <select
                        value={bancoDestino}
                        onChange={e => setBancoDestino(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                      >
                        <option value="">— Nenhuma —</option>
                        {bancos.map(b => (
                          <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
