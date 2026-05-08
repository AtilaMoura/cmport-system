from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import SessionLocal
from app.schemas.configuracao_schema import (
    ConfiguracaoEmailCreate, ConfiguracaoEmailUpdate,
    ConfiguracaoEmailResponse, ConfiguracaoEmpresaSchema, TestarEmailResponse,
    ConfiguracaoInterCreate, ConfiguracaoInterUpdate, ConfiguracaoInterResponse,
)
from app.services.configuracao_service import ConfiguracaoService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Email ──────────────────────────────────────────────────────────────────────

@router.get("/emails", response_model=List[ConfiguracaoEmailResponse])
def listar_emails(db: Session = Depends(get_db)):
    return ConfiguracaoService.listar_emails(db)


@router.post("/emails", response_model=ConfiguracaoEmailResponse, status_code=201)
def criar_email(req: ConfiguracaoEmailCreate, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.criar_email(db, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/emails/{id}", response_model=ConfiguracaoEmailResponse)
def atualizar_email(id: int, req: ConfiguracaoEmailUpdate, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.atualizar_email(db, id, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/emails/{id}/ativar", response_model=ConfiguracaoEmailResponse)
def ativar_email(id: int, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.ativar_email(db, id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/emails/{id}", status_code=204)
def deletar_email(id: int, db: Session = Depends(get_db)):
    try:
        ConfiguracaoService.deletar_email(db, id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/emails/{id}/testar", response_model=TestarEmailResponse)
def testar_email(id: int, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.testar_email(db, id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Empresa ────────────────────────────────────────────────────────────────────

@router.get("/empresa", response_model=ConfiguracaoEmpresaSchema)
def get_empresa(db: Session = Depends(get_db)):
    return ConfiguracaoService.get_empresa(db)


@router.put("/empresa", response_model=ConfiguracaoEmpresaSchema)
def salvar_empresa(req: ConfiguracaoEmpresaSchema, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.salvar_empresa(db, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Contas Banco Inter ─────────────────────────────────────────────────────────

@router.get("/inter", response_model=List[ConfiguracaoInterResponse])
def listar_inter(db: Session = Depends(get_db)):
    return ConfiguracaoService.listar_inter(db)


@router.post("/inter", response_model=ConfiguracaoInterResponse, status_code=201)
def criar_inter(req: ConfiguracaoInterCreate, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.criar_inter(db, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/inter/{id}", response_model=ConfiguracaoInterResponse)
def atualizar_inter(id: int, req: ConfiguracaoInterUpdate, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.atualizar_inter(db, id, req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/inter/{id}", response_model=ConfiguracaoInterResponse)
def desativar_inter(id: int, db: Session = Depends(get_db)):
    try:
        return ConfiguracaoService.desativar_inter(db, id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
