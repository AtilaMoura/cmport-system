"use client"

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';

type Status = 'conectando' | 'ao-vivo' | 'erro';

// Tempo máximo esperando o navegador reunir os candidatos ICE antes de mandar o offer
const TIMEOUT_ICE_MS = 3000;

/**
 * Player ao vivo de uma câmera via WebRTC.
 *
 * O navegador nunca fala direto com o MediaMTX: o SDP offer vai pro backend
 * (POST /cameras/{id}/webrtc, autenticado por JWT), que repassa pro MediaMTX
 * pela rede interna e devolve o answer. Só o vídeo (UDP) vem direto do servidor.
 * Por isso a negociação é "sem trickle": espera todos os candidatos ICE antes.
 */
export default function CameraPlayer({ cameraId }: { cameraId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('conectando');
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const reconectar = useCallback(() => setTentativa(t => t + 1), []);

  useEffect(() => {
    let cancelado = false;
    const pc = new RTCPeerConnection();

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      if (videoRef.current && ev.streams[0]) {
        videoRef.current.srcObject = ev.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (cancelado) return;
      if (pc.connectionState === 'connected') setStatus('ao-vivo');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('erro');
        setErro('Conexão de vídeo perdida.');
      }
    };

    const esperarCandidatos = () => new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, TIMEOUT_ICE_MS);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    (async () => {
      setStatus('conectando');
      setErro(null);
      try {
        await pc.setLocalDescription(await pc.createOffer());
        await esperarCandidatos();
        if (cancelado || !pc.localDescription) return;

        const res = await api.post<{ sdp: string }>(`/cameras/${cameraId}/webrtc`, {
          sdp: pc.localDescription.sdp,
        });
        if (cancelado) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: res.data.sdp });
      } catch (e) {
        if (cancelado) return;
        setStatus('erro');
        setErro(
          isAxiosError(e) && typeof e.response?.data?.detail === 'string'
            ? e.response.data.detail
            : 'Não foi possível conectar ao vídeo.'
        );
      }
    })();

    return () => {
      cancelado = true;
      pc.close();
    };
  }, [cameraId, tentativa]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain" />

      {status === 'ao-vivo' && (
        <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-xs font-semibold bg-red-600 text-white">
          AO VIVO
        </span>
      )}

      {status === 'conectando' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
          Conectando…
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-gray-200">
          <span>{erro}</span>
          <button
            onClick={reconectar}
            className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
