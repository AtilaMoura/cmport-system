"use client"

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import CameraPlayer from '@/components/cameras/CameraPlayer';
import ModalCamera from '@/components/cameras/ModalCamera';
import { InstalacaoRtmp, StatusCamera, BTN_SECUNDARIO } from '@/components/cameras/ui';
import { camerasApi, mensagemErro, TIPO_LABEL, type Camera } from '@/lib/cameras';

export default function CameraPage() {
  const params = useParams<{ id: string }>();
  const cameraId = Number(params.id);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setCamera(await camerasApi.obterCamera(cameraId));
    } catch (e) {
      setErro(mensagemErro(e, 'Câmera não encontrada.'));
    }
  }, [cameraId]);

  useEffect(() => {
    if (!Number.isInteger(cameraId)) return;
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [cameraId, carregar]);

  const rotacionar = async () => {
    if (!camera) return;
    if (!confirm(
      'Gerar uma nova chave RTMP?\n\n' +
      'A câmera CAI NA HORA e só volta depois de reconfigurada no local com a nova URL. ' +
      'Use quando a chave vazou ou ao trocar o equipamento.'
    )) return;
    setProcessando(true);
    try {
      setCamera(await camerasApi.rotacionarChave(camera.id));
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setProcessando(false);
    }
  };

  const alternarAtivo = async () => {
    if (!camera) return;
    const msg = camera.ativo
      ? 'Desativar esta câmera? Ela para de transmitir na hora (o cadastro é mantido e pode ser reativado).'
      : 'Reativar esta câmera?';
    if (!confirm(msg)) return;
    setProcessando(true);
    try {
      setCamera(await camerasApi.editarCamera(camera.id, { ativo: !camera.ativo }));
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setProcessando(false);
    }
  };

  if (!Number.isInteger(cameraId) || erro) {
    return <div className="p-6 text-sm text-red-600">{erro ?? 'Câmera inválida.'}</div>;
  }
  if (!camera) return <div className="p-6 text-sm text-slate-500">Carregando...</div>;

  const rtmp = camera.tipo_conexao === 'RTMP_ISOLADA';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <Link href="/cameras" className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">← Câmeras</Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{camera.nome}</h1>
          <StatusCamera online={camera.online} ativo={camera.ativo} />
        </div>
        <p className="text-sm text-slate-500">
          {camera.condominio_nome}{camera.poste_nome ? ` · 📍 ${camera.poste_nome}` : ' · sem poste'}
        </p>
      </div>

      {!camera.ativo ? (
        <div className="aspect-video rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-sm text-slate-500">
          Câmera inativa.
        </div>
      ) : rtmp ? (
        <CameraPlayer cameraId={camera.id} />
      ) : (
        <div className="aspect-video rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-sm text-slate-500 px-6 text-center">
          Visualização de câmeras RTSP/NVR ainda não está disponível (depende de VPN com o local).
        </div>
      )}

      <section id="configuracao" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-black text-slate-800 dark:text-slate-100">Configuração</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditando(true)} disabled={processando} className={BTN_SECUNDARIO}>Editar</button>
            <button onClick={alternarAtivo} disabled={processando}
              className={`${BTN_SECUNDARIO} ${camera.ativo ? '!text-red-600' : '!text-green-600'}`}>
              {camera.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400">
          Tipo: <b>{TIPO_LABEL[camera.tipo_conexao]}</b>
        </div>

        {rtmp && camera.rtmp_url && (
          <>
            <InstalacaoRtmp rtmpUrl={camera.rtmp_url} ocultarChave />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 max-w-md">
                Chave vazou ou trocou o equipamento? Gere uma nova — a câmera cai na hora e
                precisa ser reconfigurada no local.
              </p>
              <button onClick={rotacionar} disabled={processando}
                className="px-4 py-2 rounded-xl border-2 border-amber-500 text-amber-700 dark:text-amber-400 text-sm font-bold hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-50">
                {processando ? 'Aguarde...' : 'Gerar nova chave'}
              </button>
            </div>
          </>
        )}

        {!rtmp && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-xs font-bold text-slate-500 uppercase">IP do NVR</dt><dd>{camera.nvr_ip}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500 uppercase">Porta</dt><dd>{camera.nvr_porta}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500 uppercase">Usuário</dt><dd>{camera.nvr_usuario}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500 uppercase">Canal</dt><dd>{camera.canal}</dd></div>
          </dl>
        )}
      </section>

      {editando && (
        <ModalCamera camera={camera} onFechar={() => setEditando(false)}
          onSalvo={c => { setCamera(c); setEditando(false); }} />
      )}
    </div>
  );
}
