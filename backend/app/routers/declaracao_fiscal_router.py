from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.services.declaracao_fiscal_service import DeclaracaoFiscalService
from app.repositories.declaracao_fiscal_repository import DeclaracaoFiscalRepository

router = APIRouter(tags=["Declarações Fiscais"])

_TIPOS_VALIDOS = {"inss", "simples"}


def _check_tipo(tipo: str):
    if tipo not in _TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido: '{tipo}'. Use 'inss' ou 'simples'.")


# ---------- listagem ----------------------------------------------------------

@router.get("/{servico_id}/declaracoes")
def listar_declaracoes(servico_id: int, db: Session = Depends(get_db)):
    """Retorna quais declarações já foram geradas para o serviço."""
    registros = DeclaracaoFiscalRepository.get_all_by_servico(db, servico_id)
    return [
        {"tipo": r.tipo, "gerada_em": r.gerada_em.isoformat() if r.gerada_em else None}
        for r in registros
    ]


# ---------- gerar / regerar ---------------------------------------------------

@router.post("/{servico_id}/declaracao/{tipo}/gerar")
def gerar_declaracao(servico_id: int, tipo: str, db: Session = Depends(get_db)):
    _check_tipo(tipo)
    try:
        registro = DeclaracaoFiscalService.gerar(db, servico_id, tipo)
        return {"tipo": registro.tipo, "gerada_em": registro.gerada_em.isoformat()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- remover -----------------------------------------------------------

@router.delete("/{servico_id}/declaracao/{tipo}")
def remover_declaracao(servico_id: int, tipo: str, db: Session = Depends(get_db)):
    _check_tipo(tipo)
    removido = DeclaracaoFiscalService.remover(db, servico_id, tipo)
    if not removido:
        raise HTTPException(status_code=404, detail="Declaração não encontrada.")
    return {"ok": True}


# ---------- preview HTML ------------------------------------------------------

@router.get("/{servico_id}/declaracao/{tipo}/preview-html", response_class=HTMLResponse)
def get_declaracao_preview(servico_id: int, tipo: str, db: Session = Depends(get_db)):
    _check_tipo(tipo)
    try:
        html = DeclaracaoFiscalService.gerar_html_preview(db, servico_id, tipo)
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- PDF ---------------------------------------------------------------

@router.get("/{servico_id}/declaracao/{tipo}/pdf")
def get_declaracao_pdf(servico_id: int, tipo: str, db: Session = Depends(get_db)):
    _check_tipo(tipo)
    try:
        buffer = DeclaracaoFiscalService.gerar_pdf(db, servico_id, tipo)
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=declaracao_{tipo}_servico_{servico_id}.pdf"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- rotas legadas (mantém compatibilidade) ----------------------------

@router.get("/{servico_id}/declaracao-inss/pdf")
def get_declaracao_inss_pdf_legado(servico_id: int, db: Session = Depends(get_db)):
    return get_declaracao_pdf(servico_id, "inss", db)


@router.get("/{servico_id}/declaracao-simples/pdf")
def get_declaracao_simples_pdf_legado(servico_id: int, db: Session = Depends(get_db)):
    return get_declaracao_pdf(servico_id, "simples", db)


@router.get("/{servico_id}/declaracao-inss/preview-html", response_class=HTMLResponse)
def get_declaracao_inss_preview_legado(servico_id: int, db: Session = Depends(get_db)):
    return get_declaracao_preview(servico_id, "inss", db)


@router.get("/{servico_id}/declaracao-simples/preview-html", response_class=HTMLResponse)
def get_declaracao_simples_preview_legado(servico_id: int, db: Session = Depends(get_db)):
    return get_declaracao_preview(servico_id, "simples", db)
