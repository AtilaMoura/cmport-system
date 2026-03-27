from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import threading

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


# ── Estado global do sync Auvo ───────────────────────────────────────────────
_sync_estado = {
    "rodando": False,
    "concluido": False,
    "processados": 0,
    "total": 0,
    "novos": 0,
    "atualizados": 0,
    "erros": 0,
    "mensagem": "",
}


@router.post("/sync-auvo/iniciar", tags=["Sincronização"])
def iniciar_sync_auvo():
    """Inicia a sincronização com o Auvo em background. Retorna imediatamente."""
    if _sync_estado["rodando"]:
        return {"status": "ja_rodando", "mensagem": "Sync já está em andamento."}

    from app.services.auvo_service import AuvoSyncService

    _sync_estado.update({
        "rodando": True, "concluido": False,
        "processados": 0, "total": 0,
        "novos": 0, "atualizados": 0, "erros": 0,
        "mensagem": "Iniciando...",
    })

    def _run():
        db = SessionLocal()
        try:
            def _progresso(processados, total, novos=0, atualizados=0, erros=0):
                _sync_estado.update({
                    "processados": processados,
                    "total": total,
                    "novos": novos,
                    "atualizados": atualizados,
                    "erros": erros,
                    "mensagem": f"{processados}/{total} processados",
                })

            relatorio = AuvoSyncService.sync_all_customers(db, progress_callback=_progresso)
            _sync_estado.update({
                "rodando": False,
                "concluido": True,
                "novos": relatorio["novos"],
                "atualizados": relatorio["atualizados"],
                "erros": relatorio["erros"],
                "mensagem": f"Concluído: {relatorio['novos']} novos, {relatorio['atualizados']} atualizados, {relatorio['erros']} erros.",
            })
        except Exception as e:
            _sync_estado.update({"rodando": False, "concluido": True, "mensagem": f"Erro: {e}"})
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "iniciado"}


@router.get("/sync-auvo/progresso", tags=["Sincronização"])
def progresso_sync_auvo():
    """Retorna o estado atual da sincronização com o Auvo."""
    return dict(_sync_estado)


@router.post("/sync-auvo", tags=["Sincronização"])
def trigger_sync(db: Session = Depends(get_db)):
    from app.services.auvo_service import AuvoSyncService
    return AuvoSyncService.sync_all_customers(db)


@router.post("", response_model=CondominioResponse, status_code=201)
def create_condominio(condominio: CondominioCreate, db: Session = Depends(get_db)):
    return CondominioService.create_condominio(db, condominio)


@router.get("", response_model=List[CondominioResponse])
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
