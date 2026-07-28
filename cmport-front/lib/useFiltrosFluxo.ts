"use client"

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

// Le ano/mes/cnpj da URL (?ano=&mes=&cnpj=) e escreve de volta via router.replace,
// pra filtro ficar consistente ao navegar entre as subpaginas do /fluxo-financeiro.
export function useFiltrosFluxo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = new Date();
  const ano = Number(searchParams.get('ano')) || now.getFullYear();
  const mes = Number(searchParams.get('mes')) || now.getMonth() + 1;
  const cnpjFiltro = searchParams.get('cnpj') ?? '';

  const atualizar = useCallback((novo: { ano?: number; mes?: number; cnpj?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (novo.ano !== undefined) params.set('ano', String(novo.ano));
    if (novo.mes !== undefined) params.set('mes', String(novo.mes));
    if (novo.cnpj !== undefined) {
      if (novo.cnpj) params.set('cnpj', novo.cnpj);
      else params.delete('cnpj');
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return {
    ano, mes, cnpjFiltro,
    setAno: (v: number) => atualizar({ ano: v }),
    setMes: (v: number) => atualizar({ mes: v }),
    setCnpjFiltro: (v: string) => atualizar({ cnpj: v }),
  };
}
