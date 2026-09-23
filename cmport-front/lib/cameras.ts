// lib/cameras.ts — tipos e chamadas do módulo Câmeras (postes + câmeras)
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';

export type TipoConexao = 'RTMP_ISOLADA' | 'RTSP_NVR';

export interface Poste {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  nome: string;
  observacao: string | null;
  ativo: boolean;
  total_cameras: number;
}

export interface Camera {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  poste_id: number | null;
  poste_nome: string | null;
  nome: string;
  tipo_conexao: TipoConexao;
  canal: number | null;
  nvr_ip: string | null;
  nvr_porta: number | null;
  nvr_usuario: string | null;
  rtmp_stream_key: string | null;
  rtmp_url: string | null;
  ativo: boolean;
  // null = status desconhecido (RTSP ou servidor de vídeo sem resposta)
  online: boolean | null;
}

export interface PosteForm {
  condominio_id: number;
  nome: string;
  observacao?: string | null;
}

export interface CameraForm {
  condominio_id: number;
  poste_id: number | null;
  nome: string;
  tipo_conexao: TipoConexao;
  canal?: number | null;
  nvr_ip?: string | null;
  nvr_porta?: number | null;
  nvr_usuario?: string | null;
  nvr_senha?: string | null;
}

export const TIPO_LABEL: Record<TipoConexao, string> = {
  RTMP_ISOLADA: 'RTMP (câmera envia)',
  RTSP_NVR: 'RTSP / NVR',
};

export const camerasApi = {
  listarCameras: (params: { condominio_id?: number; incluir_inativas?: boolean }) =>
    api.get<Camera[]>('/cameras', { params }).then(r => r.data),
  obterCamera: (id: number) => api.get<Camera>(`/cameras/${id}`).then(r => r.data),
  criarCamera: (dados: CameraForm) => api.post<Camera>('/cameras', dados).then(r => r.data),
  editarCamera: (id: number, dados: Partial<CameraForm> & { ativo?: boolean }) =>
    api.patch<Camera>(`/cameras/${id}`, dados).then(r => r.data),
  rotacionarChave: (id: number) =>
    api.post<Camera>(`/cameras/${id}/rotacionar-chave`).then(r => r.data),

  listarPostes: (params: { condominio_id?: number; incluir_inativos?: boolean }) =>
    api.get<Poste[]>('/postes', { params }).then(r => r.data),
  criarPoste: (dados: PosteForm) => api.post<Poste>('/postes', dados).then(r => r.data),
  editarPoste: (id: number, dados: Partial<PosteForm> & { ativo?: boolean }) =>
    api.patch<Poste>(`/postes/${id}`, dados).then(r => r.data),
};

/** Mensagem de erro do backend (detail) ou genérica — inclui erros de validação 422. */
export function mensagemErro(e: unknown, padrao = 'Erro ao salvar.'): string {
  if (isAxiosError(e)) {
    const detail = e.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
  }
  return padrao;
}

/** Divide rtmp://host:porta/cam/<chave> em servidor + chave — algumas câmeras pedem separado. */
export function dividirUrlRtmp(url: string): { servidor: string; chave: string } {
  const i = url.lastIndexOf('/');
  return { servidor: url.slice(0, i), chave: url.slice(i + 1) };
}
