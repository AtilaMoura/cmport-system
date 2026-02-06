from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.domains.condominios.service import CondominioService
from app.domains.condominios.schema import CondominioCreate, CondominioUpdate, CondominioResponse, CondominioFullResponse


router = APIRouter()


# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/sync-auvo", tags=["Sincronização"])
def trigger_sync(db: Session = Depends(get_db)):
    """Dispara a sincronização manual com o Auvo"""
    from app.domains.auvo.service import AuvoSyncService
    return AuvoSyncService.sync_all_customers(db)

@router.post("/", response_model=CondominioResponse, status_code=201)
def create_condominio(
    condominio: CondominioCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo condomínio"""
    return CondominioService.create_condominio(db, condominio)


@router.get("/", response_model=List[CondominioResponse])
def list_condominios(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    ativo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Lista todos os condomínios"""
    return CondominioService.list_condominios(db, skip, limit, ativo)


@router.get("/search", response_model=List[CondominioResponse])
def search_condominios(
    nome: str = Query(..., min_length=3),
    db: Session = Depends(get_db)
):
    """Busca condomínios por nome"""
    return CondominioService.search_condominios(db, nome)


@router.get("/{condominio_id}", response_model=CondominioFullResponse) # Alterado o response_model
def get_condominio(
    condominio_id: int,
    db: Session = Depends(get_db)
):
    """Busca um condomínio por ID com todos os seus detalhes (Endereço e Contatos)"""
    condominio = CondominioService.get_condominio_full(db, condominio_id)
    
    if not condominio:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    
    return condominio


@router.put("/{condominio_id}", response_model=CondominioResponse)
def update_condominio(
    condominio_id: int,
    condominio_update: CondominioUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um condomínio"""
    condominio = CondominioService.update_condominio(db, condominio_id, condominio_update)
    
    if not condominio:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    
    return condominio


@router.delete("/{condominio_id}", status_code=204)
def delete_condominio(
    condominio_id: int,
    db: Session = Depends(get_db)
):
    """Deleta um condomínio"""
    success = CondominioService.delete_condominio(db, condominio_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Condomínio não encontrado")
    
    return None