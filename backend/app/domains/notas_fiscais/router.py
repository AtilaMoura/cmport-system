from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import SessionLocal # Ajuste se o caminho for diferente
from .service import NotaFiscalService
from .schema import NotaFiscalCreate, NotaFiscalResponse
from typing import List

router = APIRouter()

# Dependência para obter a sessão do banco
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=NotaFiscalResponse)
def create_nota(nota: NotaFiscalCreate, db: Session = Depends(get_db)):
    """Cria uma nova Nota Fiscal no sistema"""
    try:
        return NotaFiscalService.create_nota(db, nota)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao criar nota: {str(e)}")

@router.get("/", response_model=List[NotaFiscalResponse])
def list_notas(db: Session = Depends(get_db)):
    """Lista todas as notas fiscais cadastradas"""
    return NotaFiscalService.get_all_notas(db)

@router.get("/numero/{numero}", response_model=NotaFiscalResponse)
def get_nota(numero: str, db: Session = Depends(get_db)):
    """Busca uma nota específica pelo número"""
    nota = NotaFiscalService.get_nota_by_numero(db, numero)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota Fiscal não encontrada")
    return nota
@router.get("/{id}", response_model=NotaFiscalResponse)
def get_nota_id(id: int, db: Session = Depends(get_db)):
    """Busca uma nota específica pelo id"""
    print('ID aqui ',id)
    nota = NotaFiscalService.get_nota_by_id(db, id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota Fiscal não encontrada")
    return nota