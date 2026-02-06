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

  // Lógica de filtro em tempo real
  const filteredCondos = initialData.filter(condo => 
    condo.nome.toLowerCase().includes(search.toLowerCase()) || 
    (condo.cnpj && condo.cnpj.includes(search))
  )

  return (
    <>
      {/* Barra de Filtro */}
      <div className="mb-6">
        <input 
          type="text" 
          placeholder="Buscar por nome ou CNPJ..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-96 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-2 ring-brand outline-none transition-all"
        />
      </div>

      {/* Tabela de Listagem */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-sm">
              <th className="p-4 font-semibold">Nome / Razão Social</th>
              <th className="p-4 font-semibold">CNPJ</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredCondos.map((condo) => (
              <tr key={condo.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="p-4">
                  <div className="font-bold text-slate-900 dark:text-slate-100">{condo.nome}</div>
                  <div className="text-xs text-slate-500 truncate max-w-xs">{condo.razao_social || '---'}</div>
                </td>
                <td className="p-4 font-mono text-sm">{condo.cnpj || '---'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    condo.ativo 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {condo.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <Link href={`/condominios/${condo.id}`} className="text-brand font-medium hover:underline text-sm">
                    Ver detalhes →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCondos.length === 0 && (
          <div className="p-10 text-center text-slate-500">Nenhum resultado para {search}</div>
        )}
      </div>
    </>
  )
}