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
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  complemento: string;
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
  const [searchingCep, setSearchingCep] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    razao_social: '',
    cnpj: '',
    ativo: true,
    observacao: '',
    endereco: {
      cep: '',
      rua: '',
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      complemento: '',
      latitude: null,
      longitude: null
    },
    contatos: [
      { nome: '', telefone: '', email: '', funcao: 'Síndico', principal: true }
    ]
  });

  const fetchCoordinates = async (logradouro: string, cidade: string) => {
    try {
      const query = encodeURIComponent(`${logradouro}, ${cidade}, Brasil`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await response.json();
      console.log(data)
      if (data && data.length > 0) {
        setFormData(prev => ({
          ...prev,
          endereco: {
            ...prev.endereco,
            latitude: data[0].lat,
            longitude: data[0].lon
          }
        }));
      }
    } catch (err) {
      console.error("Erro ao obter coordenadas:", err);
    }
  };

  // Função para buscar endereço via CEP
  const handleCepBlur = async () => {
    const cleanCep = formData.endereco.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setSearchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          endereco: {
            ...prev.endereco,
            rua: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            estado: data.uf,
            complemento: data.complemento || ''
          }
        }));
        setError('');

        fetchCoordinates(data.logradouro, data.localidade);
      } else {
        setError('CEP não encontrado.');
      }

    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
      setError('Erro ao buscar o CEP.');
    } finally {
      setSearchingCep(false);
    }
  };

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
      const condominioResponse = await api.post('/condominios', {
        nome: formData.nome,
        razao_social: formData.razao_social,
        cnpj: formData.cnpj,
        ativo: formData.ativo,
        observacao: formData.observacao
      });

      const condominioId = condominioResponse.data.id;

      // 2. Criar endereço se CEP ou rua estiverem preenchidos
      if (formData.endereco.cep || formData.endereco.rua) {
        await api.post('/enderecos', {
          condominio_id: condominioId,
          cep: formData.endereco.cep || null,
          rua: formData.endereco.rua || null,
          numero: formData.endereco.numero || null,
          bairro: formData.endereco.bairro || null,
          cidade: formData.endereco.cidade || null,
          estado: formData.endereco.estado || null,
          complemento: formData.endereco.complemento || null,
          latitude: formData.endereco.latitude,
          longitude: formData.endereco.longitude
        });
      }

      // 3. Criar contatos
      for (const contato of formData.contatos) {
        if (contato.nome) {
          await api.post('/contatos', {
            condominio_id: condominioId,
            nome: contato.nome,
            telefone: contato.telefone || null,
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
    <form onSubmit={handleSubmit} className="space-y-8 lg:space-y-12">
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

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* CEP */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">CEP</label>
            <div className="relative">
              <input 
                placeholder="00000-000"
                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono focus:ring-2 ring-blue-600/20 outline-none transition-all"
                value={formData.endereco.cep}
                onChange={e => setFormData({...formData, endereco: {...formData.endereco, cep: e.target.value}})}
                onBlur={handleCepBlur}
              />
              {searchingCep && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </div>

          {/* Logradouro */}
          <div className="md:col-span-3 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Logradouro (Rua)</label>
            <input 
              placeholder="Nome da rua"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.rua}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, rua: e.target.value}})}
            />
          </div>

          {/* Número */}
          <div className="md:col-span-1 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nº</label>
            <input 
              placeholder="123"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.numero}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, numero: e.target.value}})}
            />
          </div>

          {/* Bairro */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Bairro</label>
            <input 
              placeholder="Nome do bairro"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.bairro}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, bairro: e.target.value}})}
            />
          </div>

          {/* Cidade */}
          <div className="md:col-span-3 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Cidade</label>
            <input 
              placeholder="Nome da cidade"
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.cidade}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, cidade: e.target.value}})}
            />
          </div>

          {/* UF */}
          <div className="md:col-span-1 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">UF</label>
            <input 
              placeholder="SP"
              maxLength={2}
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 uppercase text-center focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.estado}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, estado: e.target.value.toUpperCase()}})}
            />
          </div>

          {/* Complemento */}
          <div className="md:col-span-6 space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Complemento</label>
            <input 
              placeholder="Apto, Bloco, etc."
              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 ring-blue-600/20 outline-none transition-all"
              value={formData.endereco.complemento}
              onChange={e => setFormData({...formData, endereco: {...formData.endereco, complemento: e.target.value}})}
            />
          </div>
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
            <div key={index} className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-3xl">
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

      <div className="pt-4 sm:pt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Link
          href="/condominios"
          className="flex-1 py-3 sm:py-5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-[1.5rem] font-black text-base sm:text-lg text-center hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
        >
          CANCELAR
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 sm:py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-base sm:text-lg shadow-xl shadow-blue-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'CRIANDO...' : 'FINALIZAR CADASTRO'}
        </button>
      </div>
    </form>
  );
}

export default function NovoCondominioPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
              <span className="text-xl sm:text-2xl">+</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Novo Condomínio</h1>
              <p className="text-slate-500 font-medium italic text-xs sm:text-sm">Inicie o onboarding de uma nova unidade na base CMPort</p>
            </div>
          </div>
          <Link
            href="/condominios"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>
        </div>

        {/* Container do Formulário */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm overflow-hidden p-4 sm:p-8 md:p-12">
          <FormNovoCondominio />
        </div>
      </div>
    </div>
  );
}