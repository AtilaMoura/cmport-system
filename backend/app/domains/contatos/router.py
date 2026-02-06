from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import SessionLocal
from app.domains.contatos.service import ContatoService
from app.domains.contatos.schema import ContatoCreate, ContatoUpdate, ContatoResponse


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=ContatoResponse, status_code=201)
def create_contato(
    contato: ContatoCreate,
    db: Session = Depends(get_db)
):
    """Cria um novo contato"""
    return ContatoService.create_contato(db, contato)


@router.get("/condominio/{condominio_id}", response_model=List[ContatoResponse])
def list_contatos_by_condominio(
    condominio_id: int,
    db: Session = Depends(get_db)
):
    """Lista todos os contatos de um condomínio"""
    return ContatoService.list_contatos_by_condominio(db, condominio_id)


@router.get("/condominio/{condominio_id}/principal", response_model=ContatoResponse)
def get_contato_principal(
    condominio_id: int,
    db: Session = Depends(get_db)
):
    """Busca o contato principal de um condomínio"""
    contato = ContatoService.get_contato_principal(db, condominio_id)
    
    if not contato:
        raise HTTPException(status_code=404, detail="Contato principal não encontrado")
    
    return contato


@router.get("/{contato_id}", response_model=ContatoResponse)
def get_contato(
    contato_id: int,
    db: Session = Depends(get_db)
):
    """Busca um contato por ID"""
    contato = ContatoService.get_contato(db, contato_id)
    
    if not contato:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    return contato


@router.put("/{contato_id}", response_model=ContatoResponse)
def update_contato(
    contato_id: int,
    contato_update: ContatoUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um contato"""
    contato = ContatoService.update_contato(db, contato_id, contato_update)
    
    if not contato:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    return contato


@router.delete("/{contato_id}", status_code=204)
def delete_contato(
    contato_id: int,
    db: Session = Depends(get_db)
):
    """Deleta um contato"""
    success = ContatoService.delete_contato(db, contato_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    return None