"use client"

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  fmtValor, normalizarPorCnpj,
  type DashboardPorCnpjResponse, type DashboardCnpjLinha,
} from '@/lib/fluxoFinanceiro';

// Linha "+ label ......... valor" / "− label ......... valor"
function Linha({ label, valor, sinal, forte }: {
  label: string; valor: number; sinal?: '+' | '−'; forte?: boolean;
}) {
  const cor = sinal === '+' ? 'text-green-700 dark:text-green-400'
    : sinal === '−' ? 'text-red-700 dark:text-red-400'
    : 'text-slate-700 dark:text-slate-300';
  return (
    <div className={`flex justify-between gap-3 py-0.5 text-sm ${forte ? 'font-black' : ''}`}>
      <span className="text-slate-600 dark:text-slate-400">
        {sinal && <span className={cor}>{sinal} </span>}{label}
      </span>
      <span className={forte ? 'text-slate-900 dark:text-white' : cor}>{fmtValor(valor)}</span>
    </div>
  );
}

function BadgeConferencia({ linha }: { linha: DashboardCnpjLinha }) {
  if (!linha.conferencia_completa) {
    return (
      <div className="mt-3 rounded-xl px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        Conferência incompleta — falta informar saldo (inicial e/ou extrato) de:{' '}
        <span className="font-bold">{linha.contas_sem_saldo.join(', ') || 'contas deste CNPJ'}</span>.
        <span className="block mt-0.5">Informe os saldos na aba <b>Por Banco</b> pra fechar a conferência.</span>
      </div>
    );
  }
  if (linha.bate) {
    return (
      <div className="mt-3 rounded-xl px-3 py-2 text-sm font-black flex justify-between bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300">
        <span>✓ Bate com o extrato</span>
        <span>{fmtValor(linha.diferenca ?? 0)}</span>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl px-3 py-2.5 bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200 border border-red-300 dark:border-red-500/40">
      <div className="flex justify-between text-base font-black">
        <span>⚠️ NÃO BATE COM O EXTRATO</span>
        <span>{fmtValor(linha.diferenca ?? 0)}</span>
      </div>
      <div className="text-xs mt-1 font-medium">
        Saldo calculado {fmtValor(linha.saldo_calculado ?? 0)} × extrato {fmtValor(linha.saldo_extrato ?? 0)}.
        Precisa zerar antes de fechar o mês.
      </div>
    </div>
  );
}

function CardCnpj({ linha, destaque }: { linha: DashboardCnpjLinha; destaque?: boolean }) {
  const e = linha.entradas;
  const s = linha.saidas;
  const saldoPos = linha.saldo_movimento >= 0;
  return (
    <div className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 ${
      destaque ? 'border-slate-300 dark:border-slate-700 ring-1 ring-slate-200 dark:ring-slate-800' : 'border-slate-200 dark:border-slate-800'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
          {linha.empresa ? `🏢 ${linha.empresa}` : linha.razao_social}
        </span>
        {linha.empresa && (
          <span className="text-[11px] text-slate-500 truncate">{linha.razao_social}</span>
        )}
      </div>

      <div className="text-[10px] font-black text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Entradas</div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Linha label="Manutenção" valor={e.manutencao} sinal="+" />
        <Linha label="Assistência" valor={e.assistencia} sinal="+" />
        {e.produto > 0 && <Linha label="Produto" valor={e.produto} sinal="+" />}
        {e.recibos > 0 && <Linha label="Recibos" valor={e.recibos} sinal="+" />}
        <Linha label="Transferência recebida (conta nossa)" valor={e.transf_recebidas} sinal="+" />
        <Linha label="Total entradas" valor={linha.entradas_total} forte />
      </div>

      <div className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-wide mt-4 mb-1">Saídas</div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Linha label="Despesas" valor={s.despesa} sinal="−" />
        <Linha label="Fornecedor" valor={s.fornecedor} sinal="−" />
        <Linha label={`Funcionário (folha)${s.funcionario === 0 ? ' — pendente migração' : ''}`} valor={s.funcionario} sinal="−" />
        <Linha label="Tarifa / juros / IR" valor={s.tarifa} sinal="−" />
        <Linha label="Transferência enviada (conta nossa)" valor={s.transf_enviadas} sinal="−" />
        <Linha label="Total saídas" valor={linha.saidas_total} forte />
      </div>

      <div className={`mt-3 rounded-xl px-3 py-2 flex justify-between text-sm font-black ${
        saldoPos ? 'bg-slate-900 dark:bg-slate-800 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
      }`}>
        <span>Saldo do mês {linha.empresa ? `(${linha.empresa})` : ''}</span>
        <span>{fmtValor(linha.saldo_movimento)}</span>
      </div>

      {linha.empresa && (
        <>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wide mt-4 mb-1">Conferência com o extrato</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Linha label="Saldo inicial (contas do CNPJ)" valor={linha.saldo_inicial ?? 0} />
            <Linha label="= Saldo final calculado (sistema)" valor={linha.saldo_calculado ?? 0} forte />
            <Linha label="Saldo final do extrato" valor={linha.saldo_extrato ?? 0} />
          </div>
          <BadgeConferencia linha={linha} />
        </>
      )}
    </div>
  );
}

export function FechamentoPorCnpj({ ano, mes, cnpjFiltro }: {
  ano: number; mes: number; cnpjFiltro?: string;
}) {
  const [dados, setDados] = useState<DashboardPorCnpjResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(false);
    try {
      const r = await api.get('/financeiro/dashboard/por-cnpj', { params: { ano, mes } });
      setDados(normalizarPorCnpj(r.data));
    } catch {
      setDados(null); setErro(true);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="text-center py-8 text-slate-400 animate-pulse">Carregando fechamento por CNPJ...</div>;
  if (erro || !dados) return <div className="text-center py-8 text-slate-400">Não foi possível carregar o fechamento por CNPJ.</div>;

  const filtroDigits = (cnpjFiltro || '').replace(/\D/g, '');
  const empresas = filtroDigits
    ? dados.empresas.filter(e => (e.cnpj || '').replace(/\D/g, '') === filtroDigits)
    : dados.empresas;
  const mostrarConsolidado = !filtroDigits || empresas.length !== dados.empresas.length;
  const c = dados.consolidado;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Fechamento por CNPJ</h2>
        <p className="text-xs text-slate-500">
          Tudo que entrou e saiu no mês, separado por empresa — <b>incluindo as transferências entre contas próprias</b> (por isso os totais são maiores que o comparativo acima) — e a conferência com o extrato bancário
        </p>
      </div>

      {/* Resumo consolidado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-3">
          <div className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase mb-1">Total Entrada (juntos)</div>
          <div className="text-lg font-black text-green-800 dark:text-green-300">{fmtValor(c.entradas_total)}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-3">
          <div className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase mb-1">Total Saída (juntos)</div>
          <div className="text-lg font-black text-red-800 dark:text-red-300">{fmtValor(c.saidas_total)}</div>
        </div>
        <div className={`rounded-2xl p-3 border ${c.saldo_movimento >= 0 ? 'bg-slate-900 dark:bg-slate-800 border-slate-800' : 'bg-amber-100 dark:bg-amber-900/40 border-amber-300'}`}>
          <div className={`text-[10px] font-bold uppercase mb-1 ${c.saldo_movimento >= 0 ? 'text-slate-300' : 'text-amber-700 dark:text-amber-300'}`}>Saldo do Mês</div>
          <div className={`text-lg font-black ${c.saldo_movimento >= 0 ? 'text-white' : 'text-amber-900 dark:text-amber-200'}`}>{fmtValor(c.saldo_movimento)}</div>
        </div>
        <div className={`rounded-2xl p-3 border ${
          c.diferenca == null ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          : c.bate ? 'bg-green-100 dark:bg-green-500/20 border-green-300'
          : 'bg-red-100 dark:bg-red-500/20 border-red-300'
        }`}>
          <div className={`text-[10px] font-bold uppercase mb-1 ${
            c.diferenca == null ? 'text-slate-500' : c.bate ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
          }`}>
            {c.diferenca == null ? 'Conferência extrato' : c.bate ? 'Bate com o extrato ✓' : 'NÃO bate — diferença'}
          </div>
          <div className={`text-lg font-black ${
            c.diferenca == null ? 'text-slate-500' : c.bate ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
          }`}>
            {c.diferenca == null ? 'incompleta' : fmtValor(c.diferenca)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {empresas.map(e => <CardCnpj key={e.cnpj ?? e.razao_social} linha={e} />)}
        {mostrarConsolidado && <CardCnpj linha={c} destaque />}
      </div>

      {dados.sem_cnpj && (
        <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="text-sm font-black text-slate-700 dark:text-slate-300 mb-1">Sem CNPJ / sem banco identificado</div>
          <p className="text-xs text-slate-500 mb-2">
            Lançamentos sem conta bancária vinculada — não entram na conferência do extrato de nenhum CNPJ. Vincular a conta pra resolver.
          </p>
          <div className="divide-y divide-slate-200 dark:divide-slate-700 max-w-md">
            {dados.sem_cnpj.entradas_total > 0 && <Linha label="Entradas sem banco" valor={dados.sem_cnpj.entradas_total} sinal="+" />}
            <Linha label="Saídas sem banco" valor={dados.sem_cnpj.saidas_total} sinal="−" />
          </div>
        </div>
      )}
    </div>
  );
}
