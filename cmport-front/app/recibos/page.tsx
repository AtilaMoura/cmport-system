"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const STATUS_CLS: Record<string, string> = {
  PENDENTE:  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  PAGO:      'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

interface Recibo {
  id: number;
  numero_recibo: string;
  cliente_id: number | null;
  condominio_id: number | null;
  cliente_nome_avulso: string | null;
  cliente: { nome: string; apartamento: string | null } | null;
  descricao_servico: string;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
}

export default function RecibosPage() {
  const now = new Date();
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(0); // 0 = todos
  const [statusFiltro, setStatusFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [marcandoPago, setMarcandoPago] = useState<number | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { ano };
      if (mes > 0) params.mes = mes;
      if (statusFiltro) params.status = statusFiltro;
      const r = await api.get('/recibos', { params });
      setRecibos(r.data);
    } catch { setRecibos([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, [ano, mes, statusFiltro]);

  const marcarPago = async (id: number) => {
    setMarcandoPago(id);
    try {
      await api.post(`/recibos/${id}/pagar`, {});
      await carregar();
    } catch { alert('Erro ao marcar como pago.'); }
    finally { setMarcandoPago(null); }
  };

  const filtrados = recibos.filter(r => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    const nome = r.cliente?.nome || r.cliente_nome_avulso || '';
    return nome.toLowerCase().includes(q) || r.numero_recibo.toLowerCase().includes(q) || r.descricao_servico.toLowerCase().includes(q);
  });

  const totalPago = filtrados.filter(r => r.status === 'PAGO').reduce((s, r) => s + r.valor, 0);
  const totalPendente = filtrados.filter(r => r.status === 'PENDENTE').reduce((s, r) => s + r.valor, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recibos</h1>
              <p className="text-xs text-slate-500 mt-0.5">Serviços prestados a moradores</p>
            </div>
            <Link href="/recibos/novo"
              className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors">
              + Novo Recibo
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Cards resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total registros</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{filtrados.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">Pago</div>
            <div className="text-2xl font-black text-green-700 dark:text-green-400">{fmtValor(totalPago)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Pendente</div>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-400">{fmtValor(totalPendente)}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex flex-wrap gap-3">
            <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} min={2020} max={2099}
              className="w-24 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              <option value={0}>Todos os meses</option>
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, número..."
              className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>
        </div>

        {/* Lista */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🧾</div>
              <p className="font-semibold text-slate-700 dark:text-white">Nenhum recibo encontrado</p>
              <p className="text-sm text-slate-500 mt-1">Ajuste os filtros ou crie um novo recibo.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map(r => {
                const nome = r.cliente?.nome || r.cliente_nome_avulso || '—';
                const apto = r.cliente?.apartamento;
                return (
                  <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-slate-900 dark:text-white font-mono">{r.numero_recibo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[r.status] ?? ''}`}>{r.status}</span>
                      </div>
                      <div className="text-sm font-semibold text-violet-700 dark:text-violet-400 mt-0.5 truncate">
                        {nome}{apto ? ` · Apto ${apto}` : ''}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{r.descricao_servico}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Emissão: {fmtData(r.data_emissao)}
                        {r.data_vencimento && ` · Venc: ${fmtData(r.data_vencimento)}`}
                        {r.data_pagamento && ` · Pago: ${fmtData(r.data_pagamento)}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div className="font-black text-base text-slate-900 dark:text-white">{fmtValor(r.valor)}</div>
                      {r.status === 'PENDENTE' && (
                        <button
                          onClick={() => marcarPago(r.id)}
                          disabled={marcandoPago === r.id}
                          className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {marcandoPago === r.id ? '...' : '✓ Pago'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
