"""
poste_service.py — lógica de negócio de Poste.

condominio_id vive no banco principal (cmport_gerenciamento) — cada operação
que recebe um condominio_id abre uma sessão própria nesse banco só pra validar
que o condomínio existe (schemas diferentes, sem FK entre eles).
"""
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.poste_model import Poste
from app.repositories.poste_repository import PosteRepository
from app.schemas.poste_schema import PosteCreate, PosteUpdate, PosteResponse
from app.services.condominio_lookup_service import buscar_condominio_ou_404 as _buscar_condominio, nomes_por_ids


class PosteService:

    @staticmethod
    def _checar_sem_cameras_ativas(poste: Poste) -> None:
        # câmera ativa num poste desativado some do painel mas segue publicando
        ativas = [c for c in poste.cameras if c.ativo]
        if ativas:
            raise HTTPException(
                400,
                f"Poste tem {len(ativas)} câmera(s) ativa(s) — mova ou desative antes.",
            )

    @staticmethod
    def _resp(poste: Poste, condominio_nome: Optional[str] = None) -> PosteResponse:
        return PosteResponse(
            id=poste.id, condominio_id=poste.condominio_id,
            condominio_nome=condominio_nome,
            nome=poste.nome, observacao=poste.observacao,
            ativo=poste.ativo,
            total_cameras=len([c for c in poste.cameras if c.ativo]),
            criado_em=poste.criado_em, atualizado_em=poste.atualizado_em,
        )

    @staticmethod
    def listar(db: Session, condominio_id: Optional[int] = None, incluir_inativos: bool = False) -> List[PosteResponse]:
        postes = PosteRepository.listar(db, condominio_id=condominio_id, incluir_inativos=incluir_inativos)
        nomes = nomes_por_ids(p.condominio_id for p in postes)
        return [PosteService._resp(p, condominio_nome=nomes.get(p.condominio_id)) for p in postes]

    @staticmethod
    def obter(db: Session, poste_id: int) -> PosteResponse:
        poste = PosteRepository.get_by_id(db, poste_id)
        if not poste:
            raise HTTPException(404, "Poste não encontrado.")
        condominio = _buscar_condominio(poste.condominio_id)
        return PosteService._resp(poste, condominio_nome=condominio.nome)

    @staticmethod
    def criar(db: Session, req: PosteCreate) -> PosteResponse:
        condominio = _buscar_condominio(req.condominio_id)
        poste = Poste(
            condominio_id=req.condominio_id,
            nome=req.nome.strip(),
            observacao=(req.observacao or "").strip() or None,
        )
        poste = PosteRepository.create(db, poste)
        return PosteService._resp(poste, condominio_nome=condominio.nome)

    @staticmethod
    def editar(db: Session, poste_id: int, req: PosteUpdate) -> PosteResponse:
        poste = PosteRepository.get_by_id(db, poste_id)
        if not poste:
            raise HTTPException(404, "Poste não encontrado.")
        dados = req.model_dump(exclude_unset=True)
        if "nome" in dados:
            poste.nome = dados["nome"].strip()
        if "observacao" in dados:
            poste.observacao = (dados["observacao"] or "").strip() or None
        if "ativo" in dados:
            if not dados["ativo"]:
                PosteService._checar_sem_cameras_ativas(poste)
            poste.ativo = dados["ativo"]
        poste = PosteRepository.save(db, poste)
        condominio = _buscar_condominio(poste.condominio_id)
        return PosteService._resp(poste, condominio_nome=condominio.nome)

    @staticmethod
    def desativar(db: Session, poste_id: int) -> None:
        """Soft delete — nunca apaga o registro, só marca inativo (regra global do Atila)."""
        poste = PosteRepository.get_by_id(db, poste_id)
        if not poste:
            raise HTTPException(404, "Poste não encontrado.")
        PosteService._checar_sem_cameras_ativas(poste)
        poste.ativo = False
        PosteRepository.save(db, poste)
