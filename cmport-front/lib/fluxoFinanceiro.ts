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
  nota_id: number | null;      // nota fiscal vinculada (só BOLETO) — pra navegação
  servico_id: number | null;   // 1º serviço vinculado, se houver
  // atribuição cross-empresa: a linha está neste CNPJ porque o dinheiro caiu na
  // conta dele, mas a nota/recibo foi emitida por outro CNPJ.
  cnpj_emitente_nota: string | null;
  empresa_emitente_nota: string | null;  // "CMPORT" | "TEC" | null
  cross_cnpj: boolean;                    // true: recebido em conta de outro CNPJ
  observacao: string | null;             // obs do boleto/recibo (motivo do cross)
}
export interface FluxoFinanceiroCnpj {
  cnpj: string;
  razao_social: string | null;
  total_manutencao: number;
  total_assistencia: number;
  total_produto: number;
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

export interface AlertaNotaSemBoleto {
  nota_id: number;
  numero_nota: string;
  condominio_id: number | null;
  condominio_nome: string;
  tipo: string;
  valor: number;
  data_vencimento: string;
  cnpj_emitente: string | null;
  possivel_falta_vinculo: boolean;
}

export interface AlertaNotaSemServico {
  nota_id: number;
  numero_nota: string;
  condominio_id: number | null;
  condominio_nome: string;
  tipo: string;
  valor: number;
  data_vencimento: string;
  cnpj_emitente: string | null;
}

export interface AlertaParcelaFaltando {
  nota_id: number;
  numero_nota: string;
  condominio_id: number | null;
  condominio_nome: string;
  tipo: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  origem_data: 'corpo' | 'nota' | 'estimado';
  cnpj_emitente: string | null;
}
export interface PendenciaLinha {
  origem_id: number;
  origem: string;
  condominio_id: number | null;
  condominio_nome: string;
  numero_nota: string;
  numero_parcela: number;
  total_parcelas: number;
  tipo: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  situacao: string;
  valor_recebido?: number | null;
  valor_pendente: number;
  nota_id?: number | null;       // nota fiscal vinculada (só origem BOLETO)
  servico_id?: number | null;    // 1º serviço vinculado à nota, se houver
  cnpj_emitente?: string | null;
  empresa?: string | null;       // "CMPORT" | "TEC" | null
}
export interface PendenciasResponse {
  ano: number;
  mes: number;
  total: number;
  total_pago: number;
  total_pendente: number;
  linhas: PendenciaLinha[];
}

// ── Movimentações (Transferências Internas, Despesas, Fornecedores) ─────────
export interface CategoriaFinanceira {
  id: number;
  nome: string;
  grupo: string;
  tipo: string;
}
export interface ServicoVinculado {
  id: number;
  tipo: string;
  numero_os: string | null;
  numero_nota: string | null;
  data_servico: string;
  descricao: string | null;
  condominio_nome: string | null;
}
export interface OrcamentoVinculado {
  id: number;
  auvo_public_id: number;
  customer_name: string | null;
  net_total_value: number | null;
  request_date: string | null;
}
export interface OsFornecedorReferencia {
  id: number;
  task_id: number;
  task_date: string | null;
  report: string | null;
  orientation: string | null;
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
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  forma_pagamento: string | null;
  servicos_vinculados: ServicoVinculado[];
  orcamentos_vinculados: OrcamentoVinculado[];
  os_fornecedor_vinculadas: OsFornecedorReferencia[];
}

export const FORMAS_PAGAMENTO = ['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'TRANSFERENCIA', 'CHEQUE', 'BOLETO_ITAU', 'BOLETO_INTER'];
export const FORMA_LABEL: Record<string, string> = {
  BOLETO_INTER: 'Boleto Inter', BOLETO_ITAU: 'Boleto Itaú', PIX: 'PIX',
  DINHEIRO: 'Dinheiro', CARTAO_DEBITO: 'Cartão de débito', TRANSFERENCIA: 'Transferência', CHEQUE: 'Cheque',
};
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

// ── Dashboard "por banco" / Conciliação bancária ────────────────────────────
export interface EntradasBreakdown { boleto: number; recibo: number; avulso: number; }
export interface SaidasBreakdown { fornecedor: number; despesa: number; funcionario: number; tarifa: number; }
export interface DashboardBancoLinha {
  banco_id: number | null;
  banco_nome: string;
  empresa: string | null;                 // "CMPORT" | "TEC"
  saldo_inicial: number | null;
  saldo_inicial_informado: boolean;
  entradas: EntradasBreakdown;
  entradas_total: number;
  transf_recebidas: number;
  transf_enviadas: number;
  rendimento: number;
  saidas: SaidasBreakdown;
  saidas_total: number;
  saldo_calculado: number | null;
  saldo_extrato: number | null;
  saldo_extrato_fonte: string | null;     // "MANUAL" | "INTER"
  diferenca: number | null;
  bate: boolean | null;
}
export interface DashboardPorBancoResponse {
  ano: number;
  mes: number;
  bancos: DashboardBancoLinha[];
  consolidado: DashboardBancoLinha;
}
export interface SaldoInicialBancoLinha {
  banco_id: number;
  banco_nome: string;
  empresa: string | null;
  valor: number;
  informado: boolean;
  observacao: string | null;
}
export interface SaldoInicialPorBancoResponse {
  ano: number; mes: number; linhas: SaldoInicialBancoLinha[]; total: number;
}
export interface ExtratoSaldoBancoLinha {
  banco_id: number;
  banco_nome: string;
  empresa: string | null;
  saldo_final: number | null;
  fonte: string | null;
  conferido_em: string | null;
  observacao: string | null;
}
export interface ExtratoSaldoPorBancoResponse {
  ano: number; mes: number; linhas: ExtratoSaldoBancoLinha[];
}
export interface ImportarInterItem {
  banco_id: number; banco_nome: string; status: string; saldo_final: number | null;
}
export interface ImportarInterResponse {
  importados: number; mensagem: string; detalhes: ImportarInterItem[];
}

export const TIPO_CLS: Record<string, string> = {
  MANUTENCAO:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  ASSISTENCIA: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  RECIBO:      'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
  PRODUTO:     'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400',
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

export interface DespesaParcela {
  id: number;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: string;
  status: string;
  data_pagamento: string | null;
  banco_id: number | null;
  forma_pagamento: string | null;
  movimentacao_id: number | null;
}
export interface Despesa {
  id: number;
  descricao: string;
  categoria_id: number | null;
  fornecedor_id: number | null;
  cnpj: string;
  banco_previsto_id: number | null;
  tipo_pagamento: string;
  valor_total: number;
  total_parcelas: number;
  dia_vencimento: number | null;
  ativo: boolean;
  observacao: string | null;
  criado_em: string;
  parcelas: DespesaParcela[];
}
