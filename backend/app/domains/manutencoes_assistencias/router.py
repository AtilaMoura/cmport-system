from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
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

@router.get("/condominio/{condominio_id}", response_model=List[ServicoResponse])
def list_servicos(condominio_id: int, db: Session = Depends(get_db)):
    return ServicoService.list_servicos_condominio(db, condominio_id)

@router.delete("/{servico_id}", status_code=204)
def delete_servico(servico_id: int, db: Session = Depends(get_db)):
    if not ServicoService.delete_servico(db, servico_id):
        raise HTTPException(status_code=404, detail="Serviço não encontrado")