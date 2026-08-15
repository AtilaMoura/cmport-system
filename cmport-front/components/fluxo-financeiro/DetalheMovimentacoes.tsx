"use client"

import { useState, useMemo, useEffect } from 'react';
import { api } from '@/lib/api';
import { fmtValor, fmtData, agruparPorCategoria, agruparPorBanco, type Movimentacao } from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
}

interface Props {
  movs: Movimentacao[];
  cor: string;
  mostrarBancoOrigem?: boolean;
  onAtualizado?: () => void;
}

export function DetalheMovimentacoes({ movs, cor, mostrarBancoOrigem, onAtualizado }: Props) {
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [bancoFiltro, setBancoFiltro] = useState('');
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalMov, setModalMov] = useState<Movimentacao | null>(null);
  const [bancoDestino, setBancoDestino] = useState<number | ''>('');
  const [bancoOrigem, setBancoOrigem] = useState<number | ''>('');
  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    api.get('/configuracoes/bancos')
      .then(({ data }) => setBancos(data.filter((b: { ativo: boolean }) => b.ativo)))
      .catch(() => { /* silencioso */ });
  }, []);

  const porCategoria = useMemo(() => agruparPorCategoria(movs), [movs]);
  const porBanco = useMemo(() => agruparPorBanco(movs), [movs]);

  const abrirDetalhe = (m: Movimentacao) => {
    setModalMov(m);
    setBancoDestino(m.banco_id ?? '');
    setBancoOrigem(m.banco_origem_id ?? '');
  };

  const salvarBancos = async () => {
    if (!modalMov) return;
    setSalvandoBanco(true);
    try {
      await api.put(`/financeiro/movimentacoes/${modalMov.id}`, {
        banco_id: bancoDestino === '' ? null : Number(bancoDestino),
        banco_origem_id: bancoOrigem === '' ? null : Number(bancoOrigem),
      });
      setModalMov(null);
      onAtualizado?.();
    } catch {
      alert('Erro ao salvar o banco. Tenta de novo.');
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
