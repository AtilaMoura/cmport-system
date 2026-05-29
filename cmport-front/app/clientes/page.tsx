"use client"

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Cliente {
  id: number;
  nome: string;
  tipo: string;
  cpf_cnpj: string | null;
  apartamento: string | null;
  email: string | null;
  telefone: string | null;
  observacao: string | null;
  ativo: boolean;
  condominio_id: number | null;
  condominio_nome: string | null;
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState(true);
  const [deletando, setDeletando] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = async (q?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string | boolean> = { apenas_ativos: filtroAtivo };
      if (q) params.busca = q;
      const r = await api.get('/clientes', { params });
      setClientes(r.data);
    } catch { setClientes([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, [filtroAtivo]);

  const onBusca = (v: string) => {
    setBusca(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => carregar(v || undefined), 350);
  };

  const deletar = async (id: number, nome: string) => {
    if (!confirm(`Remover "${nome}"?`)) return;
    setDeletando(id);
    try {
      await api.delete(`/clientes/${id}`);
      await carregar(busca || undefined);
    } catch { alert('Erro ao remover cliente.'); }
    finally { setDeletando(null); }
  };

  const filtrados = filtroTipo
    ? clientes.filter(c => c.tipo === filtroTipo)
    : clientes;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Clientes</h1>
              <p className="text-xs text-slate-500 mt-0.5">Moradores e empresas — PF e PJ</p>
            </div>
            <Link href="/clientes/novo"
              className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
              + Novo Cliente
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{filtrados.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">PF</div>
            <div className="text-2xl font-black text-violet-700 dark:text-violet-400">
              {filtrados.filter(c => c.tipo === 'PF').length}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">PJ</div>
            <div className="text-2xl font-black text-violet-700 dark:text-violet-400">
              {filtrados.filter(c => c.tipo === 'PJ').length}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={busca}
              onChange={e => onBusca(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ..."
              className="flex-1 min-w-48 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              <option value="">Todos os tipos</option>
              <option value="PF">Pessoa Física</option>
              <option value="PJ">Pessoa Jurídica</option>
            </select>
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800">
              <input type="checkbox" checked={filtroAtivo} onChange={e => setFiltroAtivo(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-semibold">Apenas ativos</span>
            </label>
          </div>
        </div>

        {/* Lista */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">👥</div>
              <p className="font-semibold text-slate-700 dark:text-white">Nenhum cliente encontrado</p>
              <p className="text-sm text-slate-500 mt-1">
                {busca ? `Sem resultados para "${busca}"` : 'Cadastre o primeiro cliente.'}
              </p>
              <Link href="/clientes/novo"
                className="mt-4 inline-block px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors">
                + Novo Cliente
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map(c => (
                <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-violet-100 dark:bg-violet-500/20 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-lg">{c.tipo === 'PJ' ? '🏢' : '👤'}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900 dark:text-white">{c.nome}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        c.tipo === 'PJ'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                      }`}>{c.tipo}</span>
                      {!c.ativo && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                      {c.cpf_cnpj && <span>{c.cpf_cnpj}</span>}
                      {c.apartamento && <span>Apto {c.apartamento}</span>}
                      {c.telefone && <span>{c.telefone}</span>}
                      {c.email && <span className="truncate max-w-40">{c.email}</span>}
                    </div>
                    {c.condominio_nome && (
                      <div className="text-xs text-violet-600 dark:text-violet-400 font-semibold mt-0.5 truncate">
                        🏛 {c.condominio_nome}
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/recibos/novo?cliente_id=${c.id}&condominio_id=${c.condominio_id ?? ''}`}
                      className="px-2.5 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors">
                      + Recibo
                    </Link>
                    <Link href={`/clientes/${c.id}/editar`}
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                      Editar
                    </Link>
                    <button onClick={() => deletar(c.id, c.nome)} disabled={deletando === c.id}
                      className="px-2.5 py-1.5 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50">
                      {deletando === c.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
