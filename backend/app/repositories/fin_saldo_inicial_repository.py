from typing import Optional
from sqlalchemy.orm import Session

from app.models.fin_saldo_inicial_model import SaldoInicial


class FinSaldoInicialRepository:

    @staticmethod
    def get(db: Session, ano: int, mes: int) -> Optional[SaldoInicial]:
        return db.query(SaldoInicial).filter(
            SaldoInicial.ano == ano,
            SaldoInicial.mes == mes,
        ).first()

    @staticmethod
    def upsert(db: Session, ano: int, mes: int, valor, observacao: Optional[str]) -> SaldoInicial:
        obj = FinSaldoInicialRepository.get(db, ano, mes)
        if obj:
            obj.valor = valor
            obj.observacao = observacao
        else:
            obj = SaldoInicial(ano=ano, mes=mes, valor=valor, observacao=observacao)
            db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
