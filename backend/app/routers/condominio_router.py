from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.services.condominio_service import CondominioService
from app.schemas.condominio_schema import CondominioCreate, CondominioUpdate, CondominioResponse, CondominioFullResponse

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/sync-auvo", tags=["Sincronização"])
def trigger_sync(db: Session = Depends(get_db)):
    from app.services.auvo_service import AuvoSyncService
    return AuvoSyncService.sync_all_customers(db)


@router.post("/", response_model=CondominioResponse, status_code=201)
def create_condominio(condominio: CondominioCreate, db: Session = Depends(get_db)):
    return CondominioService.create_condominio(db, condominio)


@router.get("/", response_model=List[CondominioResponse])
def list_condominios(
    skip: int = Query(0, ge=0),
    limit: int = Query(700, ge=1, le=700),
    ativo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    return CondominioService.list_condominios(db, skip, limit, ativo)


@router.get("/search", response_model=List[CondominioResponse])
def search_condominios(nome: str = Query(..., min_length=3), db: Session = Depends(get_db)):
    return CondominioService.search_condominios(db, nome)


@router.get("/{condominio_id}", response_model=CondominioFullResponse)
def get_condominio(condominio_id: int, db: Session = Depends(get_db)):
    condominio = CondominioService.get_condominio_full(db, condominio_id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    return condominio


@router.put("/{condominio_id}", response_model=CondominioResponse)
def update_condominio(condominio_id: int, condominio_update: CondominioUpdate, db: Session = Depends(get_db)):
    condominio = CondominioService.update_condominio(db, condominio_id, condominio_update)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    return condominio


@router.delete("/{condominio_id}", status_code=204)
def delete_condominio(condominio_id: int, db: Session = Depends(get_db)):
    if not CondominioService.delete_condominio(db, condominio_id):
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
