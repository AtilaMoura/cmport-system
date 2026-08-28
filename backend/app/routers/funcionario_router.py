from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import SessionLocal
from app.services.funcionario_service import FuncionarioService
from app.schemas.funcionario_schema import (
    FuncionarioCreate, FuncionarioUpdate, FuncionarioResponse,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[FuncionarioResponse])
@router.get("/", response_model=List[FuncionarioResponse])
def listar(incluir_inativos: bool = True, db: Session = Depends(get_db)):
    return FuncionarioService.listar(db, incluir_inativos=incluir_inativos)


@router.post("", response_model=FuncionarioResponse, status_code=201)
@router.post("/", response_model=FuncionarioResponse, status_code=201)
def criar(req: FuncionarioCreate, db: Session = Depends(get_db)):
    try:
        return FuncionarioService.criar(db, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{id}", response_model=FuncionarioResponse)
def buscar(id: int, db: Session = Depends(get_db)):
    try:
        return FuncionarioService.buscar(db, id)
    except Exception as e:
        raise HTTPException(404, str(e))


@router.put("/{id}", response_model=FuncionarioResponse)
def editar(id: int, req: FuncionarioUpdate, db: Session = Depends(get_db)):
    try:
        return FuncionarioService.editar(db, id, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.delete("/{id}", status_code=204)
def deletar(id: int, db: Session = Depends(get_db)):
    try:
        FuncionarioService.deletar(db, id)
    except Exception as e:
        raise HTTPException(400, str(e))
