from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import SessionLocal
from app.services.ordem_servico_service import OrdemServicoService
from app.schemas.ordem_servico_schema import (
    OrdemServicoResponse,
    OrdemServicoListResponse,
    SincronizarRequest,
    SincronizarResponse,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/sincronizar", response_model=SincronizarResponse)
def sincronizar_ordens(request: SincronizarRequest, db: Session = Depends(get_db)):
    return OrdemServicoService.sincronizar(db, request.date_start, request.date_end)


@router.get("", response_model=OrdemServicoListResponse)
def listar_ordens(
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
    status: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = OrdemServicoService.listar(db, data_inicio, data_fim, status, search, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{task_id}/pdf")
def baixar_pdf_ordem(task_id: int, db: Session = Depends(get_db)):
    pdf = OrdemServicoService.baixar_pdf(db, task_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF não disponível para esta OS")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="os_{task_id}.pdf"'},
    )


@router.get("/{task_id}", response_model=OrdemServicoResponse)
def detalhe_ordem(task_id: int, db: Session = Depends(get_db)):
    ordem = OrdemServicoService.detalhe(db, task_id)
    if not ordem:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    return ordem
