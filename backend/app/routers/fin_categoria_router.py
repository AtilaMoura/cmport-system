from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.repositories.fin_categoria_repository import FinCategoriaRepository
from app.schemas.fin_categoria_schema import (
    CategoriaFinanceiraCreate, CategoriaFinanceiraUpdate, CategoriaFinanceiraResponse,
)
from app.models.fin_categoria_model import GrupoCategoria

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/", response_model=List[CategoriaFinanceiraResponse])
def listar(
    grupo: Optional[str] = None,
    ativo: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return FinCategoriaRepository.get_all(db, grupo=grupo, ativo=ativo)


@router.post("/", response_model=CategoriaFinanceiraResponse, status_code=201)
def criar(req: CategoriaFinanceiraCreate, db: Session = Depends(get_db)):
    if req.grupo not in (g.value for g in GrupoCategoria):
        raise HTTPException(400, "grupo inválido. Use RECEITA, FORNECEDOR ou DESPESA.")
    tipo = "ENTRADA" if req.grupo == "RECEITA" else "SAIDA"
    try:
        return FinCategoriaRepository.create(db, {"nome": req.nome, "grupo": req.grupo, "tipo": tipo, "ordem": req.ordem})
    except Exception as e:
        raise HTTPException(400, str(e))


@router.put("/{id}", response_model=CategoriaFinanceiraResponse)
def atualizar(id: int, req: CategoriaFinanceiraUpdate, db: Session = Depends(get_db)):
    obj = FinCategoriaRepository.get_by_id(db, id)
    if not obj:
        raise HTTPException(404, "Categoria não encontrada.")
    dados = {k: v for k, v in req.model_dump().items() if v is not None}
    try:
        return FinCategoriaRepository.update(db, obj, dados)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.delete("/{id}", response_model=CategoriaFinanceiraResponse)
def desativar(id: int, db: Session = Depends(get_db)):
    obj = FinCategoriaRepository.get_by_id(db, id)
    if not obj:
        raise HTTPException(404, "Categoria não encontrada.")
    return FinCategoriaRepository.desativar(db, obj)
