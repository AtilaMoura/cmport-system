from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import SessionLocal
from app.services.servico_service import ServicoService
from app.schemas.servico_schema import ServicoCreate, ServicoUpdate, ServicoResponse


class VincularOrcamentoBody(BaseModel):
    orcamento_id: Optional[int] = None

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("", response_model=ServicoResponse, status_code=201)
def create_servico(servico: ServicoCreate, db: Session = Depends(get_db)):
    return ServicoService.create_servico(db, servico)


@router.get("", response_model=List[ServicoResponse])
def list_all_servicos(condominio_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    return ServicoService.list_all_servicos(db, condominio_id)


@router.get("/resumo-financeiro")
def resumo_financeiro(
    mes: Optional[int] = Query(None, ge=1, le=12),
    ano: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Totais PAGO e PENDENTE por data de pagamento (visão caixa)."""
    return ServicoService.resumo_financeiro(db, mes, ano)


@router.get("/por-nota/{nota_id}", response_model=ServicoResponse)
def get_servico_por_nota(nota_id: int, db: Session = Depends(get_db)):
    """Retorna o serviço vinculado a uma nota fiscal específica."""
    from app.models.servico_model import ManutencaoAssistencia
    servico = db.query(ManutencaoAssistencia).filter(
        ManutencaoAssistencia.nota_fiscal_id == nota_id
    ).first()
    if not servico:
        raise HTTPException(status_code=404, detail="Nenhum serviço vinculado a esta nota.")
    return servico


@router.get("/por-recibo/{recibo_id}", response_model=ServicoResponse)
def get_servico_por_recibo(recibo_id: int, db: Session = Depends(get_db)):
    """Retorna o serviço vinculado a um recibo específico."""
    from app.models.servico_model import ManutencaoAssistencia
    servico = db.query(ManutencaoAssistencia).filter(
        ManutencaoAssistencia.recibo_id == recibo_id
    ).first()
    if not servico:
        raise HTTPException(status_code=404, detail="Nenhum serviço vinculado a este recibo.")
    return servico


@router.get("/{servico_id}", response_model=ServicoResponse)
def get_servico(servico_id: int, db: Session = Depends(get_db)):
    servico = ServicoService.get_servico_by_id(db, servico_id)
    if not servico:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return servico


@router.get("/condominio/{condominio_id}", response_model=List[ServicoResponse])
def list_servicos(condominio_id: int, db: Session = Depends(get_db)):
    return ServicoService.list_servicos_condominio(db, condominio_id)


@router.put("/{servico_id}", response_model=ServicoResponse)
def update_servico(servico_id: int, servico_update: ServicoUpdate, db: Session = Depends(get_db)):
    updated = ServicoService.update_servico(db, servico_id, servico_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return updated


@router.put("/{servico_id}/orcamento", response_model=ServicoResponse)
def vincular_orcamento(servico_id: int, body: VincularOrcamentoBody, db: Session = Depends(get_db)):
    """Vincula ou desvincula um orçamento ao serviço (orcamento_id=null para desvincular)."""
    servico = ServicoService.vincular_orcamento(db, servico_id, body.orcamento_id)
    if not servico:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return servico


@router.delete("/{servico_id}", status_code=204)
def delete_servico(servico_id: int, db: Session = Depends(get_db)):
    if not ServicoService.delete_servico(db, servico_id):
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
@router.put("/{servico_id}/vincular-os/{ordem_servico_id}", response_model=ServicoResponse)
def vincular_os(servico_id: int, ordem_servico_id: int, db: Session = Depends(get_db)):
    """Vincula uma Ordem de Serviço manualmente ao serviço."""
    updated = ServicoService.vincular_os_manual(db, servico_id, ordem_servico_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return updated


@router.put("/{servico_id}/desvincular-os", response_model=ServicoResponse)
def desvincular_os(servico_id: int, db: Session = Depends(get_db)):
    """Remove o vínculo da Ordem de Serviço do serviço."""
    updated = ServicoService.desvincular_os_manual(db, servico_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return updated
