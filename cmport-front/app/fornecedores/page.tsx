"use client"

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string | null;
  razao_social: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
}

interface FornecedorForm {
  nome: string;
  cnpj: string;
  razao_social: string;
  observacao: string;
  ativo: boolean;
}

const FORM_VAZIO: FornecedorForm = { nome: '', cnpj: '', razao_social: '', observacao: '', ativo: true };

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'novo' | Fornecedor | null>(null);
  const [form, setForm] = useState<FornecedorForm>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/condominios', { params: { tipo: 'FORNECEDOR', limit: 700 } });
      setFornecedores(data);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setForm({ ...FORM_VAZIO });
    setModal('novo');
  };

  const abrirEditar = (f: Fornecedor) => {
    setForm({
      nome: f.nome,
      cnpj: f.cnpj ?? '',
      razao_social: f.razao_social ?? '',
      observacao: f.observacao ?? '',
      ativo: f.ativo,
    });
    setModal(f);
  };

  const salvar = async () => {
    if (!form.nome) { alert('Preencha o nome.'); return; }
    setSalvando(true);
    const payload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      razao_social: form.razao_social || null,
      observacao: form.observacao || null,
      tipo: 'FORNECEDOR',
      ativo: form.ativo,
    };
    try {
      if (modal === 'novo') {
        await api.post('/condominios', payload);
      } else {
        await api.put(`/condominios/${(modal as Fornecedor).id}`, payload);
      }
      setModal(null);
      await carregar();
    } catch {
      alert('Erro ao salvar fornecedor.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Fornecedores</h1>
            <p className="text-xs text-slate-500 mt-0.5">Cadastro usado pra vincular saídas de fornecedor a serviços e orçamentos</p>
          </div>
          <button onClick={abrirNovo}
            className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all">
            + Novo Fornecedor
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : fornecedores.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <p className="text-slate-400 text-sm">Nenhum fornecedor cadastrado.</p>
            <p className="text-slate-400 text-xs mt-1">Clique em &quot;+ Novo Fornecedor&quot; pra cadastrar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fornecedores.map(f => (
              <div key={f.id} className={`rounded-2xl border p-4 transition-all ${f.ativo ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{f.nome}</p>
                      {f.ativo
                        ? <span className="text-xs bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">● Ativo</span>
                        : <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">Inativo</span>
                      }
                    </div>
                    {f.razao_social && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{f.razao_social}</p>}
                    {f.cnpj && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{f.cnpj}</p>}
                  </div>
                  <button onClick={() => abrirEditar(f)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:brightness-95 transition-all shrink-0">
                    ✏️ Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Novo/Editar Fornecedor ── */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">
              {modal === 'novo' ? '+ Novo Fornecedor' : '✏️ Editar Fornecedor'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nome</label>
                <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Center G"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Razão Social</label>
                <input type="text" value={form.razao_social} onChange={e => setForm(p => ({ ...p, razao_social: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">CNPJ</label>
                <input type="text" value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))}
                  placeholder="12.345.678/0001-90"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observação</label>
                <input type="text" value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
              {modal !== 'novo' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.ativo} onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                    className="w-4 h-4 rounded accent-orange-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Fornecedor ativo</span>
                </label>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvando
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
