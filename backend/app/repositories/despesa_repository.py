from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import extract, and_

from app.models.despesa_model import Despesa, DespesaParcela, TipoPagamentoDespesa


class DespesaRepository:

    @staticmethod
    def listar(db: Session, mes: Optional[int] = None, ano: Optional[int] = None,
                cnpj: Optional[str] = None, status: Optional[str] = None,
                origem: Optional[str] = None, funcionario_id: Optional[int] = None) -> List[Despesa]:
        q = db.query(Despesa).filter(Despesa.deletado_em == None)  # noqa
        if cnpj:
            q = q.filter(Despesa.cnpj == cnpj)
        if funcionario_id is not None:
            q = q.filter(Despesa.funcionario_id == funcionario_id)
        if origem == "FORNECEDOR":
            q = q.filter(Despesa.fornecedor_id.isnot(None))
        elif origem == "FUNCIONARIO":
            q = q.filter(Despesa.funcionario_id.isnot(None))
        elif origem == "GERAL":
            q = q.filter(Despesa.fornecedor_id.is_(None), Despesa.funcionario_id.is_(None))
        condicoes_parcela = []
        if mes:
            condicoes_parcela.append(extract("month", DespesaParcela.data_vencimento) == mes)
        if ano:
            condicoes_parcela.append(extract("year", DespesaParcela.data_vencimento) == ano)
        if status:
            condicoes_parcela.append(DespesaParcela.status == status)
        if condicoes_parcela:
            q = q.filter(Despesa.parcelas.any(and_(*condicoes_parcela)))
        return q.order_by(Despesa.id.desc()).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[Despesa]:
        return db.query(Despesa).filter(
            Despesa.id == id, Despesa.deletado_em == None  # noqa
        ).first()

    @staticmethod
    def create(db: Session, despesa: Despesa) -> Despesa:
        db.add(despesa)
        db.commit()
        db.refresh(despesa)
        return despesa

    @staticmethod
    def get_parcela_by_id(db: Session, parcela_id: int) -> Optional[DespesaParcela]:
        return db.query(DespesaParcela).filter(DespesaParcela.id == parcela_id).first()

    @staticmethod
    def get_ultima_parcela(db: Session, despesa_id: int) -> Optional[DespesaParcela]:
        return db.query(DespesaParcela).filter(
            DespesaParcela.despesa_id == despesa_id
        ).order_by(DespesaParcela.numero_parcela.desc()).first()

    @staticmethod
    def listar_recorrentes_ativas(db: Session) -> List[Despesa]:
        return db.query(Despesa).filter(
            Despesa.tipo_pagamento == TipoPagamentoDespesa.RECORRENTE,
            Despesa.ativo == True,  # noqa
            Despesa.deletado_em == None,  # noqa
        ).all()

    @staticmethod
    def update(db: Session, obj, dados: dict):
        for k, v in dados.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj
