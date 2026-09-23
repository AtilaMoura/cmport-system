"""
condominio_lookup_service.py — validação de condominio_id contra o banco principal
(cmport_gerenciamento), usado por qualquer service do módulo Câmeras (schema
separado, sem FK entre bancos).
"""
from typing import Dict, Iterable

from fastapi import HTTPException

from app.core.database import SessionLocal as SessionLocalPrincipal
from app.models.condominio_model import Condominio


def buscar_condominio_ou_404(condominio_id: int) -> Condominio:
    db_principal = SessionLocalPrincipal()
    try:
        condominio = db_principal.query(Condominio).filter(Condominio.id == condominio_id).first()
        if not condominio:
            raise HTTPException(404, f"Condomínio {condominio_id} não encontrado.")
        return condominio
    finally:
        db_principal.close()


def nomes_por_ids(condominio_ids: Iterable[int]) -> Dict[int, str]:
    """{id: nome} de vários condomínios numa consulta só — pra listagens do módulo
    Câmeras (evita abrir uma sessão no banco principal por item)."""
    ids = {i for i in condominio_ids if i is not None}
    if not ids:
        return {}
    db_principal = SessionLocalPrincipal()
    try:
        linhas = (
            db_principal.query(Condominio.id, Condominio.nome)
            .filter(Condominio.id.in_(ids))
            .all()
        )
        return {cid: nome for cid, nome in linhas}
    finally:
        db_principal.close()
