from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_current_user
from app.schemas.recibo_schema import ReciboCreate, ReciboUpdate, ReciboResponse
from app.services.recibo_service import ReciboService
from app.services.ordem_servico_service import OrdemServicoService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class PagarRequest(BaseModel):
    data_pagamento: Optional[date] = None


@router.get("", response_model=List[ReciboResponse])
def listar(
    condominio_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    status: Optional[str] = None,
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ReciboService.list_all(db, condominio_id, cliente_id, status, ano, mes)


@router.get("/buscar-os")
def buscar_os(
    condominio_id: Optional[int] = None,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """OSs disponíveis (ainda não vinculadas a nenhum serviço) para reaproveitar no recibo.

    Busca por condominio_id (customer Auvo = condomínio) ou cliente_id (cliente
    cadastrado como Customer próprio no Auvo, cenário fora do condomínio).
    """
    if condominio_id:
        ordens = OrdemServicoService.listar_disponiveis_condominio(db, condominio_id)
    elif cliente_id:
        ordens = OrdemServicoService.listar_disponiveis_cliente(db, cliente_id)
    else:
        ordens = []

    lista = [
        {
            "servico_id": o["servico_id"],
            "numero_os": str(o["task_id"]),
            "data_servico": o["task_date"].date().isoformat() if o["task_date"] else None,
            "descricao_preview": (o["task_type_description"] or "")[:60].strip(),
            "descricao_completa": o["orientation"] or o["task_type_description"],
            "task_id": o["task_id"],
        }
        for o in ordens
    ]
    return {"lista": lista, "preenchimento_manual": len(lista) == 0}


@router.post("", response_model=ReciboResponse, status_code=201)
def criar(
    payload: ReciboCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ReciboService.criar(db, payload)


@router.get("/{recibo_id}", response_model=ReciboResponse)
def obter(
    recibo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ReciboService.get_by_id(db, recibo_id)


@router.patch("/{recibo_id}", response_model=ReciboResponse)
def atualizar(
    recibo_id: int,
    payload: ReciboUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ReciboService.atualizar(db, recibo_id, payload)


@router.post("/{recibo_id}/pagar", response_model=ReciboResponse)
def marcar_pago(
    recibo_id: int,
    payload: PagarRequest,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ReciboService.marcar_pago(db, recibo_id, payload.data_pagamento)


@router.delete("/{recibo_id}", status_code=204)
def deletar(
    recibo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    ReciboService.deletar(db, recibo_id)
