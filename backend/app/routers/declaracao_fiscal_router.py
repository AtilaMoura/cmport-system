from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.services.declaracao_fiscal_service import DeclaracaoFiscalService

router = APIRouter(tags=["Declarações Fiscais"])


@router.get("/{servico_id}/declaracao-inss/pdf")
def get_declaracao_inss_pdf(servico_id: int, db: Session = Depends(get_db)):
    try:
        buffer = DeclaracaoFiscalService.gerar_pdf(db, servico_id, "inss")
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=declaracao_inss_servico_{servico_id}.pdf"}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{servico_id}/declaracao-simples/pdf")
def get_declaracao_simples_pdf(servico_id: int, db: Session = Depends(get_db)):
    try:
        buffer = DeclaracaoFiscalService.gerar_pdf(db, servico_id, "simples")
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=declaracao_simples_servico_{servico_id}.pdf"}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{servico_id}/declaracao-inss/preview-html", response_class=HTMLResponse)
def get_declaracao_inss_preview(servico_id: int, db: Session = Depends(get_db)):
    try:
        html = DeclaracaoFiscalService.gerar_html_preview(db, servico_id, "inss")
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{servico_id}/declaracao-simples/preview-html", response_class=HTMLResponse)
def get_declaracao_simples_preview(servico_id: int, db: Session = Depends(get_db)):
    try:
        html = DeclaracaoFiscalService.gerar_html_preview(db, servico_id, "simples")
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
