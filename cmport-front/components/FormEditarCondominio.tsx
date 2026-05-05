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
    const novo = { nome: '', telefone: '', email: '', funcao: 'Outro', principal: false, receber_boleto: true };
    setFormData({ ...formData, contatos: [...formData.contatos, novo] });
  };

  const removeContato = (index: number) => {
    const novos = formData.contatos.filter((_: any, i: number) => i !== index);
    setFormData({ ...formData, contatos: novos });
  };

  const updateContato = (index: number, field: string, value: string | boolean) => {
    const novos = [...formData.contatos];
    // Converte string "true"/"false" para boolean quando necessário
    const parsed = value === 'true' ? true : value === 'false' ? false : value;
    novos[index] = { ...novos[index], [field]: parsed };
    setFormData({ ...formData, contatos: novos });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/condominios/${initialData.id}`, {
        nome: formData.nome,
        cnpj: formData.cnpj,
        razao_social: formData.razao_social,
        observacao: formData.observacao,
        ativo: formData.ativo,
      });

      if (formData.endereco) {
        await api.post('/enderecos', {
          condominio_id: initialData.id,
          rua: formData.endereco.rua || null,
          numero: formData.endereco.numero || null,
          bairro: formData.endereco.bairro || null,
          cidade: formData.endereco.cidade || null,
          estado: formData.endereco.estado || null,
          cep: formData.endereco.cep || null,
          complemento: formData.endereco.complemento || null,
          latitude: formData.endereco.latitude || null,
          longitude: formData.endereco.longitude || null,
        });
      }

      // Sincroniza contatos: atualiza existentes, cria novos, remove deletados
      const idsIniciais: Set<number> = new Set(
        (initialData.contatos || []).map((c: any) => c.id).filter(Boolean)
      );
      const idsAtuais: Set<number> = new Set(
        formData.contatos.map((c: any) => c.id).filter(Boolean)
      );

      for (const id of idsIniciais) {
        if (!idsAtuais.has(id)) {
          await api.delete(`/contatos/${id}`);
        }
      }

      for (const contato of formData.contatos) {
        const payload = {
          nome: contato.nome,
          telefone: contato.telefone || null,
          email: contato.email || null,
          funcao: contato.funcao || null,
          principal: contato.principal ?? false,
          receber_boleto: contato.receber_boleto ?? true,
        };
        if (contato.id) {
          await api.put(`/contatos/${contato.id}`, payload);
        } else if (contato.nome) {
          await api.post('/contatos', { condominio_id: initialData.id, ...payload });
        }
      }

      router.push(`/condominios/${initialData.id}`);
      router.refresh();
    } catch (error) {
      alert("Erro ao salvar alterações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 lg:space-y-10">
      
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Rua / Logradouro</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              value={formData.endereco?.rua || ''}
              onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, rua: e.target.value } })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Número</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              value={formData.endereco?.numero || ''}
              onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, numero: e.target.value } })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Bairro</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              value={formData.endereco?.bairro || ''}
              onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, bairro: e.target.value } })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Cidade</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              value={formData.endereco?.cidade || ''}
              onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, cidade: e.target.value } })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Estado</label>
              <input
                maxLength={2}
                placeholder="SP"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 uppercase"
                value={formData.endereco?.estado || ''}
                onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, estado: e.target.value.toUpperCase() } })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">CEP</label>
              <input
                placeholder="00000-000"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono"
                value={formData.endereco?.cep || ''}
                onChange={(e) => setFormData({ ...formData, endereco: { ...formData.endereco, cep: e.target.value } })}
              />
            </div>
          </div>
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
            <div key={index} className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl relative group">
              <button
                type="button"
                onClick={() => removeContato(index)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-sm font-semibold"
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
              {/* Toggle receber boleto */}
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateContato(index, 'receber_boleto', String(!(contato.receber_boleto ?? true)))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    (contato.receber_boleto ?? true) ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    (contato.receber_boleto ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  📧 Recebe email
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOTÕES DE AÇÃO */}
      <div className="flex gap-4 pt-6 sm:pt-10 border-t border-slate-200 dark:border-slate-800">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 sm:py-4 bg-brand text-white rounded-2xl font-black shadow-lg shadow-brand/20 hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {loading ? 'Sincronizando...' : 'SALVAR ALTERAÇÕES'}
        </button>
      </div>
    </form>
  );
}