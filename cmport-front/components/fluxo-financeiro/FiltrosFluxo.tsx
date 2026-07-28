"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MESES } from '@/lib/fluxoFinanceiro';

const SUBPAGINAS = [
  { label: 'Visão Geral',           href: '/fluxo-financeiro' },
  { label: 'Entrada de Serviços',   href: '/fluxo-financeiro/entrada' },
  { label: 'Transferências',        href: '/fluxo-financeiro/transferencias' },
  { label: 'Despesas',              href: '/fluxo-financeiro/despesas' },
  { label: 'Fornecedores',          href: '/fluxo-financeiro/fornecedores' },
];

interface Props {
  ano: number;
  mes: number;
  cnpjFiltro?: string;
  onAnoChange: (v: number) => void;
  onMesChange: (v: number) => void;
  onCnpjChange?: (v: string) => void;
  mostrarFiltroCnpj?: boolean;
}

export function FiltrosFluxo({ ano, mes, cnpjFiltro, onAnoChange, onMesChange, onCnpjChange, mostrarFiltroCnpj }: Props) {
  const pathname = usePathname();
  const qs = `?ano=${ano}&mes=${mes}`;

  return (
    <div className="space-y-3">
      {/* Sub-navegação */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
        {SUBPAGINAS.map(sp => {
          const ativo = pathname === sp.href;
          return (
            <Link key={sp.href} href={`${sp.href}${qs}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                ativo
                  ? 'bg-blue-900 text-white dark:bg-blue-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}>
              {sp.label}
            </Link>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input type="number" value={ano} onChange={e => onAnoChange(Number(e.target.value))} min={2020} max={2099}
            className="w-24 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          <select value={mes} onChange={e => onMesChange(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          {mostrarFiltroCnpj && onCnpjChange && (
            <div className="flex gap-1 ml-2">
              {[
                { label: 'Ambos CNPJ', value: '' },
                { label: 'CMPORT', value: '22761557000188' },
                { label: 'CMPORT TEC', value: '65756913000188' },
              ].map(opt => (
                <button key={opt.value} onClick={() => onCnpjChange(opt.value)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                    cnpjFiltro === opt.value
                      ? 'bg-blue-900 text-white dark:bg-blue-500'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
