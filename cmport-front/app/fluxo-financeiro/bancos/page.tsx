"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  fmtValor, type DashboardPorBancoResponse, type DashboardBancoLinha,
  type ImportarInterResponse,
} from '@/lib/fluxoFinanceiro';

// Linha do demonstrativo em cascata (waterfall) de uma conta
function LinhaCascata({ label, valor, sinal, forte }: {
  label: string; valor: number; sinal?: '+' | '−'; forte?: boolean;
}) {
  const cor = sinal === '+' ? 'text-green-700 dark:text-green-400'
    : sinal === '−' ? 'text-red-700 dark:text-red-400'
    : 'text-slate-700 dark:text-slate-300';
  return (
    <div className={`flex justify-between py-1 text-sm ${forte ? 'font-black' : ''}`}>
      <span className="text-slate-600 dark:text-slate-400">{sinal && <span className={cor}>{sinal} </span>}{label}</span>
      <span className={forte ? 'text-slate-900 dark:text-white' : cor}>{fmtValor(valor)}</span>
    </div>
  );
}

// Campo de valor editável inline (saldo inicial / saldo do extrato)
function ValorEditavel({ valor, informado, onSalvar }: {
  valor: number | null; informado: boolean; onSalvar: (v: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus type="number" step="0.01" value={txt} onChange={e => setTxt(e.target.value)}
          className="w-28 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-right" />
        <button disabled={salvando} onClick={async () => {
          setSalvando(true);
          try { await onSalvar(Number(txt.replace(',', '.'))); setEditando(false); }
          finally { setSalvando(false); }
        }} className="text-xs font-bold text-green-700 dark:text-green-400 px-1">OK</button>
        <button onClick={() => setEditando(false)} className="text-xs text-slate-400 px-1">✕</button>
      </span>
    );
  }
  return (
    <button onClick={() => { setTxt(valor != null ? String(valor) : ''); setEditando(true); }}
      className="inline-flex items-center gap-1 hover:underline">
      <span className={informado ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400 italic'}>
        {informado && valor != null ? fmtValor(valor) : 'informar'}
      </span>
      <span className="text-slate-400 text-xs">✎</span>
    </button>
  );
}

function CardBanco({ linha, ano, mes, onMudou }: {
  linha: DashboardBancoLinha; ano: number; mes: number; onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const bancoId = linha.banco_id;
  const editavel = bancoId != null;   // linha "Sem banco identificado" não tem conta pra salvar saldo

  const salvarSaldoInicial = async (v: number) => {
    await api.put(`/financeiro/saldo-inicial-banco/${ano}/${mes}/${bancoId}`, { valor: v });
    onMudou();
  };
  const salvarSaldoExtrato = async (v: number) => {
    await api.put(`/financeiro/extrato-saldo/${ano}/${mes}/${bancoId}`, { saldo_final: v });
    onMudou();
  };

  const difCls = linha.diferenca == null ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
    : linha.bate ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
    : 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{linha.banco_nome}</span>
          {linha.empresa && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              🏢 {linha.empresa}
            </span>
          )}
        </div>
        <button onClick={() => setAberto(a => !a)} className="text-xs font-bold text-blue-700 dark:text-blue-400">
          {aberto ? 'Ocultar detalhe' : 'Ver detalhe'}
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Saldo inicial do mês</span>
          {editavel
            ? <ValorEditavel valor={linha.saldo_inicial} informado={linha.saldo_inicial_informado} onSalvar={salvarSaldoInicial} />
            : <span className="text-slate-400 italic">—</span>}
        </div>
        <LinhaCascata label="Entradas de clientes" valor={linha.entradas_total} sinal="+" />
        {aberto && (
          <div className="pl-4 py-1 text-xs text-slate-500 space-y-0.5">
            <div className="flex justify-between"><span>Boletos</span><span>{fmtValor(linha.entradas.boleto)}</span></div>
            <div className="flex justify-between"><span>Recibos</span><span>{fmtValor(linha.entradas.recibo)}</span></div>
            <div className="flex justify-between"><span>Avulsos / outros recebimentos</span><span>{fmtValor(linha.entradas.avulso)}</span></div>
          </div>
        )}
        {linha.transf_recebidas > 0 && <LinhaCascata label="Transferências recebidas (de conta nossa)" valor={linha.transf_recebidas} sinal="+" />}
        {linha.transf_enviadas > 0 && <LinhaCascata label="Transferências enviadas (p/ conta nossa)" valor={linha.transf_enviadas} sinal="−" />}
        {linha.rendimento !== 0 && <LinhaCascata label="Rendimento" valor={linha.rendimento} sinal="+" />}
        <LinhaCascata label="Saídas" valor={linha.saidas_total} sinal="−" />
        {aberto && (
          <div className="pl-4 py-1 text-xs text-slate-500 space-y-0.5">
            <div className="flex justify-between"><span>Fornecedores</span><span>{fmtValor(linha.saidas.fornecedor)}</span></div>
            <div className="flex justify-between"><span>Despesas gerais</span><span>{fmtValor(linha.saidas.despesa)}</span></div>
            <div className="flex justify-between">
              <span>Funcionário (folha){linha.saidas.funcionario === 0 ? ' — pendente migração' : ''}</span>
              <span>{fmtValor(linha.saidas.funcionario)}</span>
            </div>
            <div className="flex justify-between"><span>Tarifas / juros / IR</span><span>{fmtValor(linha.saidas.tarifa)}</span></div>
          </div>
        )}
        <LinhaCascata label="= Saldo final calculado (sistema)" valor={linha.saldo_calculado ?? 0} forte />
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Saldo final do extrato bancário
            {linha.saldo_extrato_fonte && <span className="ml-1 text-[10px] text-slate-400">({linha.saldo_extrato_fonte})</span>}
          </span>
          {editavel
            ? <ValorEditavel valor={linha.saldo_extrato} informado={linha.saldo_extrato != null} onSalvar={salvarSaldoExtrato} />
            : <span className="text-slate-400 italic">—</span>}
        </div>
      </div>

      <div className={`mt-3 rounded-xl px-3 py-2 text-sm font-black flex justify-between ${difCls}`}>
        <span>Diferença (sistema − extrato)</span>
        <span>{linha.diferenca == null ? '— informe os dois saldos' : fmtValor(linha.diferenca)}</span>
      </div>
      {linha.saldo_inicial == null && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          Sem saldo inicial informado — o saldo calculado não aparece.
        </p>
      )}
    </div>
  );
}

function BancosContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [dados, setDados] = useState<DashboardPorBancoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/financeiro/dashboard/por-banco', { params: { ano, mes } });
      setDados(r.data);
    } catch {
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const importarInter = async () => {
    setImportando(true);
    setMsgImport(null);
    try {
      const r = await api.post<ImportarInterResponse>(`/financeiro/extrato-saldo/${ano}/${mes}/importar-inter`);
      const falhas = r.data.detalhes.filter(d => d.status !== 'ok').map(d => `${d.banco_nome}: ${d.status}`);
      setMsgImport([r.data.mensagem, ...falhas].join(' — '));
      await carregar();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsgImport(`Erro ao importar: ${msg ?? 'falha na API Inter'}`);
    } finally {
      setImportando(false);
    }
  };

  const c = dados?.consolidado;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fluxo Financeiro — Por Banco</h1>
          <p className="text-xs text-slate-500 mt-0.5">Demonstrativo de cada conta: saldo inicial → entradas → saídas → saldo calculado × extrato</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes}
          acoesExtra={
            <button onClick={importarInter} disabled={importando}
              className="px-3 py-2 rounded-xl text-sm font-bold bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 hover:bg-orange-200 disabled:opacity-50">
              {importando ? 'Importando...' : 'Importar saldo da API Inter'}
            </button>
          }
        />

        {msgImport && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300">{msgImport}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : !dados ? (
          <div className="text-center py-12 text-slate-400">Não foi possível carregar o dashboard.</div>
        ) : (
          <>
            {c && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-4">
                  <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase mb-1">Entradas (todas as contas)</div>
                  <div className="text-xl font-black text-green-800 dark:text-green-300">{fmtValor(c.entradas_total)}</div>
                </div>
                <div className="bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 rounded-2xl p-4">
                  <div className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase mb-1">Transferências internas</div>
                  <div className="text-xl font-black text-teal-800 dark:text-teal-300">{fmtValor(c.transf_recebidas)}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
                  <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase mb-1">Saídas (todas as contas)</div>
                  <div className="text-xl font-black text-red-800 dark:text-red-300">{fmtValor(c.saidas_total)}</div>
                </div>
                <div className="bg-slate-900 dark:bg-slate-800 border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs font-bold text-slate-300 uppercase mb-1">Saldo calculado</div>
                  <div className="text-xl font-black text-white">{c.saldo_calculado == null ? '—' : fmtValor(c.saldo_calculado)}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {dados.bancos.map(l => (
                <CardBanco key={l.banco_id ?? 'sem-banco'} linha={l} ano={ano} mes={mes} onMudou={carregar} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BancosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <BancosContent />
    </Suspense>
  );
}
