from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.termo_garantia_schema import TermoGarantiaSchema, TermoGarantiaCreate, TermoGarantiaUpdate
from app.repositories.termo_garantia_repository import TermoGarantiaRepository
from app.services.termo_garantia_service import TermoGarantiaService

router = APIRouter(tags=["Termos de Garantia"])


@router.post("/", response_model=TermoGarantiaSchema)
def upsert_termo(termo: TermoGarantiaCreate, db: Session = Depends(get_db)):
    """Cria ou regera o termo de garantia para o serviço (upsert por servico_id)."""
    return TermoGarantiaRepository.upsert_by_servico_id(db, termo.servico_id, termo.model_dump())


@router.get("/servico/{servico_id}", response_model=TermoGarantiaSchema)
def get_termo_by_servico(servico_id: int, db: Session = Depends(get_db)):
    termo = TermoGarantiaRepository.get_by_servico_id(db, servico_id)
    if not termo:
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return termo


@router.get("/servico/{servico_id}/pdf")
def get_termo_pdf_by_servico(servico_id: int, db: Session = Depends(get_db)):
    termo = TermoGarantiaRepository.get_by_servico_id(db, servico_id)
    if not termo:
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    try:
        buffer = TermoGarantiaService.gerar_pdf(db, termo.id)
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=termo_garantia_servico_{servico_id}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/servico/{servico_id}")
def delete_termo_by_servico(servico_id: int, db: Session = Depends(get_db)):
    if not TermoGarantiaRepository.delete_by_servico_id(db, servico_id):
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return {"message": "Termo de garantia removido com sucesso"}


@router.get("/{termo_id}", response_model=TermoGarantiaSchema)
def get_termo(termo_id: int, db: Session = Depends(get_db)):
    termo = TermoGarantiaRepository.get_by_id(db, termo_id)
    if not termo:
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return termo


@router.patch("/{termo_id}", response_model=TermoGarantiaSchema)
def update_termo(termo_id: int, termo: TermoGarantiaUpdate, db: Session = Depends(get_db)):
    db_termo = TermoGarantiaRepository.update(db, termo_id, termo.model_dump(exclude_unset=True))
    if not db_termo:
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return db_termo


@router.delete("/{termo_id}")
def delete_termo(termo_id: int, db: Session = Depends(get_db)):
    if not TermoGarantiaRepository.delete(db, termo_id):
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return {"message": "Termo de garantia removido com sucesso"}


@router.get("/{termo_id}/pdf")
def get_termo_pdf(termo_id: int, db: Session = Depends(get_db)):
    try:
        buffer = TermoGarantiaService.gerar_pdf(db, termo_id)
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=termo_garantia_{termo_id}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{termo_id}/preview-html", response_class=HTMLResponse)
def get_termo_preview_html(termo_id: int, db: Session = Depends(get_db)):
    try:
        html_str = TermoGarantiaService.gerar_html_preview(db, termo_id)
        return HTMLResponse(content=html_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
