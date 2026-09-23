"use client"

import { useState } from 'react';
import { BuscaCondominio } from '@/components/fluxo-financeiro/BuscaCondominio';
import { camerasApi, mensagemErro, type Poste } from '@/lib/cameras';
import { Modal, Campo, INPUT_CLS, BTN_PRIMARIO, BTN_SECUNDARIO } from './ui';

interface Props {
  // edição: poste existente | criação: condomínio pré-selecionado (opcional)
  poste?: Poste;
  condominioInicial?: { id: number; nome: string };
  onFechar: () => void;
  onSalvo: (poste: Poste) => void;
}

export default function ModalPoste({ poste, condominioInicial, onFechar, onSalvo }: Props) {
  const editando = !!poste;
  const [condominioId, setCondominioId] = useState<number | ''>(poste?.condominio_id ?? condominioInicial?.id ?? '');
  const [nome, setNome] = useState(poste?.nome ?? '');
  const [observacao, setObservacao] = useState(poste?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    if (condominioId === '') return setErro('Selecione o condomínio.');
    if (nome.trim().length < 2) return setErro('Informe o nome do poste.');
    setSalvando(true);
    setErro(null);
    try {
      const salvo = editando
        ? await camerasApi.editarPoste(poste.id, { nome: nome.trim(), observacao: observacao.trim() || null })
        : await camerasApi.criarPoste({ condominio_id: condominioId, nome: nome.trim(), observacao: observacao.trim() || null });
      onSalvo(salvo);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const nomeCondominio = poste?.condominio_nome ?? condominioInicial?.nome;

  return (
    <Modal titulo={editando ? 'Editar poste' : 'Novo poste'} onFechar={onFechar}>
      <div className="space-y-4">
        {editando || condominioInicial ? (
          <Campo label="Condomínio">
            <div className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold">{nomeCondominio}</div>
          </Campo>
        ) : (
          <BuscaCondominio label="Condomínio" value={condominioId} onChange={id => setCondominioId(id)} placeholder="Digite o nome do condomínio..." />
        )}

        <Campo label="Nome do poste">
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} autoFocus
            placeholder="Ex: Poste Entrada Principal" className={INPUT_CLS} maxLength={150} />
        </Campo>

        <Campo label="Observação (opcional)">
          <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3}
            placeholder="Localização exata, referência, detalhes da instalação..."
            className={`${INPUT_CLS} resize-none`} />
        </Campo>

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
