"use client"

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface ContaEmail {
  id: number;
  nome: string;
  email: string;
  tipo: string;
  ativo: boolean;
  graph_client_id: string | null;
  graph_tenant_id: string | null;
  criado_em: string;
}

interface Empresa {
  nome: string;
  email_from_name: string;
  telefone: string | null;
  site: string | null;
  emails_copia: string[] | null;
}

interface ContaInter {
  id: number;
  cnpj: string;
  razao_social: string | null;
  client_id: string;
  ativo: boolean;
  criado_em: string;
}

interface InterForm {
  cnpj: string;
  razao_social: string;
  client_id: string;
  client_secret: string;
  conta_corrente: string;
  cert_path: string;
  ativo: boolean;
}

const INTER_VAZIO: InterForm = {
  cnpj: '', razao_social: '', client_id: '', client_secret: '',
  conta_corrente: '', cert_path: '', ativo: true,
};

const EMPRESA_VAZIA: Empresa = { nome: '', email_from_name: 'CMPort', telefone: '', site: '', emails_copia: [] };

const FORM_VAZIO = {
  nome: '', email: '', ativo: false, tipo: 'SMTP',
  senha: '',
  graph_client_id: '', graph_tenant_id: '', graph_client_secret: '',
};

export default function ConfiguracoesPage() {
  // ── Email ──────────────────────────────────────────────────────────────────
  const [contas, setContas] = useState<ContaEmail[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  const [modalConta, setModalConta] = useState<'novo' | ContaEmail | null>(null);
  const [contaForm, setContaForm] = useState({ ...FORM_VAZIO });
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [testando, setTestando] = useState<number | null>(null);
  const [testeResult, setTesteResult] = useState<Record<number, { ok: boolean; msg: string }>>({});
  const [ativando, setAtivando] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarSecret, setMostrarSecret] = useState(false);

  // ── Inter ──────────────────────────────────────────────────────────────────
  const [contasInter, setContasInter] = useState<ContaInter[]>([]);
  const [loadingInter, setLoadingInter] = useState(true);
  const [modalInter, setModalInter] = useState<'novo' | ContaInter | null>(null);
  const [interForm, setInterForm] = useState<InterForm>({ ...INTER_VAZIO });
  const [salvandoInter, setSalvandoInter] = useState(false);
  const [desativandoInter, setDesativandoInter] = useState<number | null>(null);
  const [mostrarInterSecret, setMostrarInterSecret] = useState(false);

  // ── Empresa ────────────────────────────────────────────────────────────────
  const [empresa, setEmpresa] = useState<Empresa>(EMPRESA_VAZIA);
  const [loadingEmpresa, setLoadingEmpresa] = useState(true);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [empresaSalva, setEmpresaSalva] = useState(false);
  const [novoEmailCC, setNovoEmailCC] = useState('');

  // ── Carregar dados ─────────────────────────────────────────────────────────
  const carregarContas = async () => {
    try {
      const { data } = await api.get('/configuracoes/emails');
      setContas(data);
    } catch { /* silencioso */ }
    finally { setLoadingContas(false); }
  };

  const carregarEmpresa = async () => {
    try {
      const { data } = await api.get('/configuracoes/empresa');
      setEmpresa({ ...data, telefone: data.telefone ?? '', site: data.site ?? '', emails_copia: data.emails_copia ?? [] });
    } catch { /* silencioso */ }
    finally { setLoadingEmpresa(false); }
  };

  const carregarInter = async () => {
    try {
      const { data } = await api.get('/configuracoes/inter');
      setContasInter(data);
    } catch { /* silencioso */ }
    finally { setLoadingInter(false); }
  };

  useEffect(() => { carregarContas(); carregarEmpresa(); carregarInter(); }, []);

  // ── Conta Email ────────────────────────────────────────────────────────────
  const abrirNovaConta = () => {
    setContaForm({ ...FORM_VAZIO });
    setMostrarSenha(false);
    setMostrarSecret(false);
    setModalConta('novo');
  };

  const abrirEditarConta = (c: ContaEmail) => {
    setContaForm({
      nome: c.nome, email: c.email, ativo: c.ativo, tipo: c.tipo || 'SMTP',
      senha: '',
      graph_client_id:     c.graph_client_id ?? '',
      graph_tenant_id:     c.graph_tenant_id ?? '',
      graph_client_secret: '',
    });
    setMostrarSenha(false);
    setMostrarSecret(false);
    setModalConta(c);
  };

  const salvarConta = async () => {
    if (!contaForm.nome || !contaForm.email) return;

    if (contaForm.tipo === 'SMTP') {
      if (modalConta === 'novo' && !contaForm.senha) { alert('Informe a senha SMTP.'); return; }
    } else {
      if (modalConta === 'novo' && (!contaForm.graph_client_id || !contaForm.graph_tenant_id || !contaForm.graph_client_secret)) {
        alert('Para Graph API informe Client ID, Tenant ID e Client Secret.'); return;
      }
    }

    setSalvandoConta(true);
    try {
      if (modalConta === 'novo') {
        await api.post('/configuracoes/emails', contaForm);
      } else {
        const payload: Record<string, unknown> = {
          nome:  contaForm.nome,
          email: contaForm.email,
          tipo:  contaForm.tipo,
          ativo: contaForm.ativo,
        };
        if (contaForm.tipo === 'SMTP' && contaForm.senha) {
          payload.senha = contaForm.senha;
        }
        if (contaForm.tipo === 'GRAPH_API') {
          if (contaForm.graph_client_id)     payload.graph_client_id     = contaForm.graph_client_id;
          if (contaForm.graph_tenant_id)     payload.graph_tenant_id     = contaForm.graph_tenant_id;
          if (contaForm.graph_client_secret) payload.graph_client_secret = contaForm.graph_client_secret;
        }
        await api.put(`/configuracoes/emails/${(modalConta as ContaEmail).id}`, payload);
      }
      setModalConta(null);
      await carregarContas();
    } catch { alert('Erro ao salvar conta.'); }
    finally { setSalvandoConta(false); }
  };

  const ativarConta = async (id: number) => {
    setAtivando(id);
    try {
      await api.post(`/configuracoes/emails/${id}/ativar`);
      await carregarContas();
    } catch { alert('Erro ao ativar conta.'); }
    finally { setAtivando(null); }
  };

  const excluirConta = async (id: number) => {
    if (!confirm('Excluir esta conta de email?')) return;
    setExcluindo(id);
    try {
      await api.delete(`/configuracoes/emails/${id}`);
      await carregarContas();
    } catch { alert('Erro ao excluir conta.'); }
    finally { setExcluindo(null); }
  };

  const testarConta = async (id: number) => {
    setTestando(id);
    setTesteResult(prev => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const { data } = await api.post(`/configuracoes/emails/${id}/testar`);
      setTesteResult(prev => ({ ...prev, [id]: { ok: data.ok, msg: data.mensagem } }));
    } catch { setTesteResult(prev => ({ ...prev, [id]: { ok: false, msg: 'Erro ao testar.' } })); }
    finally { setTestando(null); }
  };

  // ── Inter ──────────────────────────────────────────────────────────────────
  const abrirNovaInter = () => {
    setInterForm({ ...INTER_VAZIO });
    setMostrarInterSecret(false);
    setModalInter('novo');
  };

  const abrirEditarInter = (c: ContaInter) => {
    setInterForm({
      cnpj:           c.cnpj,
      razao_social:   c.razao_social ?? '',
      client_id:      c.client_id,
      client_secret:  '',
      conta_corrente: '',
      cert_path:      '',
      ativo:          c.ativo,
    });
    setMostrarInterSecret(false);
    setModalInter(c);
  };

  const salvarInter = async () => {
    if (!interForm.cnpj || !interForm.client_id || !interForm.conta_corrente || !interForm.cert_path) {
      alert('Preencha CNPJ, Client ID, Conta Corrente e Caminho do Certificado.'); return;
    }
    if (modalInter === 'novo' && !interForm.client_secret) {
      alert('Informe o Client Secret.'); return;
    }
    setSalvandoInter(true);
    try {
      if (modalInter === 'novo') {
        await api.post('/configuracoes/inter', interForm);
      } else {
        const payload: Record<string, unknown> = {
          cnpj:          interForm.cnpj,
          razao_social:  interForm.razao_social || null,
          client_id:     interForm.client_id,
          conta_corrente: interForm.conta_corrente,
          cert_path:     interForm.cert_path,
          ativo:         interForm.ativo,
        };
        if (interForm.client_secret) payload.client_secret = interForm.client_secret;
        await api.put(`/configuracoes/inter/${(modalInter as ContaInter).id}`, payload);
      }
      setModalInter(null);
      await carregarInter();
    } catch { alert('Erro ao salvar conta Inter.'); }
    finally { setSalvandoInter(false); }
  };

  const desativarInter = async (id: number) => {
    if (!confirm('Desativar esta conta Inter? Ela não será mais usada para emitir boletos.')) return;
    setDesativandoInter(id);
    try {
      await api.delete(`/configuracoes/inter/${id}`);
      await carregarInter();
    } catch { alert('Erro ao desativar conta Inter.'); }
    finally { setDesativandoInter(null); }
  };

  // ── Empresa ────────────────────────────────────────────────────────────────
  const salvarEmpresa = async () => {
    if (!empresa.nome) return;
    setSalvandoEmpresa(true);
    try {
      await api.put('/configuracoes/empresa', {
        ...empresa,
        telefone: empresa.telefone || null,
        site: empresa.site || null,
      });
      setEmpresaSalva(true);
      setTimeout(() => setEmpresaSalva(false), 3000);
    } catch { alert('Erro ao salvar dados da empresa.'); }
    finally { setSalvandoEmpresa(false); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const tipoBadge = (tipo: string) =>
    tipo === 'GRAPH_API'
      ? <span className="text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full font-bold">Graph API</span>
      : <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold">SMTP</span>;

  const inputCls = "w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white";
  const labelCls = "block text-xs font-bold text-slate-500 uppercase mb-1.5";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Email para envio e dados da empresa</p>
      </div>

      {/* ── Contas de Email ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">📧 Contas de Email</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Somente uma conta pode estar ativa por vez</p>
          </div>
          <button
            onClick={abrirNovaConta}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all"
          >
            + Nova conta
          </button>
        </div>

        {loadingContas ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : contas.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <p className="text-slate-400 text-sm">Nenhuma conta cadastrada.</p>
            <p className="text-slate-400 text-xs mt-1">Clique em &quot;+ Nova conta&quot; para adicionar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contas.map(c => (
              <div key={c.id} className={`rounded-2xl border p-4 transition-all ${c.ativo ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{c.nome}</p>
                      {tipoBadge(c.tipo)}
                      {c.ativo && <span className="text-xs bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">● Ativa</span>}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.email}</p>
                    {c.tipo === 'GRAPH_API' && c.graph_tenant_id && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">tenant: {c.graph_tenant_id.substring(0, 8)}…</p>
                    )}

                    {testeResult[c.id] && (
                      <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium w-fit ${testeResult[c.id].ok ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'}`}>
                        {testeResult[c.id].ok ? '✅' : '❌'} {testeResult[c.id].msg}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5 flex-wrap justify-end shrink-0">
                    <button
                      onClick={() => testarConta(c.id)}
                      disabled={testando === c.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:brightness-95 transition-all disabled:opacity-50"
                    >
                      {testando === c.id ? '...' : '🔌 Testar'}
                    </button>
                    {!c.ativo && (
                      <button
                        onClick={() => ativarConta(c.id)}
                        disabled={ativando === c.id}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 hover:brightness-95 transition-all disabled:opacity-50"
                      >
                        {ativando === c.id ? '...' : '✓ Ativar'}
                      </button>
                    )}
                    <button
                      onClick={() => abrirEditarConta(c)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:brightness-95 transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => excluirConta(c.id)}
                      disabled={excluindo === c.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:brightness-95 transition-all disabled:opacity-50"
                    >
                      {excluindo === c.id ? '...' : '🗑️'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Dados da Empresa ── */}
      <section>
        <h2 className="text-lg font-black text-slate-800 dark:text-white mb-4">🏢 Dados da Empresa</h2>
        {loadingEmpresa ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome da empresa</label>
                <input type="text" value={empresa.nome} onChange={e => setEmpresa(p => ({ ...p, nome: e.target.value }))} placeholder="CMPort" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nome exibido no email (remetente)</label>
                <input type="text" value={empresa.email_from_name} onChange={e => setEmpresa(p => ({ ...p, email_from_name: e.target.value }))} placeholder="CMPort" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input type="text" value={empresa.telefone ?? ''} onChange={e => setEmpresa(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Site</label>
                <input type="text" value={empresa.site ?? ''} onChange={e => setEmpresa(p => ({ ...p, site: e.target.value }))} placeholder="www.cmport.com.br" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={salvarEmpresa}
                disabled={salvandoEmpresa || !empresa.nome}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {salvandoEmpresa
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar'}
              </button>
              {empresaSalva && <span className="text-green-600 dark:text-green-400 text-sm font-bold">✅ Salvo!</span>}
            </div>
          </div>
        )}
      </section>

      {/* ── E-mails em Cópia (Global) ── */}
      <section>
        <h2 className="text-lg font-black text-slate-800 dark:text-white mb-1">📋 E-mails em Cópia (Global)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Estes endereços recebem cópia em <strong>todos</strong> os emails enviados pelo sistema.</p>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          {/* Lista atual */}
          <div className="flex flex-wrap gap-2 min-h-[36px]">
            {(empresa.emails_copia ?? []).length === 0 ? (
              <span className="text-xs text-slate-400 italic">Nenhum email em cópia configurado.</span>
            ) : (
              (empresa.emails_copia ?? []).map(email => (
                <span key={email} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5 rounded-full font-medium">
                  {email}
                  <button
                    onClick={async () => {
                      const nova = (empresa.emails_copia ?? []).filter(e => e !== email);
                      setEmpresa(p => ({ ...p, emails_copia: nova }));
                      try { await api.put('/configuracoes/empresa', { ...empresa, emails_copia: nova }); }
                      catch { setEmpresa(p => ({ ...p, emails_copia: empresa.emails_copia })); alert('Erro ao salvar.'); }
                    }}
                    className="hover:text-red-500 font-black leading-none"
                  >×</button>
                </span>
              ))
            )}
          </div>
          {/* Input para adicionar */}
          <div className="flex gap-2">
            <input
              type="email"
              value={novoEmailCC}
              onChange={e => setNovoEmailCC(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const email = novoEmailCC.trim();
                  if (!email || (empresa.emails_copia ?? []).includes(email)) return;
                  const nova = [...(empresa.emails_copia ?? []), email];
                  setEmpresa(p => ({ ...p, emails_copia: nova }));
                  setNovoEmailCC('');
                  try { await api.put('/configuracoes/empresa', { ...empresa, emails_copia: nova }); }
                  catch { setEmpresa(p => ({ ...p, emails_copia: empresa.emails_copia })); alert('Erro ao salvar.'); }
                }
              }}
              placeholder="email@exemplo.com"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
            <button
              onClick={async () => {
                const email = novoEmailCC.trim();
                if (!email || (empresa.emails_copia ?? []).includes(email)) return;
                const nova = [...(empresa.emails_copia ?? []), email];
                setEmpresa(p => ({ ...p, emails_copia: nova }));
                setNovoEmailCC('');
                try { await api.put('/configuracoes/empresa', { ...empresa, emails_copia: nova }); }
                catch { setEmpresa(p => ({ ...p, emails_copia: empresa.emails_copia })); alert('Erro ao salvar.'); }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all"
            >+</button>
          </div>
        </div>
      </section>

      {/* ── Contas Banco Inter ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">🏦 Contas Banco Inter</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Uma conta por CNPJ emitente — o boleto usa a conta do CNPJ da nota</p>
          </div>
          <button
            onClick={abrirNovaInter}
            className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all"
          >
            + Adicionar conta
          </button>
        </div>

        {loadingInter ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : contasInter.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <p className="text-slate-400 text-sm">Nenhuma conta Inter cadastrada.</p>
            <p className="text-slate-400 text-xs mt-1">Sem configuração, o sistema usa as variáveis de ambiente (.env).</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contasInter.map(c => (
              <div key={c.id} className={`rounded-2xl border p-4 transition-all ${c.ativo ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 dark:text-white text-sm font-mono">{c.cnpj}</p>
                      {c.ativo
                        ? <span className="text-xs bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">● Ativa</span>
                        : <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">Inativa</span>
                      }
                    </div>
                    {c.razao_social && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.razao_social}</p>}
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{c.client_id.substring(0, 8)}…</p>
                  </div>

                  <div className="flex gap-1.5 flex-wrap justify-end shrink-0">
                    <button
                      onClick={() => abrirEditarInter(c)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:brightness-95 transition-all"
                    >
                      ✏️ Editar
                    </button>
                    {c.ativo && (
                      <button
                        onClick={() => desativarInter(c.id)}
                        disabled={desativandoInter === c.id}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:brightness-95 transition-all disabled:opacity-50"
                      >
                        {desativandoInter === c.id ? '...' : 'Desativar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Modal Nova/Editar Conta Inter ── */}
      {modalInter !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">
              {modalInter === 'novo' ? '+ Nova Conta Banco Inter' : '✏️ Editar Conta Inter'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>CNPJ</label>
                  <input
                    type="text"
                    value={interForm.cnpj}
                    onChange={e => setInterForm(p => ({ ...p, cnpj: e.target.value }))}
                    placeholder="12.345.678/0001-90"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Razão Social</label>
                  <input
                    type="text"
                    value={interForm.razao_social ?? ''}
                    onChange={e => setInterForm(p => ({ ...p, razao_social: e.target.value }))}
                    placeholder="Empresa LTDA"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Client ID</label>
                <input
                  type="text"
                  value={interForm.client_id}
                  onChange={e => setInterForm(p => ({ ...p, client_id: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={`${inputCls} font-mono text-xs`}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Client Secret {modalInter !== 'novo' && <span className="normal-case font-normal text-slate-400">(deixe em branco para não alterar)</span>}
                </label>
                <div className="relative">
                  <input
                    type={mostrarInterSecret ? 'text' : 'password'}
                    value={interForm.client_secret}
                    onChange={e => setInterForm(p => ({ ...p, client_secret: e.target.value }))}
                    placeholder={modalInter === 'novo' ? 'client_secret...' : '••••••••'}
                    className={`${inputCls} pr-10 font-mono text-xs`}
                  />
                  <button type="button" onClick={() => setMostrarInterSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                    {mostrarInterSecret ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>Conta Corrente</label>
                <input
                  type="text"
                  value={interForm.conta_corrente}
                  onChange={e => setInterForm(p => ({ ...p, conta_corrente: e.target.value }))}
                  placeholder="12345678"
                  className={`${inputCls} font-mono`}
                />
              </div>

              <div>
                <label className={labelCls}>Caminho do Certificado (no servidor)</label>
                <input
                  type="text"
                  value={interForm.cert_path}
                  onChange={e => setInterForm(p => ({ ...p, cert_path: e.target.value }))}
                  placeholder="app/auth/cnpj1/"
                  className={`${inputCls} font-mono text-xs`}
                />
                <p className="text-xs text-slate-400 mt-1">Pasta no servidor contendo <code>certificado.crt</code> e <code>key.key</code></p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interForm.ativo}
                  onChange={e => setInterForm(p => ({ ...p, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded accent-orange-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Conta ativa</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalInter(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={salvarInter}
                disabled={salvandoInter || !interForm.cnpj || !interForm.client_id || !interForm.conta_corrente || !interForm.cert_path}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvandoInter
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova/Editar Conta ── */}
      {modalConta !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">
              {modalConta === 'novo' ? '+ Nova Conta de Email' : '✏️ Editar Conta'}
            </h2>

            <div className="space-y-4">
              {/* Nome e email (comuns) */}
              <div>
                <label className={labelCls}>Nome / Identificação</label>
                <input
                  type="text"
                  value={contaForm.nome}
                  onChange={e => setContaForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Email Principal"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Email remetente</label>
                <input
                  type="email"
                  value={contaForm.email}
                  onChange={e => setContaForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="envio@empresa.com"
                  className={inputCls}
                />
              </div>

              {/* Seletor de tipo */}
              <div>
                <label className={labelCls}>Tipo de envio</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  {(['SMTP', 'GRAPH_API'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setContaForm(p => ({ ...p, tipo: t }))}
                      className={`flex-1 py-2 text-sm font-bold transition-all ${
                        contaForm.tipo === t
                          ? t === 'GRAPH_API'
                            ? 'bg-purple-600 text-white'
                            : 'bg-blue-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:brightness-95'
                      }`}
                    >
                      {t === 'GRAPH_API' ? '☁️ Microsoft Graph API' : '📮 SMTP (Outlook)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos SMTP */}
              {contaForm.tipo === 'SMTP' && (
                <div>
                  <label className={labelCls}>
                    Senha {modalConta !== 'novo' && <span className="normal-case font-normal text-slate-400">(deixe em branco para não alterar)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={contaForm.senha}
                      onChange={e => setContaForm(p => ({ ...p, senha: e.target.value }))}
                      placeholder={modalConta === 'novo' ? 'Senha da conta Outlook' : '••••••••'}
                      className={`${inputCls} pr-10`}
                    />
                    <button type="button" onClick={() => setMostrarSenha(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                      {mostrarSenha ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}

              {/* Campos Graph API */}
              {contaForm.tipo === 'GRAPH_API' && (
                <div className="space-y-3 p-4 bg-purple-50 dark:bg-purple-500/5 rounded-xl border border-purple-200 dark:border-purple-500/20">
                  <p className="text-xs text-purple-700 dark:text-purple-400 font-bold">Credenciais do Azure AD App Registration</p>
                  <div>
                    <label className={labelCls}>Client ID (Application ID)</label>
                    <input
                      type="text"
                      value={contaForm.graph_client_id}
                      onChange={e => setContaForm(p => ({ ...p, graph_client_id: e.target.value }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Tenant ID (Directory ID)</label>
                    <input
                      type="text"
                      value={contaForm.graph_tenant_id}
                      onChange={e => setContaForm(p => ({ ...p, graph_tenant_id: e.target.value }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Client Secret (Value) {modalConta !== 'novo' && <span className="normal-case font-normal text-slate-400">(deixe em branco para não alterar)</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarSecret ? 'text' : 'password'}
                        value={contaForm.graph_client_secret}
                        onChange={e => setContaForm(p => ({ ...p, graph_client_secret: e.target.value }))}
                        placeholder={modalConta === 'novo' ? 'wZT8Q~...' : '••••••••'}
                        className={`${inputCls} pr-10 font-mono text-xs`}
                      />
                      <button type="button" onClick={() => setMostrarSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                        {mostrarSecret ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Use o <strong>Value</strong>, não o ID do secret</p>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contaForm.ativo}
                  onChange={e => setContaForm(p => ({ ...p, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Definir como conta ativa</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalConta(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={salvarConta}
                disabled={salvandoConta || !contaForm.nome || !contaForm.email}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvandoConta
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
