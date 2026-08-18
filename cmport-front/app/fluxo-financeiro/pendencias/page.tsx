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

function PendenciasContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();
  const [data, setData] = useState<PendenciasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [marcandoPago, setMarcandoPago] = useState<number | null>(null);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalPagamento, setModalPagamento] = useState<PendenciaLinha | null>(null);
  const [pagDataPagamento, setPagDataPagamento] = useState('');
  const [pagValorRecebido, setPagValorRecebido] = useState('');
  const [pagFormaPagamento, setPagFormaPagamento] = useState('PIX');
  const [pagBancoId, setPagBancoId] = useState<number | ''>('');
  const [pagObservacao, setPagObservacao] = useState('');
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);

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

  const linhas = data?.linhas ?? [];
  const q = busca.trim().toLowerCase();
  const filtradas = linhas.filter(l =>
    !q || l.condominio_nome.toLowerCase().includes(q) || l.numero_nota.toLowerCase().includes(q)
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pendências</h1>
          <p className="text-xs text-slate-500 mt-0.5">Boletos e recibos com vencimento no mês escolhido</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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

        {/* Busca client-side */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por condomínio ou nº da nota..."
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
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
                <div key={`${l.origem}-${l.origem_id}`} className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900 dark:text-white truncate">{l.condominio_nome}</span>
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
                    <div className="font-black text-sm text-slate-900 dark:text-white">{fmtValor(l.valor)}</div>
                    {l.situacao !== 'PAGO' && (
                      l.origem === 'RECIBO' ? (
                        <button
                          onClick={() => marcarPago(l.origem_id)}
                          disabled={marcandoPago === l.origem_id}
                          className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {marcandoPago === l.origem_id ? '...' : '✓ Pago'}
                        </button>
                      ) : (
                        <button
                          onClick={() => abrirModalPagamento(l)}
                          className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors"
                        >
                          ✓ Pago
                        </button>
                      )
                    )}
                  </div>
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