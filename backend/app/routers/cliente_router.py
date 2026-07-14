from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_current_user
from app.schemas.cliente_schema import ClienteCreate, ClienteUpdate, ClienteResponse
from app.services.cliente_service import ClienteService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[ClienteResponse])
def listar(
    condominio_id: Optional[int] = None,
    apenas_ativos: bool = False,
    busca: Optional[str] = None,
    sem_condominio: bool = False,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    clientes = ClienteService.list_all(db, condominio_id, apenas_ativos, busca, sem_condominio)
    result = []
    for c in clientes:
        d = ClienteResponse.model_validate(c)
        if c.condominio:
            d.condominio_nome = c.condominio.nome
        result.append(d)
    return result


@router.post("", response_model=ClienteResponse, status_code=201)
def criar(
    payload: ClienteCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ClienteService.criar(db, payload)


@router.get("/{cliente_id}", response_model=ClienteResponse)
def obter(
    cliente_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ClienteService.get_by_id(db, cliente_id)


@router.patch("/{cliente_id}", response_model=ClienteResponse)
def atualizar(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ClienteService.atualizar(db, cliente_id, payload)


@router.delete("/{cliente_id}", status_code=204)
def deletar(
    cliente_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    ClienteService.deletar(db, cliente_id)
