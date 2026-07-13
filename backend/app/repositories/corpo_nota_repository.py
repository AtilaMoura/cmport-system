from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.corpo_nota_model import CorpoNota, StatusCorpoNota
from app.models.ciclo_nota_model import TipoNotaCorpo


class CorpoNotaRepository:

    @staticmethod
    def get_by_id(db: Session, corpo_id: int) -> Optional[CorpoNota]:
        return (
            db.query(CorpoNota)
            .filter(CorpoNota.id == corpo_id, CorpoNota.deletado_em.is_(None))
            .first()
        )

    @staticmethod
    def get_ativo_por_ciclo(db: Session, ciclo_id: int) -> Optional[CorpoNota]:
        """Retorna o corpo não-cancelado de um ciclo (deve haver no máximo um)."""
        return (
            db.query(CorpoNota)
            .filter(
                CorpoNota.ciclo_id == ciclo_id,
                CorpoNota.status != StatusCorpoNota.CANCELADO,
                CorpoNota.deletado_em.is_(None),
            )
            .first()
        )

    @staticmethod
    def get_by_servico_id(db: Session, servico_id: int) -> Optional[CorpoNota]:
        """Retorna o corpo de nota (mais recente) vinculado a um serviço."""
        return (
            db.query(CorpoNota)
            .filter(CorpoNota.servico_id == servico_id, CorpoNota.deletado_em.is_(None))
            .order_by(CorpoNota.criado_em.desc())
            .first()
        )

    @staticmethod
    def list_by_condominio(
        db: Session,
        condominio_id: int,
        status: Optional[StatusCorpoNota] = None,
    ) -> List[CorpoNota]:
        q = db.query(CorpoNota).filter(
            CorpoNota.condominio_id == condominio_id,
            CorpoNota.deletado_em.is_(None),
        )
        if status:
            q = q.filter(CorpoNota.status == status)
        return q.order_by(CorpoNota.criado_em.desc()).all()

    @staticmethod
    def list_by_ciclo(db: Session, ciclo_id: int) -> List[CorpoNota]:
        return (
            db.query(CorpoNota)
            .filter(CorpoNota.ciclo_id == ciclo_id, CorpoNota.deletado_em.is_(None))
            .order_by(CorpoNota.criado_em.desc())
            .all()
        )

    @staticmethod
    def list_candidatos_para_nota(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        ano: int,
        mes: int,
        numero_os: Optional[str] = None,
    ) -> List[CorpoNota]:
        """Busca corpos candidatos para vínculo automático com XML."""
        from app.models.ciclo_nota_model import CicloNota

        q = (
            db.query(CorpoNota)
            .join(CicloNota, CorpoNota.ciclo_id == CicloNota.id)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CicloNota.tipo_nota == tipo_nota,
                CicloNota.ano == ano,
                CicloNota.mes == mes,
                CorpoNota.status.in_([
                    StatusCorpoNota.PENDENTE,
                    StatusCorpoNota.EM_MONTAGEM,
                    StatusCorpoNota.GERADO,
                ]),
                CorpoNota.nota_fiscal_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
        )
        if numero_os:
            q = q.filter(CorpoNota.numero_os == numero_os)
        return q.all()

    @staticmethod
    def list_candidatos_por_numero_nf(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        numero_nf: int,
    ) -> List[CorpoNota]:
        """Busca corpo pelo numero_nf exato — sem filtro de mês (vencimento pode ser mês seguinte)."""
        return (
            db.query(CorpoNota)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CorpoNota.tipo_nota == tipo_nota,
                CorpoNota.numero_nf == numero_nf,
                CorpoNota.status.in_([
                    StatusCorpoNota.PENDENTE,
                    StatusCorpoNota.EM_MONTAGEM,
                    StatusCorpoNota.GERADO,
                ]),
                CorpoNota.nota_fiscal_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
            .all()
        )

    @staticmethod
    def list_candidatos_produto_por_numero_nf(
        db: Session,
        condominio_id: int,
        numero_nf_produto: int,
    ) -> List[CorpoNota]:
        """Busca corpos SERVICO candidatos a receber nota de produto, por numero_nf_produto."""
        return (
            db.query(CorpoNota)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CorpoNota.tipo_nota == TipoNotaCorpo.SERVICO,
                CorpoNota.numero_nf_produto == numero_nf_produto,
                CorpoNota.nota_produto_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
            .all()
        )

    @staticmethod
    def list_candidatos_produto_por_mes(
        db: Session,
        condominio_id: int,
        ano: int,
        mes: int,
    ) -> List[CorpoNota]:
        """Busca corpos SERVICO com valor_nota_produto preenchido mas sem nota_produto_id vinculada."""
        from app.models.ciclo_nota_model import CicloNota

        return (
            db.query(CorpoNota)
            .join(CicloNota, CorpoNota.ciclo_id == CicloNota.id)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CicloNota.tipo_nota == TipoNotaCorpo.SERVICO,
                CicloNota.ano == ano,
                CicloNota.mes == mes,
                CorpoNota.valor_nota_produto.isnot(None),
                CorpoNota.nota_produto_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
            .all()
        )

    @staticmethod
    def list_candidatos_produto_standalone_por_numero_nf(
        db: Session,
        condominio_id: int,
        numero_nf: int,
    ) -> List[CorpoNota]:
        """Corpos tipo=PRODUTO standalone sem nota vinculada com numero_nf exato."""
        return (
            db.query(CorpoNota)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CorpoNota.tipo_nota == TipoNotaCorpo.PRODUTO,
                CorpoNota.numero_nf == numero_nf,
                CorpoNota.nota_fiscal_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
            .all()
        )

    @staticmethod
    def list_candidatos_produto_standalone_por_mes(
        db: Session,
        condominio_id: int,
        ano: int,
        mes: int,
    ) -> List[CorpoNota]:
        """Corpos tipo=PRODUTO standalone sem nota vinculada no mês/ano informado."""
        from app.models.ciclo_nota_model import CicloNota

        return (
            db.query(CorpoNota)
            .join(CicloNota, CorpoNota.ciclo_id == CicloNota.id)
            .filter(
                CorpoNota.condominio_id == condominio_id,
                CorpoNota.tipo_nota == TipoNotaCorpo.PRODUTO,
                CicloNota.ano == ano,
                CicloNota.mes == mes,
                CorpoNota.nota_fiscal_id.is_(None),
                CorpoNota.deletado_em.is_(None),
            )
            .all()
        )

    @staticmethod
    def create(db: Session, corpo: CorpoNota) -> CorpoNota:
        db.add(corpo)
        db.commit()
        db.refresh(corpo)
        return corpo

    @staticmethod
    def save(db: Session, corpo: CorpoNota) -> CorpoNota:
        db.add(corpo)
        db.commit()
        db.refresh(corpo)
        return corpo
