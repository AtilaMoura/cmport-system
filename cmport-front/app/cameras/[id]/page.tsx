"use client"

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import CameraPlayer from '@/components/cameras/CameraPlayer';

interface Camera {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  nome: string;
  tipo_conexao: string;
  // só vêm preenchidos pra ADMIN/DEV
  rtmp_stream_key: string | null;
  rtmp_url: string | null;
  ativo: boolean;
}

export default function CameraAoVivoPage() {
  const params = useParams<{ id: string }>();
  const cameraId = Number(params.id);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(cameraId)) return;
    api.get<Camera>(`/cameras/${cameraId}`)
      .then(res => setCamera(res.data))
      .catch(() => setErro('Câmera não encontrada.'));
  }, [cameraId]);

  if (!Number.isInteger(cameraId) || erro) {
    return <div className="p-6 text-sm text-red-600">{erro ?? 'Câmera inválida.'}</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{camera?.nome ?? 'Câmera'}</h1>
        {camera?.condominio_nome && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{camera.condominio_nome}</p>
        )}
      </div>

      {camera && !camera.ativo ? (
        <div className="text-sm text-gray-500">Câmera inativa.</div>
      ) : (
        <CameraPlayer cameraId={cameraId} />
      )}
    </div>
  );
}
