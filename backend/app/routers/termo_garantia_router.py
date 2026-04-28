from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db
from app.schemas.termo_garantia_schema import TermoGarantiaSchema, TermoGarantiaCreate, TermoGarantiaUpdate
from app.repositories.termo_garantia_repository import TermoGarantiaRepository
from app.services.termo_garantia_service import TermoGarantiaService

router = APIRouter(prefix="/termos-garantia", tags=["Termos de Garantia"])

@router.post("/", response_model=TermoGarantiaSchema)
def create_termo(termo: TermoGarantiaCreate, db: Session = Depends(get_db)):
    # Verifica se já existe um termo para este serviço
    existente = TermoGarantiaRepository.get_by_servico_id(db, termo.servico_id)
    if existente:
        raise HTTPException(status_code=400, detail="Já existe um termo de garantia para este serviço")
    return TermoGarantiaRepository.create(db, termo.model_dump())

@router.get("/servico/{servico_id}", response_model=TermoGarantiaSchema)
def get_termo_by_servico(servico_id: int, db: Session = Depends(get_db)):
    termo = TermoGarantiaRepository.get_by_servico_id(db, servico_id)
    if not termo:
        raise HTTPException(status_code=404, detail="Termo de garantia não encontrado")
    return termo

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
