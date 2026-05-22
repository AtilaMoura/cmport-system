from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.ciclo_nota_model import CicloNota, TipoNotaCorpo, StatusCiclo


class CicloNotaRepository:

    @staticmethod
    def get_by_chave(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        ano: int,
        mes: int,
    ) -> Optional[CicloNota]:
        return (
            db.query(CicloNota)
            .filter(
                CicloNota.condominio_id == condominio_id,
                CicloNota.tipo_nota == tipo_nota,
                CicloNota.ano == ano,
                CicloNota.mes == mes,
            )
            .first()
        )

    @staticmethod
    def get_by_id(db: Session, ciclo_id: int) -> Optional[CicloNota]:
        return db.query(CicloNota).filter(CicloNota.id == ciclo_id).first()

    @staticmethod
    def list_by_periodo(
        db: Session,
        ano: int,
        mes: int,
        condominio_id: Optional[int] = None,
        status: Optional[StatusCiclo] = None,
    ) -> List[CicloNota]:
        q = db.query(CicloNota).filter(CicloNota.ano == ano, CicloNota.mes == mes)
        if condominio_id:
            q = q.filter(CicloNota.condominio_id == condominio_id)
        if status:
            q = q.filter(CicloNota.status_ciclo == status)
        return q.all()

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int) -> List[CicloNota]:
        return (
            db.query(CicloNota)
            .filter(CicloNota.condominio_id == condominio_id)
            .order_by(CicloNota.ano.desc(), CicloNota.mes.desc())
            .all()
        )

    @staticmethod
    def create(db: Session, ciclo: CicloNota) -> CicloNota:
        db.add(ciclo)
        db.commit()
        db.refresh(ciclo)
        return ciclo

    @staticmethod
    def save(db: Session, ciclo: CicloNota) -> CicloNota:
        db.add(ciclo)
        db.commit()
        db.refresh(ciclo)
        return ciclo
