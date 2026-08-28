"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  fmtValor, fmtData, TIPO_CLS, FORMAS_PAGAMENTO, FORMA_LABEL,
  type PendenciasResponse, type PendenciaLinha,
} from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
}

const SITUACAO_CLS: Record<string, string> = {
  PARCIAL:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  PAGO:     'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  PENDENTE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  VENCIDO:  'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

const LABEL_SITUACAO: Record<string, string> = {
  PAGO: 'Pago', PENDENTE: 'Pendente', VENCIDO: 'Vencido', PARCIAL: 'Parcial',
};

const SITUACOES = ['VENCIDO', 'PARCIAL', 'PENDENTE', 'PAGO'] as const;
const SITUACAO_CHIP_CLS: Record<string, string> = {
  VENCIDO:  'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  PARCIAL:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  PENDENTE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  PAGO:     'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
};

const TIPOS = ['MANUTENCAO', 'ASSISTENCIA', 'PRODUTO', 'RECIBO'] as const;
const LABEL_TIPO: Record<string, string> = {
  MANUTENCAO: 'Manutenção', ASSISTENCIA: 'Assistência', PRODUTO: 'Produto', RECIBO: 'Recibo',
};

function PendenciasContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();
  const [data, setData] = useState<PendenciasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [situacoesAtivas, setSituacoesAtivas] = useState<Set<string>>(new Set());
  const [tiposAtivos, setTiposAtivos] = useState<Set<string>>(new Set());
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [marcandoPago, setMarcandoPago] = useState<number | null>(null);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalPagamento, setModalPagamento] = useState<PendenciaLinha | null>(null);
  const [pagDataPagamento, setPagDataPagamento] = useState('');
  const [pagValorRecebido, setPagValorRecebido] = useState('');
  const [pagFormaPagamento, setPagFormaPagamento] = useState('PIX');
  const [pagBancoId, setPagBancoId] = useState<number | ''>('');
  const [pagObservacao, setPagObservacao] = useState('');
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);
  // modal de edição do boleto (valor + vencimento) — só boleto não pago
  const [modalEdicao, setModalEdicao] = useState<PendenciaLinha | null>(null);
  const [edValor, setEdValor] = useState('');
  const [edVencimento, setEdVencimento] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/financeiro/pendencias', { params: { ano, mes, cnpj: cnpjFiltro || undefined } });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, cnpjFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.get('/configuracoes/bancos')
      .then(({ data }) => setBancos(data.filter((b: { ativo: boolean }) => b.ativo)))
      .catch(() => {});
  }, []);

  const marcarPago = async (id: number) => {
    setMarcandoPago(id);
    try {
      await api.post(`/recibos/${id}/pagar`, {});
      await carregar();
    } catch {
      alert('Erro ao marcar como pago.');
    } finally {
      setMarcandoPago(null);
    }
  };

  const abrirModalPagamento = (linha: PendenciaLinha) => {
    const hoje = new Date().toISOString().split('T')[0];
    setModalPagamento(linha);
    setPagDataPagamento(hoje);
    const faltaReceber = linha.situacao === 'PARCIAL' && linha.valor_recebido
      ? linha.valor - linha.valor_recebido
      : linha.valor;
    setPagValorRecebido(String(faltaReceber));
    setPagFormaPagamento('PIX');
    setPagBancoId('');
    setPagObservacao('');
  };

  const abrirModalEdicao = (linha: PendenciaLinha) => {
    setModalEdicao(linha);
    setEdValor(String(linha.valor));
    setEdVencimento(linha.data_vencimento.slice(0, 10));
  };

  const confirmarEdicao = async () => {
    if (!modalEdicao) return;
    setSalvandoEdicao(true);
    try {
      await api.patch(`/boletos/${modalEdicao.origem_id}`, {
        valor_nominal: Number(edValor),
        data_vencimento: edVencimento,
      });
      setModalEdicao(null);
      await carregar();
    } catch {
      alert('Erro ao salvar. Boleto que já tem pagamento não pode ser editado.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const confirmarPagamento = async () => {
    if (!modalPagamento) return;
    setRegistrandoPagamento(true);
    try {
      await api.post(`/boletos/${modalPagamento.origem_id}/registrar-pagamento`, {
        data_pagamento: pagDataPagamento,
        valor_recebido: Number(pagValorRecebido),
        forma_pagamento: pagFormaPagamento,
        banco_pagamento: null,
        banco_id: pagBancoId ? Number(pagBancoId) : null,
        observacao: pagObservacao || null,
      });
      setModalPagamento(null);
      await carregar();
    } catch {
      alert('Erro ao registrar pagamento.');
    } finally {
      setRegistrandoPagamento(false);
    }
  };

  const toggleSituacao = (s: string) => {
    setSituacoesAtivas(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleTipo = (t: string) => {
    setTiposAtivos(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const toggleExpandir = (chave: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  };

  const linhas = data?.linhas ?? [];
  const q = busca.trim().toLowerCase();
  const filtradas = linhas.filter(l =>
    (!q || l.condominio_nome.toLowerCase().includes(q) || l.numero_nota.toLowerCase().includes(q)) &&
    (situacoesAtivas.size === 0 || situacoesAtivas.has(l.situacao)) &&
    (tiposAtivos.size === 0 || tiposAtivos.has(l.tipo))
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pendências</h1>
          <p className="text-xs text-slate-500 mt-0.5">Boletos e recibos com vencimento no mês escolhido</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} cnpjFiltro={cnpjFiltro} onAnoChange={setAno} onMesChange={setMes}
          onCnpjChange={setCnpjFiltro} mostrarFiltroCnpj />

        {/* Cards resumo */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{fmtValor(data.total)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">Pago</div>
              <div className="text-2xl font-black text-green-700 dark:text-green-400">{fmtValor(data.total_pago)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Pendente</div>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-400">{fmtValor(data.total_pendente)}</div>
            </div>
          </div>
        )}

        {/* Busca + filtros client-side */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por condomínio ou nº da nota..."
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />

          <div className="flex flex-wrap gap-2">
            {SITUACOES.map(s => (
              <button key={s} onClick={() => toggleSituacao(s)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-opacity ${SITUACAO_CHIP_CLS[s]} ${situacoesAtivas.size > 0 && !situacoesAtivas.has(s) ? 'opacity-40' : ''}`}>
                {LABEL_SITUACAO[s]}
              </button>
            ))}
            <span className="w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            {TIPOS.map(t => (
              <button key={t} onClick={() => toggleTipo(t)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-opacity ${TIPO_CLS[t] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'} ${tiposAtivos.size > 0 && !tiposAtivos.has(t) ? 'opacity-40' : ''}`}>
                {LABEL_TIPO[t]}
              </button>
            ))}
            {(situacoesAtivas.size > 0 || tiposAtivos.size > 0) && (
              <button onClick={() => { setSituacoesAtivas(new Set()); setTiposAtivos(new Set()); }}
                className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                ✕ Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-slate-700 dark:text-white">
                {linhas.length === 0 ? 'Nenhuma pendência nesse mês.' : 'Nenhum resultado para essa busca.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtradas.map(l => (
                <div key={`${l.origem}-${l.origem_id}`}>
                <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => toggleExpandir(`${l.origem}-${l.origem_id}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900 dark:text-white truncate">{l.condominio_nome}</span>
                      {l.empresa && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          l.empresa === 'TEC'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>{l.empresa}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIPO_CLS[l.tipo] ?? ''}`}>{l.tipo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SITUACAO_CLS[l.situacao] ?? ''}`}>
                        {LABEL_SITUACAO[l.situacao] ?? l.situacao}
                      </span>
                      {l.total_parcelas > 1 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                          Parcela {l.numero_parcela}/{l.total_parcelas}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>NF {l.numero_nota}</span>
                      <span>Venc {fmtData(l.data_vencimento)}</span>
                      {l.situacao === 'PAGO' && l.data_pagamento && (
                        <span>· Pago {fmtData(l.data_pagamento)}</span>
                      )}
                      {l.situacao === 'PARCIAL' && l.valor_recebido != null && (
                        <span>· Recebido {fmtValor(l.valor_recebido)} de {fmtValor(l.valor)} · falta {fmtValor(l.valor - l.valor_recebido)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <div className="font-black text-sm text-slate-900 dark:text-white">
                      {fmtValor(l.situacao === 'PARCIAL' ? l.valor_pendente : l.valor)}
                    </div>
                    {l.situacao === 'PARCIAL' && (
                      <div className="text-[10px] text-slate-400 -mt-1.5">falta receber</div>
                    )}
                    {l.situacao !== 'PAGO' && (
                      l.origem === 'RECIBO' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); marcarPago(l.origem_id); }}
                          disabled={marcandoPago === l.origem_id}
                          className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {marcandoPago === l.origem_id ? '...' : '✓ Pago'}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirModalPagamento(l); }}
                          className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors"
                        >
                          ✓ Pago
                        </button>
                      )
                    )}
                  </div>
                </div>
                {expandidos.has(`${l.origem}-${l.origem_id}`) && (
                  <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Tipo</span>{LABEL_TIPO[l.tipo] ?? l.tipo}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Situação</span>{LABEL_SITUACAO[l.situacao] ?? l.situacao}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Origem</span>{l.origem === 'BOLETO' ? 'Boleto' : 'Recibo'} #{l.origem_id}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Nº da nota</span>{l.numero_nota}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Parcela</span>{l.numero_parcela}/{l.total_parcelas}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Vencimento</span>{fmtData(l.data_vencimento)}</div>
                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Valor total</span>{fmtValor(l.valor)}</div>
                    {l.valor_recebido != null && (
                      <div><span className="block text-[10px] uppercase font-bold text-slate-400">Recebido</span>{fmtValor(l.valor_recebido)}</div>
                    )}
                    {l.situacao !== 'PAGO' && (
                      <div><span className="block text-[10px] uppercase font-bold text-slate-400">Falta receber</span>{fmtValor(l.valor_pendente)}</div>
                    )}
                    {l.data_pagamento && (
                      <div><span className="block text-[10px] uppercase font-bold text-slate-400">Pago em</span>{fmtData(l.data_pagamento)}</div>
                    )}
                  </div>

                  {/* Rodapé de ações */}
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
                    {l.origem === 'BOLETO' && l.situacao !== 'PAGO' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirModalEdicao(l); }}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                      >
                        ✎ Editar
                      </button>
                    )}
                    {l.situacao !== 'PAGO' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (l.origem === 'RECIBO') marcarPago(l.origem_id); else abrirModalPagamento(l);
                        }}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700"
                      >
                        ✓ Registrar pagamento
                      </button>
                    )}
                    {l.nota_id && (
                      <a
                        href={`/notas/${l.nota_id}`} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Ver nota ↗
                      </a>
                    )}
                    {l.servico_id && (
                      <a
                        href={`/servicos/${l.servico_id}`} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Ver serviço ↗
                      </a>
                    )}
                  </div>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de registro de pagamento de boleto ── */}
      {modalPagamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalPagamento(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">{modalPagamento.condominio_nome}</h2>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              NF {modalPagamento.numero_nota} · {fmtValor(modalPagamento.valor)}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data de pagamento</label>
                <input type="date" value={pagDataPagamento} onChange={e => setPagDataPagamento(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor recebido</label>
                <input type="number" step="0.01" min="0" value={pagValorRecebido} onChange={e => setPagValorRecebido(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Forma de pagamento</label>
                <select value={pagFormaPagamento} onChange={e => setPagFormaPagamento(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm">
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Banco (opcional)</label>
                <select value={pagBancoId} onChange={e => setPagBancoId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm">
                  <option value="">— Nenhuma —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observação (opcional)</label>
                <input type="text" value={pagObservacao} onChange={e => setPagObservacao(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalPagamento(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={confirmarPagamento} disabled={registrandoPagamento}
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {registrandoPagamento
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de edição de boleto (valor + vencimento) ── */}
      {modalEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalEdicao(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">Editar boleto</h2>
            <p className="text-xs text-slate-500 mb-4 font-mono">{modalEdicao.condominio_nome} · NF {modalEdicao.numero_nota}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
                <input type="number" step="0.01" min="0" value={edValor} onChange={e => setEdValor(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento</label>
                <input type="date" value={edVencimento} onChange={e => setEdVencimento(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalEdicao(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={confirmarEdicao} disabled={salvandoEdicao}
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PendenciasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <PendenciasContent />
    </Suspense>
  );
}