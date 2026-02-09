"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Contato {
  nome: string;
  telefone: string;
  email: string;
  funcao: string;
  principal: boolean;
}

interface Endereco {
  rua: string;
  latitude: number | null;
  longitude: number | null;
}

interface FormData {
  nome: string;
  razao_social: string;
  cnpj: string;
  ativo: boolean;
  observacao: string;
  endereco: Endereco;
  contatos: Contato[];
}

function FormNovoCondominio() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    razao_social: '',
    cnpj: '',
    ativo: true,
    observacao: '',
    endereco: {
      rua: '',
      latitude: null,
      longitude: null
    },
    contatos: [
      { nome: '', telefone: '', email: '', funcao: 'Síndico', principal: true }
    ]
  });

  const addContato = () => {
    setFormData({
      ...formData,
      contatos: [...formData.contatos, { nome: '', telefone: '', email: '', funcao: 'Outro', principal: false }]
    });
  };

  const removeContato = (index: number) => {
    if (formData.contatos.length === 1) return;
    const novos = formData.contatos.filter((_, i) => i !== index);
    setFormData({ ...formData, contatos: novos });
  };

  const updateContato = (index: number, field: keyof Contato, value: string | boolean) => {
    const novos = [...formData.contatos];
    novos[index] = { ...novos[index], [field]: value };
    setFormData({ ...formData, contatos: novos });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Criar o condomínio
      const condominioResponse = await api.post('/condominios/', {
        nome: formData.nome,
        razao_social: formData.razao_social,
        cnpj: formData.cnpj,
        ativo: formData.ativo,
        observacao: formData.observacao
      });

      const condominioId = condominioResponse.data.id;
      console.log(condominioResponse)

      // 2. Criar endereço se preenchido
      if (formData.endereco.rua) {
        await api.post('/enderecos/', {
          condominio_id: condominioId,
          rua: formData.endereco.rua,
          latitude: formData.endereco.latitude,
          longitude: formData.endereco.longitude
        });
      }

      // 3. Criar contatos
      for (const contato of formData.contatos) {
        if (contato.nome) {
          await api.post('/contatos/', {
            condominio_id: condominioId,
            nome: contato.nome,
            telefone: contato.telefone,
            email: contato.email || null,
            funcao: contato.funcao,
            principal: contato.principal
          });
        }
      }

      // Redirecionar para a página de detalhes
      router.push(`/condominios/${condominioId}`);
    } catch (err) {
      console.error('Erro ao criar condomínio:', err);
      setError('Erro ao criar condomínio. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* SEÇÃO 1: IDENTIFICAÇÃO */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 text-xs font-black">01</span>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Dados da Instituição</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nome Fantasia *</label>
            <input 
              required
              placeholder="Ex: Condomínio Edifício Angra"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.nome}
              onChange={(e) => setFormData({...formData, nome: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Razão Social</label>
            <input 
              placeholder="Razão Social completa"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.razao_social}
              onChange={(e) => setFormData({...formData, razao_social: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">CNPJ</label>
            <input 
              placeholder="00.000.000/0000-00"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.cnpj}
              onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Status</label>
            <select 
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.ativo ? 'true' : 'false'}
              onChange={(e) => setFormData({...formData, ativo: e.target.value === 'true'})}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Observações</label>
          <textarea 
            placeholder="Informações adicionais sobre o condomínio..."
            rows={3}
            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all resize-none"
            value={formData.observacao}
            onChange={(e) => setFormData({...formData, observacao: e.target.value})}
          />
        </div>
      </section>

      {/* SEÇÃO 2: LOCALIZAÇÃO */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 text-xs font-black">02</span>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Localização</h3>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Endereço Completo</label>
          <input 
            placeholder="Rua, Número, Bairro, Cidade - UF"
            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
            value={formData.endereco.rua}
            onChange={(e) => setFormData({
              ...formData, 
              endereco: { ...formData.endereco, rua: e.target.value }
            })}
          />
        </div>
      </section>

      {/* SEÇÃO 3: CONTATOS */}
      <section className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 text-xs font-black">03</span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Contatos</h3>
          </div>
          <button 
            type="button" 
            onClick={addContato}
            className="text-[10px] font-black uppercase bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-blue-600/20 hover:scale-105 transition-all"
          >
            + Adicionar
          </button>
        </div>

        <div className="space-y-4">
          {formData.contatos.map((contato, index) => (
            <div key={index} className="p-6 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input 
                  placeholder="Nome *"
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 ring-blue-600/20 outline-none"
                  value={contato.nome}
                  onChange={(e) => updateContato(index, 'nome', e.target.value)}
                />
                <input 
                  placeholder="Email"
                  type="email"
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 ring-blue-600/20 outline-none"
                  value={contato.email}
                  onChange={(e) => updateContato(index, 'email', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input 
                  placeholder="Telefone"
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 ring-blue-600/20 outline-none"
                  value={contato.telefone}
                  onChange={(e) => updateContato(index, 'telefone', e.target.value)}
                />
                <select 
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:ring-2 ring-blue-600/20 outline-none"
                  value={contato.funcao}
                  onChange={(e) => updateContato(index, 'funcao', e.target.value)}
                >
                  <option value="Síndico">Síndico</option>
                  <option value="Zelador">Zelador</option>
                  <option value="Porteiro">Porteiro</option>
                  <option value="Administrador">Administrador</option>
                  <option value="Outro">Outro</option>
                </select>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input 
                      type="checkbox"
                      checked={contato.principal}
                      onChange={(e) => updateContato(index, 'principal', e.target.checked)}
                      className="rounded"
                    />
                    Principal
                  </label>
                  {formData.contatos.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeContato(index)} 
                      className="ml-auto text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="pt-8 flex flex-col md:flex-row gap-4">
        <Link
          href="/condominios"
          className="flex-1 py-5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-[1.5rem] font-black text-lg text-center hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
        >
          CANCELAR
        </Link>
        <button 
          type="submit" 
          disabled={loading}
          className="flex-1 py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-blue-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'CRIANDO...' : 'FINALIZAR CADASTRO'}
        </button>
      </div>
    </form>
  );
}

export default function NovoCondominioPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <span className="text-2xl">+</span>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Novo Condomínio</h1>
              <p className="text-slate-500 font-medium italic text-sm">Inicie o onboarding de uma nova unidade na base CMPort</p>
            </div>
          </div>
          <Link
            href="/condominios"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>
        </div>

        {/* Container do Formulário */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-sm overflow-hidden p-8 md:p-12">
          <FormNovoCondominio />
        </div>
      </div>
    </div>
  );
}