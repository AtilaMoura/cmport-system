// lib/demandas.ts — tipos e helpers do módulo Demandas Dev (canal Atila ↔ CMPort)

export type Autor = 'ATILA' | 'ALMIRA' | 'FABIANA';
export type Lado = 'ATILA' | 'CMPORT';
export type TipoItem = 'DEMANDA' | 'NOTA';
export type StatusItem =
  | 'ABERTA'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_CMPORT'
  | 'AGUARDANDO_ATILA'
  | 'RESOLVIDA'
  | 'DESCARTADA';
export type Prioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export const AUTORES: Autor[] = ['ATILA', 'ALMIRA', 'FABIANA'];

export const ladoDoAutor = (a: Autor): Lado => (a === 'ATILA' ? 'ATILA' : 'CMPORT');

export const STATUS_LABEL: Record<StatusItem, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CMPORT: 'Aguardando CMPort',
  AGUARDANDO_ATILA: 'Aguardando Atila',
  RESOLVIDA: 'Resolvida',
  DESCARTADA: 'Descartada',
};

export const STATUS_CLASSE: Record<StatusItem, string> = {
  ABERTA: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  EM_ANDAMENTO: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  AGUARDANDO_CMPORT: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  AGUARDANDO_ATILA: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
  RESOLVIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  DESCARTADA: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

// Só as transições que fazem sentido escolher manualmente (RESOLVIDA/DESCARTADA têm botão próprio)
export const STATUS_ESCOLHIVEIS: StatusItem[] = [
  'ABERTA',
  'EM_ANDAMENTO',
  'AGUARDANDO_CMPORT',
  'AGUARDANDO_ATILA',
];

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const PRIORIDADE_CLASSE: Record<Prioridade, string> = {
  BAIXA: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  NORMAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ALTA: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  URGENTE: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
};

export const AUTOR_EMOJI: Record<Autor, string> = {
  ATILA: '🧑‍💻',
  ALMIRA: '👤',
  FABIANA: '👤',
};

export const ENCERRADOS: StatusItem[] = ['RESOLVIDA', 'DESCARTADA'];

export interface Anexo {
  id: number;
  item_id: number;
  comentario_id: number | null;
  nome_arquivo: string;
  content_type: string | null;
  tamanho: number | null;
  enviado_por: Autor;
  enviado_em: string;
}

export interface Comentario {
  id: number;
  item_id: number;
  autor: Autor;
  texto: string | null;
  reacao: string | null;
  criado_em: string;
  anexos: Anexo[];
}

export interface Item {
  id: number;
  codigo: string | null;
  tipo: TipoItem;
  titulo: string | null;
  descricao: string | null;
  autor: Autor;
  status: StatusItem;
  prioridade: Prioridade;
  resolucao_texto: string | null;
  commit_ref: string | null;
  motivo_descarte: string | null;
  data_abertura: string;
  data_resolucao: string | null;
  visto_atila: boolean;
  visto_cmport: boolean;
  arquivado: boolean;
  criado_em: string | null;
  atualizado_em: string | null;
  anexos: Anexo[];
  comentarios: Comentario[];
}

export interface ItemLista {
  id: number;
  codigo: string | null;
  tipo: TipoItem;
  titulo: string | null;
  descricao_preview: string | null;
  autor: Autor;
  status: StatusItem;
  prioridade: Prioridade;
  data_abertura: string;
  data_resolucao: string | null;
  atualizado_em: string | null;
  ultima_atividade: string;
  visto_atila: boolean;
  visto_cmport: boolean;
  arquivado: boolean;
  qtd_anexos: number;
  qtd_comentarios: number;
}

export interface Resumo {
  novidades_atila: number;
  novidades_cmport: number;
  demandas_abertas: number;
  aguardando_atila: number;
  aguardando_cmport: number;
}

export interface RelatorioItem {
  codigo: string | null;
  tipo: TipoItem;
  titulo: string | null;
  descricao: string | null;
  autor: Autor;
  status: StatusItem;
  prioridade: Prioridade;
  data_abertura: string;
  data_resolucao: string | null;
  resolucao_texto: string | null;
  commit_ref: string | null;
  motivo_descarte: string | null;
}

export interface Relatorio {
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_resolvidas: number;
  total_descartadas: number;
  itens: RelatorioItem[];
}

// ── "Estou como" — persiste no localStorage ──────────────────────────────────

const CHAVE_AUTOR = 'demandas_dev_autor';

export function getAutorAtual(): Autor {
  if (typeof window === 'undefined') return 'ATILA';
  try {
    const v = window.localStorage.getItem(CHAVE_AUTOR);
    if (v === 'ATILA' || v === 'ALMIRA' || v === 'FABIANA') return v;
  } catch {
    /* localStorage indisponível */
  }
  return 'ATILA';
}

export function setAutorAtual(a: Autor): void {
  try {
    window.localStorage.setItem(CHAVE_AUTOR, a);
  } catch {
    /* ignore */
  }
}

// ── Formatação ───────────────────────────────────────────────────────────────

export function fmtData(dt: string | null): string {
  if (!dt) return '—';
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDataHora(dt: string | null): string {
  if (!dt) return '—';
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtTamanho(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
