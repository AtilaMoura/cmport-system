"use client"

import { useEffect, useState } from 'react';
import { BuscaCondominio } from '@/components/fluxo-financeiro/BuscaCondominio';
import {
  camerasApi, mensagemErro, TIPO_LABEL,
  type Camera, type CameraForm, type Poste, type TipoConexao,
} from '@/lib/cameras';
import { Modal, Campo, INPUT_CLS, BTN_PRIMARIO, BTN_SECUNDARIO, InstalacaoRtmp } from './ui';

interface Props {
  // edição: câmera existente | criação: condomínio/poste pré-selecionados (opcional)
  camera?: Camera;
  condominioInicial?: { id: number; nome: string };
  posteInicialId?: number | null;
  onFechar: () => void;
  onSalvo: (camera: Camera) => void;
}

export default function ModalCamera({ camera, condominioInicial, posteInicialId = null, onFechar, onSalvo }: Props) {
  const editando = !!camera;
  const [condominioId, setCondominioId] = useState<number | ''>(camera?.condominio_id ?? condominioInicial?.id ?? '');
  const [posteId, setPosteId] = useState<number | null>(camera?.poste_id ?? posteInicialId);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [nome, setNome] = useState(camera?.nome ?? '');
  const [tipo, setTipo] = useState<TipoConexao>(camera?.tipo_conexao ?? 'RTMP_ISOLADA');
  // RTSP / NVR
  const [nvrIp, setNvrIp] = useState(camera?.nvr_ip ?? '');
  const [nvrPorta, setNvrPorta] = useState(String(camera?.nvr_porta ?? 554));
  const [nvrUsuario, setNvrUsuario] = useState(camera?.nvr_usuario ?? '');
  const [nvrSenha, setNvrSenha] = useState('');
  const [canal, setCanal] = useState(camera?.canal ? String(camera.canal) : '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // depois de criar uma câmera RTMP, mostra a URL de instalação antes de fechar
  const [criada, setCriada] = useState<Camera | null>(null);

  // postes do condomínio escolhido
  useEffect(() => {
    if (condominioId === '') return;
    let cancelado = false;
    camerasApi.listarPostes({ condominio_id: condominioId })
      .then(lista => { if (!cancelado) setPostes(lista); })
      .catch(() => { if (!cancelado) setPostes([]); });
    return () => { cancelado = true; };
  }, [condominioId]);

  const trocarCondominio = (id: number | '') => {
    // poste é do condomínio anterior — volta pra "sem poste"
    setCondominioId(id);
    setPosteId(null);
    setPostes([]);
  };

  const salvar = async () => {
    if (condominioId === '') return setErro('Selecione o condomínio.');
    if (nome.trim().length < 2) return setErro('Informe o nome da câmera.');
    const rtsp = tipo === 'RTSP_NVR';
    if (rtsp && (!nvrIp.trim() || !nvrUsuario.trim() || !canal || (!editando && !nvrSenha))) {
      return setErro('Para RTSP/NVR informe IP, usuário, senha e canal.');
    }
    setSalvando(true);
    setErro(null);
    try {
      const camposRtsp: Partial<CameraForm> = rtsp ? {
        nvr_ip: nvrIp.trim(),
        nvr_porta: Number(nvrPorta) || 554,
        nvr_usuario: nvrUsuario.trim(),
        canal: Number(canal),
        // em branco na edição = manter a senha atual
        ...(nvrSenha ? { nvr_senha: nvrSenha } : {}),
      } : {};

      if (editando) {
        const salva = await camerasApi.editarCamera(camera.id, {
          nome: nome.trim(), condominio_id: condominioId, poste_id: posteId, ...camposRtsp,
        });
        onSalvo(salva);
        return;
      }
      const nova = await camerasApi.criarCamera({
        condominio_id: condominioId, poste_id: posteId, nome: nome.trim(), tipo_conexao: tipo, ...camposRtsp,
      });
      if (nova.rtmp_url) setCriada(nova);
      else onSalvo(nova);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  if (criada?.rtmp_url) {
    return (
      <Modal titulo="Câmera cadastrada — configure o equipamento" onFechar={() => onSalvo(criada)} largura="max-w-2xl">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          <b>{criada.nome}</b> ({criada.condominio_nome}). Configure a câmera com a URL abaixo —
          ela também fica disponível depois na tela da câmera.
        </p>
        <InstalacaoRtmp rtmpUrl={criada.rtmp_url} />
        <div className="flex justify-end pt-5">
          <button type="button" onClick={() => onSalvo(criada)} className={BTN_PRIMARIO}>Concluir</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={editando ? 'Editar câmera' : 'Nova câmera'} onFechar={onFechar}>
      <div className="space-y-4">
        {condominioInicial && !editando ? (
          <Campo label="Condomínio">
            <div className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold">{condominioInicial.nome}</div>
          </Campo>
        ) : (
          // na edição dá pra trocar o condomínio (× no chip) — a chave RTMP não muda
          <BuscaCondominio label="Condomínio" value={condominioId} onChange={trocarCondominio}
            nomeInicial={camera?.condominio_nome ?? ''} placeholder="Digite o nome do condomínio..." />
        )}

        <Campo label="Poste">
          <select value={posteId ?? ''} onChange={e => setPosteId(e.target.value ? Number(e.target.value) : null)}
            disabled={condominioId === ''} className={INPUT_CLS}>
            <option value="">Sem poste (câmera avulsa)</option>
            {postes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>

        <Campo label="Nome da câmera">
          <input type="text" value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Ex: Portão Principal" className={INPUT_CLS} maxLength={150} />
        </Campo>

        <Campo label="Tipo de conexão">
          {editando ? (
            <div className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold">{TIPO_LABEL[tipo]}</div>
          ) : (
            <div className="flex gap-2">
              {(Object.keys(TIPO_LABEL) as TipoConexao[]).map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                    tipo === t
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </Campo>

        {tipo === 'RTMP_ISOLADA' && !editando && (
          <p className="text-xs text-slate-500">A URL de envio (RTMP) é gerada ao salvar.</p>
        )}

        {tipo === 'RTSP_NVR' && (
          <>
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
              Visualização de câmeras RTSP/NVR ainda não está disponível (depende de VPN com o local).
              O cadastro fica salvo para quando estiver.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Campo label="IP do NVR">
                  <input type="text" value={nvrIp} onChange={e => setNvrIp(e.target.value)} placeholder="192.168.1.100" className={INPUT_CLS} maxLength={45} />
                </Campo>
              </div>
              <Campo label="Porta">
                <input type="number" value={nvrPorta} onChange={e => setNvrPorta(e.target.value)} min={1} max={65535} className={INPUT_CLS} />
              </Campo>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Usuário">
                <input type="text" value={nvrUsuario} onChange={e => setNvrUsuario(e.target.value)} className={INPUT_CLS} maxLength={100} autoComplete="off" />
              </Campo>
              <Campo label="Senha">
                <input type="password" value={nvrSenha} onChange={e => setNvrSenha(e.target.value)}
                  placeholder={editando ? 'Manter atual' : ''} className={INPUT_CLS} maxLength={255} autoComplete="new-password" />
              </Campo>
              <Campo label="Canal">
                <input type="number" value={canal} onChange={e => setCanal(e.target.value)} min={1} className={INPUT_CLS} />
              </Campo>
            </div>
          </>
        )}

        {erro && <div className="text-sm text-red-600">{erro}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onFechar} className={BTN_SECUNDARIO}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className={BTN_PRIMARIO}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
