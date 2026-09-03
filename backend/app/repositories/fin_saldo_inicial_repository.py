from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.fin_saldo_inicial_model import SaldoInicial


class FinSaldoInicialRepository:

    @staticmethod
    def get(db: Session, ano: int, mes: int, banco_id: Optional[int] = None) -> Optional[SaldoInicial]:
        q = db.query(SaldoInicial).filter(
            SaldoInicial.ano == ano,
            SaldoInicial.mes == mes,
        )
        if banco_id is None:
            q = q.filter(SaldoInicial.banco_id.is_(None))
        else:
            q = q.filter(SaldoInicial.banco_id == banco_id)
        return q.first()

    @staticmethod
    def listar_por_mes(db: Session, ano: int, mes: int) -> List[SaldoInicial]:
        """Todas as linhas do mês — a global (banco_id NULL) e as por conta."""
        return db.query(SaldoInicial).filter(
            SaldoInicial.ano == ano,
            SaldoInicial.mes == mes,
        ).all()

    @staticmethod
    def upsert(db: Session, ano: int, mes: int, valor, observacao: Optional[str],
               banco_id: Optional[int] = None) -> SaldoInicial:
        obj = FinSaldoInicialRepository.get(db, ano, mes, banco_id)
        if obj:
            obj.valor = valor
            obj.observacao = observacao
        else:
            obj = SaldoInicial(ano=ano, mes=mes, banco_id=banco_id, valor=valor, observacao=observacao)
            db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
