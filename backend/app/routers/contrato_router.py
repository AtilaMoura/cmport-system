from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_current_user
from app.schemas.contrato_schema import ContratoCreate, ContratoUpdate, ContratoResponse
from app.services.contrato_condominio_service import ContratoCondominioService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[ContratoResponse])
def listar_contratos(
    apenas_ativos: bool = False,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ContratoCondominioService.list_all(db, apenas_ativos)


@router.get("/condominio/{condominio_id}", response_model=List[ContratoResponse])
def listar_contratos_por_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ContratoCondominioService.list_by_condominio(db, condominio_id)


@router.get("/{condominio_id}", response_model=ContratoResponse)
def get_contrato_por_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    contrato = ContratoCondominioService.get_by_condominio(db, condominio_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado.")
    return contrato


@router.post("", response_model=ContratoResponse, status_code=201)
def criar_contrato(
    payload: ContratoCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ContratoCondominioService.criar(
        db=db,
        condominio_id=payload.condominio_id,
        ativo=payload.ativo,
        descricao=payload.descricao,
        data_inicio=payload.data_inicio,
        data_termino=payload.data_termino,
        dia_vencimento_padrao=payload.dia_vencimento_padrao,
        valor_fixo_mensal=payload.valor_fixo_mensal,
        descricao_padrao_servico=payload.descricao_padrao_servico,
        observacoes_contrato=payload.observacoes_contrato,
        usuario=getattr(usuario, "nome", None),
    )


@router.patch("/{contrato_id}", response_model=ContratoResponse)
def atualizar_contrato(
    contrato_id: int,
    payload: ContratoUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ContratoCondominioService.atualizar(
        db=db,
        contrato_id=contrato_id,
        ativo=payload.ativo,
        descricao=payload.descricao,
        data_inicio=payload.data_inicio,
        data_termino=payload.data_termino,
        dia_vencimento_padrao=payload.dia_vencimento_padrao,
        valor_fixo_mensal=payload.valor_fixo_mensal,
        descricao_padrao_servico=payload.descricao_padrao_servico,
        observacoes_contrato=payload.observacoes_contrato,
    )


@router.patch("/{contrato_id}/toggle-ativo", response_model=ContratoResponse)
def toggle_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return ContratoCondominioService.toggle_ativo(db, contrato_id)


@router.delete("/{contrato_id}", status_code=204)
def deletar_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    ContratoCondominioService.deletar(
        db, contrato_id, usuario=getattr(usuario, "nome", None)
    )
