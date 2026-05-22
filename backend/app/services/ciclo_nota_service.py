from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.ciclo_nota_model import CicloNota, TipoNotaCorpo, StatusCiclo
from app.repositories.ciclo_nota_repository import CicloNotaRepository


class CicloNotaService:

    @staticmethod
    def get_or_create(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        ano: int,
        mes: int,
    ) -> CicloNota:
        """Retorna o ciclo existente ou cria um novo. Ponto único de acesso ao ciclo."""
        ciclo = CicloNotaRepository.get_by_chave(db, condominio_id, tipo_nota, ano, mes)
        if not ciclo:
            ciclo = CicloNota(
                condominio_id=condominio_id,
                tipo_nota=tipo_nota,
                ano=ano,
                mes=mes,
                status_ciclo=StatusCiclo.PENDENTE,
            )
            ciclo = CicloNotaRepository.create(db, ciclo)
        return ciclo

    @staticmethod
    def get_by_id(db: Session, ciclo_id: int) -> Optional[CicloNota]:
        return CicloNotaRepository.get_by_id(db, ciclo_id)

    @staticmethod
    def list_by_periodo(
        db: Session,
        ano: int,
        mes: int,
        condominio_id: Optional[int] = None,
        status: Optional[StatusCiclo] = None,
    ) -> List[CicloNota]:
        return CicloNotaRepository.list_by_periodo(db, ano, mes, condominio_id, status)

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int) -> List[CicloNota]:
        return CicloNotaRepository.list_by_condominio(db, condominio_id)

    @staticmethod
    def atualizar_status_pelo_corpo(db: Session, ciclo: CicloNota) -> CicloNota:
        """Recalcula e persiste o status_ciclo com base no estado atual dos corpos."""
        from app.models.corpo_nota_model import CorpoNota, StatusCorpoNota

        corpos = (
            db.query(CorpoNota)
            .filter(CorpoNota.ciclo_id == ciclo.id, CorpoNota.deletado_em.is_(None))
            .all()
        )

        status_final = StatusCiclo.PENDENTE
        for corpo in corpos:
            if corpo.status == StatusCorpoNota.PAGO:
                status_final = StatusCiclo.CONCLUIDO
                break
            if corpo.status != StatusCorpoNota.CANCELADO:
                status_final = StatusCiclo.EM_ANDAMENTO

        ciclo.status_ciclo = status_final
        return CicloNotaRepository.save(db, ciclo)
