"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  criado_em: string;
}

interface Condominio {
  id: number;
  nome: string;
}

export default function ServicosPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [condominios, setCondominios] = useState<Record<number, Condominio>>({});
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [search, setSearch] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      // Carrega condominios
      const condosRes = await api.get('/condominios/');
      const condosMap: Record<number, Condominio> = {};
      condosRes.data.forEach((c: Condominio) => {
        condosMap[c.id] = c;
      });
      setCondominios(condosMap);

      // Carrega serviços de todos os condomínios
      const servicosPromises = condosRes.data.map((condo: Condominio) =>
        api.get(`/servicos/condominio/${condo.id}`)
          .then(res => res.data)
          .catch(() => [])
      );
      
      const todosServicos = await Promise.all(servicosPromises);
      setServicos(todosServicos.flat());
    } catch (error) {
      console.error('Erro ao carregar serviços:', error);
    } finally {
      setLoading(false);
    }
  };

  const servicosFiltrados = servicos.filter(servico => {
    const matchTipo = filtroTipo === 'todos' || servico.tipo === filtroTipo;
    const nomeCondominio = condominios[servico.condominio_id]?.nome || '';
    const matchSearch = 
      nomeCondominio.toLowerCase().includes(search.toLowerCase()) ||
      (servico.descricao?.toLowerCase().includes(search.toLowerCase()));
    return matchTipo && matchSearch;
  });

  const stats = {
    total: servicos.length,
    manutencoes: servicos.filter(s => s.tipo === 'manutencao').length,
    assistencias: servicos.filter(s => s.tipo === 'assistencia').length,
    esteMes: servicos.filter(s => {
      const dataServico = new Date(s.data_servico);
      const hoje = new Date();
      return dataServico.getMonth() === hoje.getMonth() && 
             dataServico.getFullYear() === hoje.getFullYear();
    }).length,
  };

  const getTipoColor = (tipo: string) => {
    return tipo === 'manutencao'
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
  };

  const getTipoIcon = (tipo: string) => {
    return tipo === 'manutencao' ? '🛠️' : '🔧';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando serviços...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-purple-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Manutenções & Assistências
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Histórico completo de serviços prestados
              </p>
            </div>
            <Link
              href="/servicos/novo"
              className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all flex items-center gap-2"
            >
              <span className="text-xl">+</span> Novo Serviço
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
                <span className="text-2xl">📋</span>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Serviços Realizados</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-500/20 rounded-xl">
                <span className="text-2xl">🛠️</span>
              </div>
              <span className="text-xs font-bold text-purple-700 dark:text-purple-400">PREVENTIVA</span>
            </div>
            <p className="text-4xl font-black text-purple-700 dark:text-purple-400 mb-1">{stats.manutencoes}</p>
            <p className="text-sm text-purple-700 dark:text-purple-500 font-semibold">Manutenções</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-6 rounded-2xl border border-blue-200 dark:border-blue-800/50 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl">
                <span className="text-2xl">🔧</span>
              </div>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-400">CORRETIVA</span>
            </div>
            <p className="text-4xl font-black text-blue-700 dark:text-blue-400 mb-1">{stats.assistencias}</p>
            <p className="text-sm text-blue-700 dark:text-blue-500 font-semibold">Assistências</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl">
                <span className="text-2xl">📅</span>
              </div>
              <span className="text-xs font-bold text-green-700 dark:text-green-400">ESTE MÊS</span>
            </div>
            <p className="text-4xl font-black text-green-700 dark:text-green-400 mb-1">{stats.esteMes}</p>
            <p className="text-sm text-green-700 dark:text-green-500 font-semibold">Serviços</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por condomínio ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFiltroTipo('todos')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'todos'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroTipo('manutencao')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'manutencao'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                🛠️ Manutenção
              </button>
              <button
                onClick={() => setFiltroTipo('assistencia')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'assistencia'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                🔧 Assistência
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Condomínio
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {servicosFiltrados.map((servico) => (
                  <tr key={servico.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                          <span className="text-sm font-bold">
                            {condominios[servico.condominio_id]?.nome.substring(0, 2).toUpperCase() || '??'}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {condominios[servico.condominio_id]?.nome || 'Desconhecido'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            ID: {servico.condominio_id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(servico.tipo)}`}>
                        <span>{getTipoIcon(servico.tipo)}</span>
                        {servico.tipo === 'manutencao' ? 'Manutenção' : 'Assistência'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(servico.data_servico).toLocaleDateString('pt-BR')}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-md">
                        {servico.descricao || 'Sem descrição'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/servicos/${servico.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all group-hover:translate-x-1"
                      >
                        Ver detalhes
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {servicosFiltrados.length === 0 && (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <span className="text-3xl">🛠️</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Nenhum serviço encontrado
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {search || filtroTipo !== 'todos'
                  ? 'Tente ajustar os filtros de busca'
                  : 'Importe notas fiscais para registrar serviços automaticamente'
                }
              </p>
              <Link
                href="/notas/importar"
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
              >
                <span>📤</span> Importar Notas
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}