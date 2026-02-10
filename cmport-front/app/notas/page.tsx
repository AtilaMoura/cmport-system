"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: 'ASSISTENCIA' | 'MANUTENCAO' | 'OUTROS';
  parcelas: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  condominio_id: number | null;
  criado_em: string;
}

export default function NotasPage() {
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [search, setSearch] = useState('');

  useEffect(() => {
    carregarNotas();
  }, []);

  const carregarNotas = async () => {
    try {
      const response = await api.get('/notas-fiscais/');
      setNotas(response.data);
    } catch (error) {
      console.error('Erro ao carregar notas:', error);
    } finally {
      setLoading(false);
    }
  };

  const notasFiltradas = notas.filter(nota => {
    const matchTipo = filtroTipo === 'todos' || nota.tipo === filtroTipo;
    const matchSearch = 
      nota.numero_nota.toLowerCase().includes(search.toLowerCase()) ||
      (nota.cliente_nome?.toLowerCase().includes(search.toLowerCase()));
    return matchTipo && matchSearch;
  });

  const stats = {
    total: notas.length,
    assistencias: notas.filter(n => n.tipo === 'ASSISTENCIA').length,
    manutencoes: notas.filter(n => n.tipo === 'MANUTENCAO').length,
    valorTotal: notas.reduce((sum, n) => sum + n.valor, 0),
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case 'MANUTENCAO':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return '🔧';
      case 'MANUTENCAO': return '🛠️';
      default: return '📄';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando notas...</p>
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
                <div className="w-2 h-8 bg-orange-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Notas Fiscais
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Gerencie todas as notas fiscais do sistema
              </p>
            </div>
            <Link
              href="/notas/importar"
              className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:brightness-110 transition-all flex items-center gap-2"
            >
              <span className="text-xl">📤</span> Importar XMLs
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl">
                <span className="text-2xl">📄</span>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Notas Emitidas</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                <span className="text-2xl">🔧</span>
              </div>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">NFe</span>
            </div>
            <p className="text-4xl font-black text-blue-600 dark:text-blue-400 mb-1">{stats.assistencias}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Assistências</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
                <span className="text-2xl">🛠️</span>
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">NFSe</span>
            </div>
            <p className="text-4xl font-black text-purple-600 dark:text-purple-400 mb-1">{stats.manutencoes}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Manutenções</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl">
                <span className="text-2xl">💰</span>
              </div>
              <span className="text-xs font-bold text-green-700 dark:text-green-400">TOTAL</span>
            </div>
            <p className="text-4xl font-black text-green-700 dark:text-green-400 mb-1">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorTotal)}
            </p>
            <p className="text-sm text-green-700 dark:text-green-500 font-semibold">Valor Emitido</p>
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
                  placeholder="Buscar por número ou cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFiltroTipo('todos')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'todos'
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroTipo('ASSISTENCIA')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'ASSISTENCIA'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                🔧 Assistência
              </button>
              <button
                onClick={() => setFiltroTipo('MANUTENCAO')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                  filtroTipo === 'MANUTENCAO'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                🛠️ Manutenção
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Notas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Nota Fiscal
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Vencimento
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {notasFiltradas.map((nota) => (
                  <tr key={nota.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                          <span className="text-lg">{getTipoIcon(nota.tipo)}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {nota.numero_nota}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {nota.parcelas > 1 ? `${nota.parcelas}x parcelas` : 'À vista'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(nota.tipo)}`}>
                        {nota.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {nota.cliente_nome || 'Não informado'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-green-600 dark:text-green-400">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nota.valor)}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {new Date(nota.data_vencimento).toLocaleDateString('pt-BR')}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/notas/${nota.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-all group-hover:translate-x-1"
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

          {notasFiltradas.length === 0 && (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <span className="text-3xl">📄</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Nenhuma nota encontrada
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {search || filtroTipo !== 'todos' 
                  ? 'Tente ajustar os filtros de busca'
                  : 'Importe XMLs para começar'
                }
              </p>
              <Link
                href="/notas/importar"
                className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
              >
                <span>📤</span> Importar XMLs
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}