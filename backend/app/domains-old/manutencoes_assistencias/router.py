from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import SessionLocal
from .service import ServicoService
from .schema import ServicoCreate, ServicoUpdate, ServicoResponse

router = APIRouter()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

@router.post("/", response_model=ServicoResponse, status_code=201)
def create_servico(servico: ServicoCreate, db: Session = Depends(get_db)):
    return ServicoService.create_servico(db, servico)

@router.get("/{servico_id}", response_model=ServicoResponse)
def get_servico(
    servico_id: int,
    db: Session = Depends(get_db)
):
    """Retorna os detalhes de um serviço específico pelo ID"""
    servico = ServicoService.get_servico_by_id(db, servico_id)  # ou use o repository direto
    
    if not servico:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    return servico

@router.get("/condominio/{condominio_id}", response_model=List[ServicoResponse])
def list_servicos(condominio_id: int, db: Session = Depends(get_db)):
    return ServicoService.list_servicos_condominio(db, condominio_id)

@router.delete("/{servico_id}", status_code=204)
def delete_servico(servico_id: int, db: Session = Depends(get_db)):
    if not ServicoService.delete_servico(db, servico_id):
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
@router.get("/", response_model=List[ServicoResponse])
def list_all_servicos(
    condominio_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Lista todos os serviços, com filtro opcional por condomínio"""
    return ServicoService.list_all_servicos(db, condominio_id)

@router.put("/{servico_id}", response_model=ServicoResponse)
def update_servico(servico_id: int, servico_update: ServicoUpdate, db: Session = Depends(get_db)):
    updated = ServicoService.update_servico(db, servico_id, servico_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return updated