from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.fin_extrato_saldo_model import ExtratoSaldo


class FinExtratoSaldoRepository:

    @staticmethod
    def get(db: Session, banco_id: int, ano: int, mes: int) -> Optional[ExtratoSaldo]:
        return db.query(ExtratoSaldo).filter(
            ExtratoSaldo.banco_id == banco_id,
            ExtratoSaldo.ano == ano,
            ExtratoSaldo.mes == mes,
        ).first()

    @staticmethod
    def listar_por_mes(db: Session, ano: int, mes: int) -> List[ExtratoSaldo]:
        return db.query(ExtratoSaldo).filter(
            ExtratoSaldo.ano == ano,
            ExtratoSaldo.mes == mes,
        ).all()

    @staticmethod
    def upsert(db: Session, banco_id: int, ano: int, mes: int, saldo_final,
               fonte: str = "MANUAL", observacao: Optional[str] = None) -> ExtratoSaldo:
        obj = FinExtratoSaldoRepository.get(db, banco_id, ano, mes)
        if obj:
            obj.saldo_final = saldo_final
            obj.fonte = fonte
            obj.conferido_em = datetime.utcnow()
            if observacao is not None:
                obj.observacao = observacao
        else:
            obj = ExtratoSaldo(
                banco_id=banco_id, ano=ano, mes=mes, saldo_final=saldo_final,
                fonte=fonte, conferido_em=datetime.utcnow(), observacao=observacao,
            )
            db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
