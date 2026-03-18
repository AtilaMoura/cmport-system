"use client"

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface LimparResult {
  boletos_deletados: number;
  servicos_deletados: number;
  notas_deletadas: number;
  mensagem: string;
}

interface SyncResult {
  novos: number;
  atualizados: number;
  erros: number;
  mensagem: string;
  detalhes_erros?: { cliente: string; erro: string }[];
}

interface SeedResponse {
  condominio_id: number;
  condominio_nome: string;
  condominio_cnpj: string;
  nota_id?: number;
  nota_numero?: string;
  nota_valor?: number;
  boleto_codigo?: string;
  mensagem: string;
}

interface GerarBoletoResult {
  criados: number;
  erros: string[];
}

export default function DevPage() {
  // Limpar dados
  const [limpando, setLimpando] = useState(false);
  const [limparResult, setLimparResult] = useState<LimparResult | null>(null);
  const [limparError, setLimparError] = useState<string | null>(null);

  // Sync condominios
  const [sincronizando, setSincronizando] = useState(false);
  const [syncProgresso, setSyncProgresso] = useState<{ processados: number; total: number; mensagem: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Revalidar XMLs
  const [revalidando, setRevalidando] = useState(false);
  const [revalidarResult, setRevalidarResult] = useState<{ total: number; alteradas: number; erros: number; mensagem: string } | null>(null);
  const [revalidarError, setRevalidarError] = useState<string | null>(null);

  // Seed
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResponse | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [gerandoBoleto, setGerandoBoleto] = useState(false);
  const [boletoResult, setBoletoResult] = useState<GerarBoletoResult | null>(null);
  const [boletoError, setBoletoError] = useState<string | null>(null);

  const handleLimpar = async () => {
    setLimpando(true);
    setLimparResult(null);
    setLimparError(null);
    try {
      const res = await api.post('/dev/limpar-dados');
      setLimparResult(res.data);
      setSeedResult(null);
      setBoletoResult(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao limpar dados.';
      setLimparError(String(msg));
    } finally {
      setLimpando(false);
    }
  };

  const handleSync = async () => {
    setSincronizando(true);
    setSyncResult(null);
    setSyncError(null);
    setSyncProgresso(null);
    try {
      await api.post('/dev/sync-condominios/iniciar');

      const poll = setInterval(async () => {
        try {
          const res = await api.get('/dev/sync-condominios/progresso');
          const estado = res.data;
          setSyncProgresso({ processados: estado.processados, total: estado.total, mensagem: estado.mensagem });

          if (estado.concluido) {
            clearInterval(poll);
            setSincronizando(false);
            setSyncProgresso(null);
            setSyncResult({
              novos: estado.novos,
              atualizados: estado.atualizados,
              erros: estado.erros,
              mensagem: estado.mensagem,
            });
          }
        } catch {
          clearInterval(poll);
          setSincronizando(false);
          setSyncError('Erro ao consultar progresso.');
        }
      }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao sincronizar condominios.';
      setSyncError(String(msg));
      setSincronizando(false);
    }
  };

  const handleRevalidar = async () => {
    setRevalidando(true);
    setRevalidarResult(null);
    setRevalidarError(null);
    try {
      const res = await api.post('/notas-fiscais/revalidar-todas');
      setRevalidarResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao revalidar XMLs.';
      setRevalidarError(String(msg));
    } finally {
      setRevalidando(false);
    }
  };

  const handleSeed = async () => {
    setSeedLoading(true);
    setSeedResult(null);
    setSeedError(null);
    setBoletoResult(null);
    try {
      const res = await api.post('/dev/seed?gerar_nota=true&gerar_boleto=false');
      setSeedResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao criar dados de teste.';
      setSeedError(String(msg));
    } finally {
      setSeedLoading(false);
    }
  };

  const handleGerarBoleto = async () => {
    if (!seedResult?.nota_id) return;
    setGerandoBoleto(true);
    setBoletoResult(null);
    setBoletoError(null);
    try {
      const res = await api.post('/boletos/gerar', { nota_ids: [seedResult.nota_id] });
      setBoletoResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao gerar boleto.';
      setBoletoError(String(msg));
    } finally {
      setGerandoBoleto(false);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/" className="text-slate-400 hover:text-indigo-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-2 h-8 bg-yellow-500 rounded-full" />
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Dev / Ferramentas</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm ml-12">
            Utilitários para desenvolvimento. Disponível apenas em <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">ENV=development</code>.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">

        {/* ── Limpar Dados ── */}
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                🗑️
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Limpar Dados</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Apaga todos os <strong>boletos</strong>, <strong>serviços</strong> e <strong>notas fiscais</strong>.
                  Condominios são mantidos.
                </p>
              </div>
            </div>
            <button
              onClick={handleLimpar}
              disabled={limpando}
              className="shrink-0 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {limpando
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Limpando...</>
                : 'Limpar Dados'
              }
            </button>
          </div>

          {limparError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{limparError}</p>
            </div>
          )}

          {limparResult && (
            <div className="mt-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4">
              <p className="text-xs font-black text-green-700 dark:text-green-400 uppercase mb-3">Limpeza concluída</p>
              <div className="flex gap-4">
                {[
                  { label: 'Boletos', value: limparResult.boletos_deletados },
                  { label: 'Serviços', value: limparResult.servicos_deletados },
                  { label: 'Notas', value: limparResult.notas_deletadas },
                ].map(item => (
                  <div key={item.label} className="bg-white dark:bg-slate-800 rounded-lg px-4 py-3 text-center">
                    <p className="text-2xl font-black text-red-600 dark:text-red-400">{item.value}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sincronizar Condominios ── */}
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                🔄
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Sincronizar Condominios</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Puxa todos os clientes do Auvo (com paginação automática) e cria/atualiza os condominios no banco.
                </p>
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={sincronizando}
              className="shrink-0 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {sincronizando
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                : 'Sincronizar Condominios'
              }
            </button>
          </div>

          {sincronizando && (
            <div className="mt-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800/30 rounded-xl p-3">
              {syncProgresso && syncProgresso.total > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">Sincronizando...</p>
                    <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400">
                      {syncProgresso.processados} / {syncProgresso.total}
                    </p>
                  </div>
                  <div className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((syncProgresso.processados / syncProgresso.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">{syncProgresso.mensagem}</p>
                </>
              ) : (
                <p className="text-sm text-indigo-700 dark:text-indigo-400 animate-pulse">
                  Conectando ao Auvo e buscando clientes...
                </p>
              )}
            </div>
          )}

          {syncError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{syncError}</p>
            </div>
          )}

          {syncResult && (
            <div className="mt-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4">
              <p className="text-xs font-black text-green-700 dark:text-green-400 uppercase mb-3">Sync concluído</p>
              <div className="flex gap-4 mb-3">
                {[
                  { label: 'Novos', value: syncResult.novos, color: 'text-green-600 dark:text-green-400' },
                  { label: 'Atualizados', value: syncResult.atualizados, color: 'text-indigo-600 dark:text-indigo-400' },
                  { label: 'Erros', value: syncResult.erros, color: 'text-red-600 dark:text-red-400' },
                ].map(item => (
                  <div key={item.label} className="bg-white dark:bg-slate-800 rounded-lg px-4 py-3 text-center">
                    <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase">{item.label}</p>
                  </div>
                ))}
              </div>
              {syncResult.detalhes_erros && syncResult.detalhes_erros.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">Primeiros erros:</p>
                  <ul className="space-y-1">
                    {syncResult.detalhes_erros.slice(0, 5).map((e, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/10 rounded px-2 py-1">
                        <strong>{e.cliente}</strong>: {e.erro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Revalidar XMLs ── */}
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                🔍
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Revalidar Status das Notas</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Re-parseia o XML original de cada nota e corrige status incorretos (DESCONHECIDO → AUTORIZADA/CANCELADA).
                </p>
              </div>
            </div>
            <button
              onClick={handleRevalidar}
              disabled={revalidando}
              className="shrink-0 px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {revalidando
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Revalidando...</>
                : 'Revalidar XMLs'
              }
            </button>
          </div>

          {revalidarError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{revalidarError}</p>
            </div>
          )}

          {revalidarResult && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/30 rounded-xl p-4">
              <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase mb-3">Revalidação concluída</p>
              <div className="flex gap-4">
                {[
                  { label: 'Verificadas', value: revalidarResult.total, color: 'text-slate-700 dark:text-slate-300' },
                  { label: 'Alteradas', value: revalidarResult.alteradas, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Erros', value: revalidarResult.erros, color: 'text-red-600 dark:text-red-400' },
                ].map(item => (
                  <div key={item.label} className="bg-white dark:bg-slate-800 rounded-lg px-4 py-3 text-center">
                    <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Seed de Teste ── */}
        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
              🌱
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Seed de Teste</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cria condomínio + nota de teste para validar o fluxo de boletos.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Etapa 1 */}
            <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Criar condomínio + nota teste</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">POST /dev/seed · R$ 100,00 · venc. +5 dias</p>
              </div>
              <button
                onClick={handleSeed}
                disabled={seedLoading}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {seedLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Criando...</>
                  : 'Criar'
                }
              </button>
            </div>

            {seedError && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400">{seedError}</p>
              </div>
            )}

            {seedResult && (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4 text-sm space-y-1">
                <p className="font-bold text-green-700 dark:text-green-400">{seedResult.mensagem}</p>
                <p className="text-slate-600 dark:text-slate-400">
                  Cond #{seedResult.condominio_id} — {seedResult.condominio_nome}
                  {seedResult.nota_id && <> · Nota #{seedResult.nota_id}</>}
                </p>
              </div>
            )}

            {/* Etapa 2 — Boleto */}
            <div className={`flex items-center justify-between border rounded-xl p-4 transition-all ${
              seedResult?.nota_id ? 'border-slate-200 dark:border-slate-800' : 'border-slate-100 dark:border-slate-800/40 opacity-40'
            }`}>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Gerar boleto para a nota teste</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">POST /boletos/gerar · requer Inter configurado</p>
              </div>
              <button
                onClick={handleGerarBoleto}
                disabled={gerandoBoleto || !seedResult?.nota_id}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {gerandoBoleto
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
                  : 'Gerar Boleto'
                }
              </button>
            </div>

            {boletoError && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400">{boletoError}</p>
              </div>
            )}

            {boletoResult && (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4">
                <p className="text-sm font-bold text-green-700 dark:text-green-400">
                  {boletoResult.criados} boleto(s) gerado(s).
                </p>
                {boletoResult.criados > 0 && (
                  <Link href="/boletos" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block">
                    Ver boletos →
                  </Link>
                )}
                {boletoResult.erros?.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400 mt-1">{e}</p>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
