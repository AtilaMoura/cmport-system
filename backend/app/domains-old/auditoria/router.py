from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.core.database import SessionLocal
from app.domains.notas_fiscais.model import NotaFiscal
from app.domains.notas_fiscais.schema import NotaFiscalUpdate
from app.domains.manutencoes_assistencias.model import ManutencaoAssistencia
from app.domains.manutencoes_assistencias.schema import ServicoUpdate
from .model import RegistroExclusao

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def registrar_exclusao(db: Session, tipo: str, registro_id: int, dados: dict, motivo: str = None):
    """Registra uma exclusão na tabela de auditoria"""
    registro = RegistroExclusao(
        tipo_registro=tipo,
        registro_id=registro_id,
        dados_completos=json.dumps(dados, ensure_ascii=False, indent=2, default=str),
        motivo_exclusao=motivo,
        usuario_exclusao="sistema"
    )
    db.add(registro)
    db.commit()


# ===== NOTAS FISCAIS =====

@router.put("/notas-fiscais/{nota_id}")
def atualizar_nota(
    nota_id: int,
    nota_update: NotaFiscalUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza uma nota fiscal existente"""
    nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
    
    if not nota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nota fiscal com ID {nota_id} não encontrada"
        )
    
    update_data = nota_update.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(nota, field, value)
    
    db.commit()
    db.refresh(nota)
    
    return {
        "message": "Nota fiscal atualizada com sucesso",
        "nota": {
            "id": nota.id,
            "numero_nota": nota.numero_nota,
            "valor": float(nota.valor),
            "data_vencimento": nota.data_vencimento.isoformat(),
            "observacao": nota.observacao
        }
    }


@router.delete("/notas-fiscais/{nota_id}")
def excluir_nota(
    nota_id: int,
    motivo: str = Query(None),
    db: Session = Depends(get_db)
):
    """Exclui uma nota fiscal e registra na auditoria"""
    nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
    
    if not nota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nota fiscal com ID {nota_id} não encontrada"
        )
    
    # Capturar todos os dados antes de excluir
    dados_nota = {
        "id": nota.id,
        "numero_nota": nota.numero_nota,
        "tipo": nota.tipo.value if nota.tipo else None,
        "parcelas": nota.parcelas,
        "valor": float(nota.valor),
        "data_vencimento": nota.data_vencimento.isoformat() if nota.data_vencimento else None,
        "data_pagamento": nota.data_pagamento.isoformat() if nota.data_pagamento else None,
        "cliente_nome": nota.cliente_nome,
        "observacao": nota.observacao,
        "condominio_id": nota.condominio_id,
        "criado_em": nota.criado_em.isoformat() if nota.criado_em else None
    }
    
    # Registrar na auditoria
    registrar_exclusao(
        db=db,
        tipo="nota_fiscal",
        registro_id=nota.id,
        dados=dados_nota,
        motivo=motivo or "Exclusão via sistema"
    )
    
    # Excluir o registro
    db.delete(nota)
    db.commit()
    
    return {
        "message": "Nota fiscal excluída com sucesso",
        "nota_id": nota_id,
        "numero_nota": dados_nota["numero_nota"],
        "auditoria": "Registro salvo na tabela de exclusões"
    }


# ===== SERVIÇOS =====

@router.put("/servicos/{servico_id}")
def atualizar_servico(
    servico_id: int,
    servico_update: ServicoUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um serviço existente"""
    servico = db.query(ManutencaoAssistencia).filter(
        ManutencaoAssistencia.id == servico_id
    ).first()
    
    if not servico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Serviço com ID {servico_id} não encontrado"
        )
    
    update_data = servico_update.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(servico, field, value)
    
    db.commit()
    db.refresh(servico)
    
    return {
        "message": "Serviço atualizado com sucesso",
        "servico": {
            "id": servico.id,
            "tipo": servico.tipo.value,
            "data_servico": servico.data_servico.isoformat(),
            "descricao": servico.descricao
        }
    }


@router.delete("/servicos/{servico_id}")
def excluir_servico(
    servico_id: int,
    motivo: str = Query(None),
    db: Session = Depends(get_db)
):
    """Exclui um serviço e registra na auditoria"""
    servico = db.query(ManutencaoAssistencia).filter(
        ManutencaoAssistencia.id == servico_id
    ).first()
    
    if not servico:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Serviço com ID {servico_id} não encontrado"
        )
    
    # Capturar todos os dados
    dados_servico = {
        "id": servico.id,
        "condominio_id": servico.condominio_id,
        "tipo": servico.tipo.value if servico.tipo else None,
        "data_servico": servico.data_servico.isoformat() if servico.data_servico else None,
        "descricao": servico.descricao,
        "nota_fiscal_id": servico.nota_fiscal_id,
        "criado_em": servico.criado_em.isoformat() if servico.criado_em else None,
        "atualizado_em": servico.atualizado_em.isoformat() if servico.atualizado_em else None
    }
    
    # Registrar na auditoria
    registrar_exclusao(
        db=db,
        tipo="servico",
        registro_id=servico.id,
        dados=dados_servico,
        motivo=motivo or "Exclusão via sistema"
    )
    
    # Excluir o registro
    db.delete(servico)
    db.commit()
    
    return {
        "message": "Serviço excluído com sucesso",
        "servico_id": servico_id,
        "tipo": dados_servico["tipo"],
        "auditoria": "Registro salvo na tabela de exclusões"
    }


# ===== CONSULTAR HISTÓRICO =====

@router.get("/exclusoes")
def listar_exclusoes(
    tipo: str = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """Lista exclusões registradas"""
    query = db.query(RegistroExclusao)
    
    if tipo:
        query = query.filter(RegistroExclusao.tipo_registro == tipo)
    
    exclusoes = query.order_by(RegistroExclusao.data_exclusao.desc()).limit(limit).all()
    
    return {
        "total": len(exclusoes),
        "exclusoes": [
            {
                "id": e.id,
                "tipo": e.tipo_registro,
                "registro_id": e.registro_id,
                "dados": json.loads(e.dados_completos),
                "motivo": e.motivo_exclusao,
                "usuario": e.usuario_exclusao,
                "data_exclusao": e.data_exclusao.isoformat()
            }
            for e in exclusoes
        ]
    }