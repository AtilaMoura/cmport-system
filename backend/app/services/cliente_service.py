from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.cliente_model import Cliente
from app.repositories.cliente_repository import ClienteRepository
from app.schemas.cliente_schema import ClienteCreate, ClienteUpdate


class ClienteService:

    @staticmethod
    def criar(db: Session, payload: ClienteCreate) -> Cliente:
        cliente = Cliente(
            condominio_id=payload.condominio_id,
            nome=payload.nome,
            tipo=payload.tipo.upper(),
            cpf_cnpj=payload.cpf_cnpj,
            apartamento=payload.apartamento,
            email=payload.email,
            telefone=payload.telefone,
            observacao=payload.observacao,
            ativo=payload.ativo,
            auvo_id=payload.auvo_id,
        )
        return ClienteRepository.create(db, cliente)

    @staticmethod
    def get_by_id(db: Session, cliente_id: int) -> Cliente:
        c = ClienteRepository.get_by_id(db, cliente_id)
        if not c:
            raise HTTPException(status_code=404, detail="Cliente não encontrado.")
        return c

    @staticmethod
    def list_all(
        db: Session,
        condominio_id: Optional[int] = None,
        apenas_ativos: bool = False,
        busca: Optional[str] = None,
        sem_condominio: bool = False,
    ) -> List[Cliente]:
        return ClienteRepository.list_all(db, condominio_id, apenas_ativos, busca, sem_condominio)

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int, apenas_ativos: bool = False) -> List[Cliente]:
        return ClienteRepository.list_by_condominio(db, condominio_id, apenas_ativos)

    @staticmethod
    def atualizar(db: Session, cliente_id: int, payload: ClienteUpdate) -> Cliente:
        c = ClienteService.get_by_id(db, cliente_id)
        if payload.nome is not None:
            c.nome = payload.nome
        if payload.tipo is not None:
            c.tipo = payload.tipo.upper()
        if payload.cpf_cnpj is not None:
            c.cpf_cnpj = payload.cpf_cnpj
        if payload.apartamento is not None:
            c.apartamento = payload.apartamento
        if payload.email is not None:
            c.email = payload.email
        if payload.telefone is not None:
            c.telefone = payload.telefone
        if payload.observacao is not None:
            c.observacao = payload.observacao
        if payload.ativo is not None:
            c.ativo = payload.ativo
        if payload.auvo_id is not None:
            c.auvo_id = payload.auvo_id
        return ClienteRepository.save(db, c)

    @staticmethod
    def deletar(db: Session, cliente_id: int) -> None:
        c = ClienteService.get_by_id(db, cliente_id)
        c.deletado_em = datetime.utcnow()
        c.ativo = False
        ClienteRepository.save(db, c)
