/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FormEditarCondominio({ initialData }: { initialData: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Estado completo incluindo endereço e contatos
  const [formData, setFormData] = useState({
    ...initialData,
    endereco: initialData.endereco || { rua: '', latitude: null, longitude: null },
    contatos: initialData.contatos || []
  });

  // Funções para manipular Contatos
  const addContato = () => {
    const novo = { nome: '', telefone: '', email: '', funcao: 'Outro', principal: false };
    setFormData({ ...formData, contatos: [...formData.contatos, novo] });
  };

  const removeContato = (index: number) => {
    const novos = formData.contatos.filter((_: any, i: number) => i !== index);
    setFormData({ ...formData, contatos: novos });
  };

  const updateContato = (index: number, field: string, value: string) => {
    const novos = [...formData.contatos];
    novos[index] = { ...novos[index], [field]: value };
    setFormData({ ...formData, contatos: novos });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/condominios/${initialData.id}`, formData);
      router.push(`/condominios/${initialData.id}`);
      router.refresh();
    } catch (error) {
      alert("Erro ao salvar alterações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      
      {/* SEÇÃO 1: DADOS BÁSICOS */}
      <section className="space-y-6">
        <h3 className="text-lg font-bold text-brand dark:text-white border-b pb-2">Informações Gerais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Nome do Condomínio</label>
            <input 
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              value={formData.nome}
              onChange={(e) => setFormData({...formData, nome: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">CNPJ</label>
            <input 
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
              value={formData.cnpj || ''}
              onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
            />
          </div>
        </div>
      </section>

      {/* SEÇÃO 2: ENDEREÇO */}
      <section className="space-y-6">
        <h3 className="text-lg font-bold text-brand dark:text-white border-b pb-2">Localização</h3>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400">Endereço Completo (Rua, Número, Bairro, CEP)</label>
          <input 
            className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            value={formData.endereco.rua}
            onChange={(e) => setFormData({
              ...formData, 
              endereco: { ...formData.endereco, rua: e.target.value }
            })}
          />
        </div>
      </section>

      {/* SEÇÃO 3: CONTATOS DINÂMICOS */}
      <section className="space-y-6">
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="text-lg font-bold text-brand dark:text-white">Gestão de Contatos</h3>
          <button 
            type="button" 
            onClick={addContato}
            className="text-xs bg-brand/10 text-brand px-3 py-1 rounded-lg font-bold hover:bg-brand hover:text-white transition-all"
          >
            + Adicionar Contato
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {formData.contatos.map((contato: any, index: number) => (
            <div key={index} className="p-6 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl relative group">
              <button 
                type="button"
                onClick={() => removeContato(index)}
                className="absolute top-4 right-4 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Remover
              </button>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Nome</label>
                  <input 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                    value={contato.nome}
                    onChange={(e) => updateContato(index, 'nome', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Função</label>
                  <select 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                    value={contato.funcao}
                    onChange={(e) => updateContato(index, 'funcao', e.target.value)}
                  >
                    <option value="Sindico">Síndico</option>
                    <option value="Zelador">Zelador</option>
                    <option value="Administradora">Administradora</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Telefone</label>
                  <input 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                    value={contato.telefone}
                    onChange={(e) => updateContato(index, 'telefone', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">E-mail</label>
                  <input 
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                    value={contato.email}
                    onChange={(e) => updateContato(index, 'email', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOTÕES DE AÇÃO */}
      <div className="flex gap-4 pt-10 border-t border-slate-200 dark:border-slate-800">
        <button 
          type="submit" 
          disabled={loading}
          className="flex-1 py-4 bg-brand text-white rounded-2xl font-black shadow-lg shadow-brand/20 hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {loading ? 'Sincronizando...' : 'SALVAR ALTERAÇÕES'}
        </button>
      </div>
    </form>
  );
}