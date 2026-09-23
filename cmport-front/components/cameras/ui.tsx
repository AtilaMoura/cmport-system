"use client"

// Peças visuais compartilhadas do módulo Câmeras (modal, campo, status, instalação RTMP)
import { useState, type ReactNode } from 'react';
import { dividirUrlRtmp } from '@/lib/cameras';

export const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none';

export const BTN_PRIMARIO =
  'px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 transition-colors';

export const BTN_SECUNDARIO =
  'px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors';

export function Modal({ titulo, onFechar, children, largura = 'max-w-lg' }: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  largura?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onFechar}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${largura} p-6 my-8`} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function StatusCamera({ online, ativo }: { online: boolean | null; ativo: boolean }) {
  if (!ativo) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Inativa</span>;
  }
  if (online === null) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">—</span>;
  }
  return online ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Offline
    </span>
  );
}

function LinhaCopiar({ rotulo, valor, oculto = false }: { rotulo: string; valor: string; oculto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const [visivel, setVisivel] = useState(!oculto);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // navegador sem permissão de clipboard (http sem TLS) — usuário seleciona na mão
      setVisivel(true);
    }
  };

  return (
    <div>
      <div className="text-xs font-bold text-slate-500 uppercase mb-1">{rotulo}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-950 text-xs break-all select-all">
          {visivel ? valor : '•'.repeat(24)}
        </code>
        {oculto && (
          <button type="button" onClick={() => setVisivel(v => !v)} className="shrink-0 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            {visivel ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
        <button type="button" onClick={copiar} className="shrink-0 text-xs font-bold text-blue-600 hover:text-blue-800">
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

/** URL RTMP pronta pra configurar no equipamento — completa e dividida em servidor + chave. */
export function InstalacaoRtmp({ rtmpUrl, ocultarChave = false }: { rtmpUrl: string; ocultarChave?: boolean }) {
  const { servidor, chave } = dividirUrlRtmp(rtmpUrl);
  return (
    <div className="space-y-3">
      <LinhaCopiar rotulo="URL RTMP completa" valor={rtmpUrl} oculto={ocultarChave} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LinhaCopiar rotulo="Servidor" valor={servidor} />
        <LinhaCopiar rotulo="Chave do stream" valor={chave} oculto={ocultarChave} />
      </div>
      <details className="text-sm text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer font-bold">Como configurar na câmera Intelbras</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>Acesse a interface web da câmera pelo navegador (IP local dela).</li>
          <li>Vá em <b>Rede → RTMP</b> e habilite.</li>
          <li>Cole a <b>URL RTMP completa</b> (ou, se pedir separado, o servidor e a chave).</li>
          <li>Salve. Em até 1 minuto a câmera deve aparecer como <b>Online</b> aqui no painel.</li>
        </ol>
        <p className="mt-2 text-xs">A chave é a senha de envio da câmera — não compartilhe fora da equipe.</p>
      </details>
    </div>
  );
}
