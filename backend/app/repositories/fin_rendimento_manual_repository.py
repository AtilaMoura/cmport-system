from typing import Optional
from sqlalchemy.orm import Session

from app.models.fin_rendimento_manual_model import RendimentoManual


class FinRendimentoManualRepository:

    @staticmethod
    def get(db: Session, ano: int, mes: int, banco_id: int) -> Optional[RendimentoManual]:
        return db.query(RendimentoManual).filter(
            RendimentoManual.ano == ano,
            RendimentoManual.mes == mes,
            RendimentoManual.banco_id == banco_id,
        ).first()

    @staticmethod
    def upsert(db: Session, ano: int, mes: int, banco_id: int, valor,
               observacao: Optional[str] = None) -> RendimentoManual:
        obj = FinRendimentoManualRepository.get(db, ano, mes, banco_id)
        if obj:
            obj.valor = valor
            if observacao is not None:
                obj.observacao = observacao
        else:
            obj = RendimentoManual(ano=ano, mes=mes, banco_id=banco_id, valor=valor, observacao=observacao)
            db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
