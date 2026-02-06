from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from .service import EnderecoService
from .schema import EnderecoCreate, EnderecoUpdate, EnderecoResponse

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=EnderecoResponse)
def create_or_update_endereco(endereco: EnderecoCreate, db: Session = Depends(get_db)):
    """Cria ou atualiza o endereço de um condomínio"""
    return EnderecoService.create_endereco(db, endereco)

@router.get("/condominio/{condominio_id}", response_model=EnderecoResponse)
def get_endereco(condominio_id: int, db: Session = Depends(get_db)):
    """Busca endereço pelo ID do condomínio"""
    endereco = EnderecoService.get_endereco_by_condominio(db, condominio_id)
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado")
    return endereco