"use client"

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BuscaCondominio } from '@/components/fluxo-financeiro/BuscaCondominio';
import ModalPoste from '@/components/cameras/ModalPoste';
import ModalCamera from '@/components/cameras/ModalCamera';
import { StatusCamera, BTN_PRIMARIO, BTN_SECUNDARIO } from '@/components/cameras/ui';
import { camerasApi, mensagemErro, TIPO_LABEL, type Camera, type Poste } from '@/lib/cameras';

// status online vem da API do MediaMTX — recarrega a lista de câmeras periodicamente
const INTERVALO_STATUS_MS = 30000;

type ModalAberto =
  | { tipo: 'poste'; poste?: Poste; condominio?: { id: number; nome: string } }
  | { tipo: 'camera'; camera?: Camera; condominio?: { id: number; nome: string }; posteId?: number | null }
  | null;

interface GrupoCondominio {
  id: number;
  nome: string;
  postes: { poste: Poste; cameras: Camera[] }[];
  semPoste: Camera[];
}

/** Agrupa condomínio → poste → câmeras (postes sem câmera também aparecem). */
function agrupar(cameras: Camera[], postes: Poste[]): GrupoCondominio[] {
  const grupos = new Map<number, GrupoCondominio>();
  const grupo = (id: number, nome: string | null) => {
    if (!grupos.has(id)) grupos.set(id, { id, nome: nome ?? `Condomínio ${id}`, postes: [], semPoste: [] });
    return grupos.get(id)!;
  };
  for (const p of postes) grupo(p.condominio_id, p.condominio_nome).postes.push({ poste: p, cameras: [] });
  for (const c of cameras) {
    const g = grupo(c.condominio_id, c.condominio_nome);
    const item = g.postes.find(x => x.poste.id === c.poste_id);
    if (item) item.cameras.push(c);
    else g.semPoste.push(c); // sem poste, ou poste inativo fora do filtro
  }
  return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroCondominio, setFiltroCondominio] = useState<number | ''>('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modal, setModal] = useState<ModalAberto>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    const condominio_id = filtroCondominio === '' ? undefined : filtroCondominio;
    try {
      const [cams, psts] = await Promise.all([
        camerasApi.listarCameras({ condominio_id, incluir_inativas: mostrarInativos }),
        camerasApi.listarPostes({ condominio_id, incluir_inativos: mostrarInativos }),
      ]);
      setCameras(cams);
      setPostes(psts);
      setErro(null);
    } catch (e) {
      if (!silencioso) setErro(mensagemErro(e, 'Erro ao carregar câmeras.'));
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [filtroCondominio, mostrarInativos]);

  useEffect(() => {
    const inicial = setTimeout(() => carregar(), 0);
    const t = setInterval(() => carregar(true), INTERVALO_STATUS_MS);
    return () => { clearTimeout(inicial); clearInterval(t); };
  }, [carregar]);

  const grupos = useMemo(() => agrupar(cameras, postes), [cameras, postes]);
  const totalOnline = cameras.filter(c => c.ativo && c.online).length;
  const totalAtivas = cameras.filter(c => c.ativo).length;

  const aposSalvar = () => {
    setModal(null);
    carregar(true);
  };

  const alternarCamera = async (c: Camera) => {
    const msg = c.ativo
      ? `Desativar a câmera "${c.nome}"? Ela para de transmitir na hora (o cadastro é mantido e pode ser reativado).`
      : `Reativar a câmera "${c.nome}"?`;
    if (!confirm(msg)) return;
    try {
      await camerasApi.editarCamera(c.id, { ativo: !c.ativo });
      carregar(true);
    } catch (e) {
      alert(mensagemErro(e));
    }
  };

  const alternarPoste = async (p: Poste) => {
    if (!confirm(p.ativo ? `Desativar o poste "${p.nome}"?` : `Reativar o poste "${p.nome}"?`)) return;
    try {
      await camerasApi.editarPoste(p.id, { ativo: !p.ativo });
      carregar(true);
    } catch (e) {
      alert(mensagemErro(e));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Câmeras</h1>
          <p className="text-sm text-slate-500">
            {totalAtivas} câmera(s) ativa(s) · <span className="text-green-600 font-semibold">{totalOnline} online</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal({ tipo: 'poste' })} className={BTN_SECUNDARIO}>+ Poste</button>
          <button onClick={() => setModal({ tipo: 'camera' })} className={BTN_PRIMARIO}>+ Câmera</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-80">
          <BuscaCondominio value={filtroCondominio} onChange={id => setFiltroCondominio(id)} placeholder="Filtrar por condomínio..." />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 pb-2.5">
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} className="w-4 h-4 rounded" />
          Mostrar inativos
        </label>
      </div>

      {erro && <div className="text-sm text-red-600">{erro}</div>}

      {carregando ? (
        <div className="text-sm text-slate-500">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="text-sm text-slate-500 py-10 text-center">
          Nenhuma câmera cadastrada{filtroCondominio !== '' ? ' neste condomínio' : ''}.
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(g => (
            <section key={g.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-black text-slate-800 dark:text-slate-100">🏢 {g.nome}</h2>
                <div className="flex gap-3 text-xs font-bold">
                  <button onClick={() => setModal({ tipo: 'poste', condominio: { id: g.id, nome: g.nome } })} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">+ Poste</button>
                  <button onClick={() => setModal({ tipo: 'camera', condominio: { id: g.id, nome: g.nome } })} className="text-blue-600 hover:text-blue-800">+ Câmera</button>
                </div>
              </header>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {g.postes.map(({ poste, cameras: cams }) => (
                  <div key={`p${poste.id}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className={poste.ativo ? '' : 'opacity-60'}>
                        <span className="font-bold text-sm">📍 {poste.nome}</span>
                        {!poste.ativo && <span className="ml-2 text-xs text-slate-500">(inativo)</span>}
                        {poste.observacao && <p className="text-xs text-slate-500">{poste.observacao}</p>}
                      </div>
                      <div className="flex gap-3 text-xs font-bold">
                        {poste.ativo && (
                          <button onClick={() => setModal({ tipo: 'camera', condominio: { id: g.id, nome: g.nome }, posteId: poste.id })} className="text-blue-600 hover:text-blue-800">+ Câmera</button>
                        )}
                        <button onClick={() => setModal({ tipo: 'poste', poste })} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Editar</button>
                        <button onClick={() => alternarPoste(poste)} className={poste.ativo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}>
                          {poste.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      </div>
                    </div>
                    {cams.length === 0
                      ? <p className="text-xs text-slate-400 pl-5">Nenhuma câmera neste poste.</p>
                      : <ListaCameras cameras={cams} onEditar={c => setModal({ tipo: 'camera', camera: c })} onAlternar={alternarCamera} />}
                  </div>
                ))}

                {g.semPoste.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="font-bold text-sm text-slate-500 mb-2">Sem poste</div>
                    <ListaCameras cameras={g.semPoste} onEditar={c => setModal({ tipo: 'camera', camera: c })} onAlternar={alternarCamera} />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {modal?.tipo === 'poste' && (
        <ModalPoste poste={modal.poste} condominioInicial={modal.condominio} onFechar={() => setModal(null)} onSalvo={aposSalvar} />
      )}
      {modal?.tipo === 'camera' && (
        <ModalCamera camera={modal.camera} condominioInicial={modal.condominio} posteInicialId={modal.posteId}
          onFechar={() => setModal(null)} onSalvo={aposSalvar} />
      )}
    </div>
  );
}

function ListaCameras({ cameras, onEditar, onAlternar }: {
  cameras: Camera[];
  onEditar: (c: Camera) => void;
  onAlternar: (c: Camera) => void;
}) {
  return (
    <ul className="space-y-1.5 pl-5">
      {cameras.map(c => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <div className={`flex items-center gap-3 min-w-0 ${c.ativo ? '' : 'opacity-60'}`}>
            <StatusCamera online={c.online} ativo={c.ativo} />
            <span className="text-sm font-semibold truncate">{c.nome}</span>
            <span className="text-xs text-slate-400">{TIPO_LABEL[c.tipo_conexao]}</span>
          </div>
          <div className="flex gap-3 text-xs font-bold">
            {c.ativo && c.tipo_conexao === 'RTMP_ISOLADA' && (
              <Link href={`/cameras/${c.id}`} className="text-blue-600 hover:text-blue-800">Assistir</Link>
            )}
            <Link href={`/cameras/${c.id}#configuracao`} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Config</Link>
            <button onClick={() => onEditar(c)} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Editar</button>
            <button onClick={() => onAlternar(c)} className={c.ativo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}>
              {c.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
