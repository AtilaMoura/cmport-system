// Tipos e helpers compartilhados entre /fluxo-financeiro e suas subpáginas

export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtData(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function fmtCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// ── Entrada de Serviços (notas/boletos/recibos) ──────────────────────────────
export interface FluxoFinanceiroLinha {
  origem_id: number;
  condominio_id: number | null;
  condominio_nome: string;
  numero_nota: string;
  numero_nota_normalizado: string;
  tipo: string;
  valor: number;
  data_pagamento: string;
  origem: string;
  banco_id: number | null;
  banco_nome: string | null;
}
export interface FluxoFinanceiroCnpj {
  cnpj: string;
  razao_social: string | null;
  total_manutencao: number;
  total_assistencia: number;
  total_recibos: number;
  total_geral: number;
  linhas: FluxoFinanceiroLinha[];
}
export interface FluxoFinanceiroResponse {
  ano: number;
  mes: number;
  cnpjs: FluxoFinanceiroCnpj[];
  total_geral: number;
}
export interface AlertaDuplicata {
  condominio_id: number | null;
  condominio_nome: string;
  nota_id_1: number;
  nota_id_2: number;
  numero_nota_1: string;
  numero_nota_2: string;
  valor: number;
  data_pagamento_1: string;
  data_pagamento_2: string;
}

// ── Movimentações (Transferências Internas, Despesas, Fornecedores) ─────────
export interface CategoriaFinanceira {
  id: number;
  nome: string;
  grupo: string;
  tipo: string;
}
export interface Movimentacao {
  id: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  categoria_id: number | null;
  categoria: CategoriaFinanceira | null;
  origem: string;
  status: string;
  observacao: string | null;
  banco_id: number | null;
  banco_nome: string | null;
  banco_origem_id: number | null;
  banco_origem_nome: string | null;
}
export interface DashboardFinanceiro {
  mes: number;
  ano: number;
  saldo_inicial: number;
  entradas: number;
  fornecedores: number;
  despesas: number;
  saidas: number;
  saldo_mes: number;
  saldo_acumulado: number;
}

export const TIPO_CLS: Record<string, string> = {
  MANUTENCAO:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  ASSISTENCIA: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  RECIBO:      'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
};

export function agruparPorCategoria(movs: Movimentacao[]) {
  const grupos = new Map<string, { nome: string; total: number; itens: Movimentacao[] }>();
  for (const m of movs) {
    const nome = m.categoria?.nome ?? 'Sem categoria';
    if (!grupos.has(nome)) grupos.set(nome, { nome, total: 0, itens: [] });
    const g = grupos.get(nome)!;
    g.total += m.valor;
    g.itens.push(m);
  }
  return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
}

export function agruparPorBanco(movs: Movimentacao[]) {
  const grupos = new Map<string, { nome: string; total: number; itens: Movimentacao[] }>();
  for (const m of movs) {
    const nome = m.banco_nome ?? 'Sem banco';
    if (!grupos.has(nome)) grupos.set(nome, { nome, total: 0, itens: [] });
    const g = grupos.get(nome)!;
    g.total += m.valor;
    g.itens.push(m);
  }
  return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
}

export function agruparLinhasPorBanco<T extends { banco_nome: string | null; valor: number }>(linhas: T[]) {
  const grupos = new Map<string, { nome: string; total: number; itens: T[] }>();
  for (const l of linhas) {
    const nome = l.banco_nome ?? 'Sem banco';
    if (!grupos.has(nome)) grupos.set(nome, { nome, total: 0, itens: [] });
    const g = grupos.get(nome)!;
    g.total += l.valor;
    g.itens.push(l);
  }
  return Array.from(grupos.values()).sort((a, b) => b.total - a.total);
}
