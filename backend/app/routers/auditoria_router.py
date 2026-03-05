from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.core.database import SessionLocal
from app.models.nota_fiscal_model import NotaFiscal
from app.schemas.nota_fiscal_schema import NotaFiscalUpdate
from app.models.servico_model import ManutencaoAssistencia
from app.schemas.servico_schema import ServicoUpdate
from app.models.exclusao_model import RegistroExclusao

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def registrar_exclusao(db: Session, tipo: str, registro_id: int, dados: dict, motivo: str = None):
    registro = RegistroExclusao(
        tipo_registro=tipo,
        registro_id=registro_id,
        dados_completos=json.dumps(dados, ensure_ascii=False, indent=2, default=str),
        motivo_exclusao=motivo,
        usuario_exclusao="sistema"
    )
    db.add(registro)
    db.commit()


@router.put("/notas-fiscais/{nota_id}")
def atualizar_nota(nota_id: int, nota_update: NotaFiscalUpdate, db: Session = Depends(get_db)):
    nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Nota fiscal {nota_id} não encontrada")
    update_data = nota_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(nota, field, value)
    db.commit()
    db.refresh(nota)
    return {"message": "Nota fiscal atualizada com sucesso", "nota": {"id": nota.id, "numero_nota": nota.numero_nota}}


@router.delete("/notas-fiscais/{nota_id}")
def excluir_nota(nota_id: int, motivo: str = Query(None), db: Session = Depends(get_db)):
    nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Nota fiscal {nota_id} não encontrada")
    dados_nota = {
        "id": nota.id, "numero_nota": nota.numero_nota, "tipo": nota.tipo.value if nota.tipo else None,
        "valor": float(nota.valor), "condominio_id": nota.condominio_id,
    }
    registrar_exclusao(db=db, tipo="nota_fiscal", registro_id=nota.id, dados=dados_nota, motivo=motivo or "Exclusão via sistema")
    db.delete(nota)
    db.commit()
    return {"message": "Nota fiscal excluída com sucesso", "nota_id": nota_id}


@router.put("/servicos/{servico_id}")
def atualizar_servico(servico_id: int, servico_update: ServicoUpdate, db: Session = Depends(get_db)):
    servico = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()
    if not servico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Serviço {servico_id} não encontrado")
    update_data = servico_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(servico, field, value)
    db.commit()
    db.refresh(servico)
    return {"message": "Serviço atualizado com sucesso", "servico": {"id": servico.id, "tipo": servico.tipo.value}}


@router.delete("/servicos/{servico_id}")
def excluir_servico(servico_id: int, motivo: str = Query(None), db: Session = Depends(get_db)):
    servico = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()
    if not servico:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Serviço {servico_id} não encontrado")
    dados_servico = {
        "id": servico.id, "condominio_id": servico.condominio_id,
        "tipo": servico.tipo.value if servico.tipo else None,
        "data_servico": servico.data_servico.isoformat() if servico.data_servico else None,
        "nota_fiscal_id": servico.nota_fiscal_id,
    }
    registrar_exclusao(db=db, tipo="servico", registro_id=servico.id, dados=dados_servico, motivo=motivo or "Exclusão via sistema")
    db.delete(servico)
    db.commit()
    return {"message": "Serviço excluído com sucesso", "servico_id": servico_id}


@router.get("/exclusoes")
def listar_exclusoes(tipo: str = Query(None), limit: int = Query(50), db: Session = Depends(get_db)):
    query = db.query(RegistroExclusao)
    if tipo:
        query = query.filter(RegistroExclusao.tipo_registro == tipo)
    exclusoes = query.order_by(RegistroExclusao.data_exclusao.desc()).limit(limit).all()
    return {
        "total": len(exclusoes),
        "exclusoes": [
            {"id": e.id, "tipo": e.tipo_registro, "registro_id": e.registro_id,
             "dados": json.loads(e.dados_completos), "motivo": e.motivo_exclusao,
             "usuario": e.usuario_exclusao, "data_exclusao": e.data_exclusao.isoformat()}
            for e in exclusoes
        ]
    }
