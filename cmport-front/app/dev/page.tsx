"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface SyncResult {
  novos: number;
  ignorados: number;
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

interface BancoLinha {
  banco_id: number | null;
  banco_nome: string;
  empresa: string | null;
  saldo_inicial: string | null;
  entradas_total: string;
  transf_recebidas: string;
  transf_enviadas: string;
  saidas_total: string;
  saldo_calculado: string | null;
  saldo_extrato: string | null;
  saldo_extrato_fonte: string | null;
  diferenca: string | null;
  bate: boolean | null;
}

interface ExtratoTransacao {
  dataEntrada: string;
  tipoTransacao: string;
  tipoOperacao: 'C' | 'D';
  valor: string;
  titulo: string;
  descricao: string;
}

interface UsuarioLinha {
  id: number;
  nome: string;
  email: string;
  role: 'DEV' | 'ADMIN' | 'USUARIO';
  ativo: boolean;
  criado_em: string;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function DevPage() {
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

  // Conferência por banco
  const hoje = new Date();
  const [confAno, setConfAno] = useState(hoje.getFullYear());
  const [confMes, setConfMes] = useState(hoje.getMonth() + 1);
  const [confLoading, setConfLoading] = useState(false);
  const [confResult, setConfResult] = useState<BancoLinha[] | null>(null);
  const [confError, setConfError] = useState<string | null>(null);

  const handleConferencia = async () => {
    setConfLoading(true);
    setConfError(null);
    setConfResult(null);
    try {
      const res = await api.get('/financeiro/dashboard/por-banco', { params: { ano: confAno, mes: confMes } });
      setConfResult(res.data.bancos);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao conferir bancos.';
      setConfError(String(msg));
    } finally {
      setConfLoading(false);
    }
  };

  // Extrato real via API Inter
  const CNPJS = [
    { label: 'CMPORT', cnpj: '22761557000188' },
    { label: 'CMPORT TEC', cnpj: '65756913000188' },
  ];
  const [extCnpj, setExtCnpj] = useState(CNPJS[0].cnpj);
  const [extInicio, setExtInicio] = useState('');
  const [extFim, setExtFim] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extResult, setExtResult] = useState<ExtratoTransacao[] | null>(null);
  const [extError, setExtError] = useState<string | null>(null);

  const handleExtrato = async () => {
    if (!extInicio || !extFim) { setExtError('Preencha as duas datas.'); return; }
    setExtLoading(true);
    setExtError(null);
    setExtResult(null);
    try {
      const res = await api.get('/dev/inter-extrato', { params: { cnpj: extCnpj, data_inicio: extInicio, data_fim: extFim } });
      setExtResult(res.data.transacoes);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao consultar extrato.';
      setExtError(String(msg));
    } finally {
      setExtLoading(false);
    }
  };

  // Cadastro de usuário
  const [usuarios, setUsuarios] = useState<UsuarioLinha[] | null>(null);
  const [usuariosLoading, setUsuariosLoading] = useState(false);
  const [usuariosError, setUsuariosError] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoRole, setNovoRole] = useState<'DEV' | 'ADMIN' | 'USUARIO'>('USUARIO');
  const [criandoUsuario, setCriandoUsuario] = useState(false);
  const [usuarioError, setUsuarioError] = useState<string | null>(null);
  const [usuarioMsg, setUsuarioMsg] = useState<string | null>(null);

  const carregarUsuarios = async () => {
    setUsuariosLoading(true);
    setUsuariosError(null);
    try {
      const res = await api.get('/dev/usuarios');
      setUsuarios(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao listar usuários.';
      setUsuariosError(String(msg));
    } finally {
      setUsuariosLoading(false);
    }
  };

  const handleCriarUsuario = async () => {
    if (!novoNome.trim() || !novoEmail.trim() || novaSenha.length < 6) {
      setUsuarioError('Preencha nome, email e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setCriandoUsuario(true);
    setUsuarioError(null);
    setUsuarioMsg(null);
    try {
      await api.post('/dev/usuarios', { nome: novoNome.trim(), email: novoEmail.trim(), senha: novaSenha, role: novoRole });
      setUsuarioMsg(`Usuário "${novoNome.trim()}" cadastrado como ${novoRole}.`);
      setNovoNome(''); setNovoEmail(''); setNovaSenha(''); setNovoRole('USUARIO');
      await carregarUsuarios();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (err as { message?: string })?.message || 'Erro ao cadastrar usuário.';
      setUsuarioError(String(msg));
    } finally {
      setCriandoUsuario(false);
    }
  };

  const handleToggleAtivo = async (u: UsuarioLinha) => {
    try {
      await api.patch(`/dev/usuarios/${u.id}`, { ativo: !u.ativo });
      await carregarUsuarios();
    } catch {
      setUsuariosError('Erro ao atualizar usuário.');
    }
  };

  const handleTrocarRole = async (u: UsuarioLinha, role: string) => {
    try {
      await api.patch(`/dev/usuarios/${u.id}`, { role });
      await carregarUsuarios();
    } catch {
      setUsuariosError('Erro ao atualizar usuário.');
    }
  };

  useEffect(() => { carregarUsuarios(); }, []);

  const handleSync = async () => {
    setSincronizando(true);
    setSyncResult(null);
    setSyncError(null);
    setSyncProgresso(null);
    try {
      await api.post('/condominios/sync-auvo/iniciar');

      const poll = setInterval(async () => {
        try {
          const res = await api.get('/condominios/sync-auvo/progresso');
          const estado = res.data;
          setSyncProgresso({ processados: estado.processados, total: estado.total, mensagem: estado.mensagem });

          if (estado.concluido) {
            clearInterval(poll);
            setSincronizando(false);
            setSyncProgresso(null);
            setSyncResult({
              novos: estado.novos,
              ignorados: estado.ignorados,
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
                  { label: 'Ignorados', value: syncResult.ignorados, color: 'text-slate-500 dark:text-slate-400' },
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

        {/* ── Conferência por Banco ── */}
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                🏦
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Conferência por Banco</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Compara o saldo calculado do sistema com o saldo do extrato, banco a banco, no mês escolhido.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input type="number" value={confAno} onChange={e => setConfAno(Number(e.target.value))}
                className="w-24 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
              <select value={confMes} onChange={e => setConfMes(Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <button onClick={handleConferencia} disabled={confLoading}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                {confLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verificando...</>
                  : 'Verificar'}
              </button>
            </div>
          </div>

          {confError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{confError}</p>
            </div>
          )}

          {confResult && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3">Banco</th>
                    <th className="py-2 pr-3 text-right">Calculado</th>
                    <th className="py-2 pr-3 text-right">Extrato</th>
                    <th className="py-2 pr-3 text-right">Diferença</th>
                    <th className="py-2 pr-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {confResult.map(b => (
                    <tr key={b.banco_id ?? 'sem-banco'}>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-white">
                        {b.banco_nome}{b.empresa && <span className="text-xs text-slate-400"> ({b.empresa})</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{b.saldo_calculado ?? '—'}</td>
                      <td className="py-2 pr-3 text-right font-mono">{b.saldo_extrato ?? '—'}</td>
                      <td className={`py-2 pr-3 text-right font-mono font-bold ${
                        b.diferenca == null ? 'text-slate-400' : Math.abs(Number(b.diferenca)) < 0.02 ? 'text-emerald-600' : 'text-red-600'
                      }`}>{b.diferenca ?? '—'}</td>
                      <td className="py-2 pr-3 text-center">
                        {b.bate == null ? '—' : b.bate
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">BATE</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">NÃO BATE</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Extrato Real (API Inter) ── */}
        <div className="bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                📄
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Extrato Real (API Inter)</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Puxa o extrato direto do Banco Inter (entrada/saída) pra comparar com o sistema, sem precisar baixar PDF.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <select value={extCnpj} onChange={e => setExtCnpj(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                {CNPJS.map(c => <option key={c.cnpj} value={c.cnpj}>{c.label}</option>)}
              </select>
              <input type="date" value={extInicio} onChange={e => setExtInicio(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
              <input type="date" value={extFim} onChange={e => setExtFim(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
              <button onClick={handleExtrato} disabled={extLoading}
                className="px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-cyan-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                {extLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Consultando...</>
                  : 'Consultar'}
              </button>
            </div>
          </div>

          {extError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{extError}</p>
            </div>
          )}

          {extResult && (
            <div className="mt-4 max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-500 uppercase sticky top-0">
                {extResult.length} lançamento(s)
              </div>
              {extResult.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-slate-700 dark:text-slate-300 truncate">{t.descricao}</p>
                    <p className="text-xs text-slate-400">{t.dataEntrada} · {t.tipoTransacao}</p>
                  </div>
                  <span className={`font-mono font-bold whitespace-nowrap ${t.tipoOperacao === 'C' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.tipoOperacao === 'C' ? '+' : '-'}{fmt(Number(t.valor))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Cadastrar Usuário ── */}
        <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/40 rounded-2xl p-7 shadow-sm">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
              👤
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Cadastrar Usuário</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cria um novo login e já define o nível de acesso (DEV, ADMIN ou USUARIO).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <input type="text" placeholder="Nome" value={novoNome} onChange={e => setNovoNome(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
            <input type="email" placeholder="Email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
            <input type="password" placeholder="Senha (mín. 6 caracteres)" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
            <select value={novoRole} onChange={e => setNovoRole(e.target.value as 'DEV' | 'ADMIN' | 'USUARIO')}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
              <option value="USUARIO">Usuário (visualizar + boletos)</option>
              <option value="ADMIN">Admin (tudo exceto /dev)</option>
              <option value="DEV">Dev (acesso total)</option>
            </select>
          </div>
          <button onClick={handleCriarUsuario} disabled={criandoUsuario}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2">
            {criandoUsuario
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Criando...</>
              : 'Criar usuário'}
          </button>

          {usuarioError && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{usuarioError}</p>
            </div>
          )}
          {usuarioMsg && (
            <div className="mt-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800/30 rounded-xl p-3">
              <p className="text-sm text-green-700 dark:text-green-400">{usuarioMsg}</p>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-black text-slate-500 uppercase mb-3">Usuários cadastrados</p>
            {usuariosLoading && <p className="text-sm text-slate-400">Carregando...</p>}
            {usuariosError && <p className="text-sm text-red-600 dark:text-red-400">{usuariosError}</p>}
            {usuarios && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {usuarios.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{u.nome}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select value={u.role} onChange={e => handleTrocarRole(u, e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                        <option value="USUARIO">USUARIO</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="DEV">DEV</option>
                      </select>
                      <button onClick={() => handleToggleAtivo(u)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          u.ativo
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
