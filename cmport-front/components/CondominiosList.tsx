"use client"

import { useState } from 'react'
import Link from 'next/link'

interface Condominio {
  id: number;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  razao_social: string | null;
}

export function CondominiosList({ initialData }: { initialData: Condominio[] }) {
  const [search, setSearch] = useState('')

  const filteredCondos = initialData.filter(condo =>
    condo.nome.toLowerCase().includes(search.toLowerCase()) ||
    (condo.cnpj && condo.cnpj.includes(search))
  )

  return (
    <div className="space-y-4 lg:space-y-6 pb-12">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm hover:shadow-md"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="px-4 py-3.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* ── Cards mobile (< md) ── */}
      <div className="md:hidden space-y-3">
        {filteredCondos.map((condo) => (
          <div
            key={condo.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                <span className="text-white font-bold text-sm">
                  {condo.nome.substring(0, 2).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {condo.nome}
                  </p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                    condo.ativo
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${condo.ativo ? 'bg-green-600' : 'bg-red-600'}`} />
                    {condo.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate mb-1">
                  {condo.razao_social || 'Sem razão social'}
                </p>
                {condo.cnpj && (
                  <p className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    {condo.cnpj}
                  </p>
                )}
              </div>
            </div>

            {/* Ação */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Link
                href={`/condominios/${condo.id}`}
                className="flex items-center justify-end gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400"
              >
                Ver detalhes
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabela desktop (md+) ── */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4 text-left">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Condomínio</span>
                </th>
                <th className="px-6 py-4 text-left">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">CNPJ</span>
                </th>
                <th className="px-6 py-4 text-left">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</span>
                </th>
                <th className="px-6 py-4 text-right">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCondos.map((condo) => (
                <tr
                  key={condo.id}
                  className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">
                          {condo.nome.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{condo.nome}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {condo.razao_social || 'Sem razão social'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
                      {condo.cnpj || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                      condo.ativo
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${condo.ativo ? 'bg-green-600' : 'bg-red-600'}`} />
                      {condo.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Link
                      href={`/condominios/${condo.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all group-hover:translate-x-1"
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

        {/* Empty State (tabela) */}
        {filteredCondos.length === 0 && (
          <div className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhum resultado encontrado</h3>
            <p className="text-slate-500 dark:text-slate-400">
              Não encontramos condomínios com o termo &quot;{search}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Empty State (cards mobile) */}
      {filteredCondos.length === 0 && (
        <div className="md:hidden py-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-3 bg-slate-100 dark:bg-slate-800 rounded-full">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Nenhum resultado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum condomínio com &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  )
}
