"""
canal_repository.py — queries e CRUD do módulo Demandas (sem lógica de negócio).
"""
from typing import List, Optional, Tuple

from sqlalchemy import func as sa_func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.canal_model import (
    CanalItem, CanalComentario, CanalAnexo, CanalFormulario, CanalTipo, CanalStatus,
)

# Status que contam como "encerrado"
STATUS_ENCERRADOS = (CanalStatus.RESOLVIDA, CanalStatus.DESCARTADA)


class CanalRepository:

    # ── Itens ────────────────────────────────────────────────────────────────

    @staticmethod
    def listar(
        db: Session,
        tipo: Optional[str] = None,
        status: Optional[str] = None,
        autor: Optional[str] = None,
        busca: Optional[str] = None,
        incluir_arquivados: bool = False,
        incluir_encerrados: bool = True,
    ) -> List[CanalItem]:
        q = (
            db.query(CanalItem)
            .options(
                joinedload(CanalItem.anexos),
                joinedload(CanalItem.comentarios),
            )
            .filter(CanalItem.deletado_em.is_(None))
        )
        if tipo:
            q = q.filter(CanalItem.tipo == tipo)
        if status:
            q = q.filter(CanalItem.status == status)
        if autor:
            q = q.filter(CanalItem.autor == autor)
        if not incluir_arquivados:
            q = q.filter(CanalItem.arquivado.is_(False))
        if not incluir_encerrados:
            q = q.filter(CanalItem.status.notin_(STATUS_ENCERRADOS))
        if busca:
            termo = f"%{busca.strip()}%"
            q = q.filter(or_(
                CanalItem.titulo.ilike(termo),
                CanalItem.descricao.ilike(termo),
                CanalItem.codigo.ilike(termo),
            ))
        # Mais recente atividade primeiro
        return q.order_by(CanalItem.atualizado_em.desc(), CanalItem.id.desc()).all()

    @staticmethod
    def get_by_id(db: Session, item_id: int) -> Optional[CanalItem]:
        return (
            db.query(CanalItem)
            .options(
                joinedload(CanalItem.anexos),
                joinedload(CanalItem.comentarios).joinedload(CanalComentario.anexos),
                joinedload(CanalItem.formularios),
            )
            .filter(CanalItem.id == item_id, CanalItem.deletado_em.is_(None))
            .first()
        )

    @staticmethod
    def create(db: Session, item: CanalItem) -> CanalItem:
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def save(db: Session, item: CanalItem) -> CanalItem:
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def proximo_codigo(db: Session, tipo: CanalTipo) -> str:
        """Gera 'D-<n>' / 'N-<n>' com n = maior sufixo existente + 1 (conta soft-deletados)."""
        prefixo = "D-" if tipo == CanalTipo.DEMANDA else "N-"
        total = (
            db.query(sa_func.count(CanalItem.id))
            .filter(CanalItem.codigo.like(f"{prefixo}%"))
            .scalar()
        ) or 0
        # tenta achar o maior número de fato (evita colisão se algum código foi editado)
        ultimos = (
            db.query(CanalItem.codigo)
            .filter(CanalItem.codigo.like(f"{prefixo}%"))
            .all()
        )
        maior = 0
        for (cod,) in ultimos:
            try:
                maior = max(maior, int(cod.split("-", 1)[1]))
            except (ValueError, IndexError):
                continue
        return f"{prefixo}{max(maior, total) + 1}"

    # ── Comentários ──────────────────────────────────────────────────────────

    @staticmethod
    def add_comentario(db: Session, comentario: CanalComentario) -> CanalComentario:
        db.add(comentario)
        db.commit()
        db.refresh(comentario)
        return comentario

    # ── Anexos ───────────────────────────────────────────────────────────────

    @staticmethod
    def add_anexo(db: Session, anexo: CanalAnexo) -> CanalAnexo:
        db.add(anexo)
        db.commit()
        db.refresh(anexo)
        return anexo

    @staticmethod
    def get_anexo(db: Session, anexo_id: int) -> Optional[CanalAnexo]:
        return (
            db.query(CanalAnexo)
            .filter(CanalAnexo.id == anexo_id, CanalAnexo.removido.is_(False))
            .first()
        )

    # ── Relatório (changelog do que foi resolvido) ───────────────────────────

    @staticmethod
    def listar_resolvidas(
        db: Session,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
        incluir_descartadas: bool = False,
    ) -> List[CanalItem]:
        alvos = [CanalStatus.RESOLVIDA]
        if incluir_descartadas:
            alvos.append(CanalStatus.DESCARTADA)
        q = (
            db.query(CanalItem)
            .filter(
                CanalItem.deletado_em.is_(None),
                CanalItem.status.in_(alvos),
            )
        )
        if data_inicio:
            q = q.filter(CanalItem.data_resolucao >= f"{data_inicio} 00:00:00")
        if data_fim:
            q = q.filter(CanalItem.data_resolucao <= f"{data_fim} 23:59:59")
        return q.order_by(CanalItem.data_resolucao.desc()).all()

    # ── Formulários ──────────────────────────────────────────────────────────

    @staticmethod
    def add_formulario(db: Session, form: CanalFormulario) -> CanalFormulario:
        db.add(form)
        db.commit()
        db.refresh(form)
        return form

    @staticmethod
    def get_formulario(db: Session, form_id: int) -> Optional[CanalFormulario]:
        return (
            db.query(CanalFormulario)
            .filter(CanalFormulario.id == form_id, CanalFormulario.deletado_em.is_(None))
            .first()
        )

    @staticmethod
    def save_formulario(db: Session, form: CanalFormulario) -> CanalFormulario:
        db.commit()
        db.refresh(form)
        return form

    # ── Resumo (badge) ───────────────────────────────────────────────────────

    @staticmethod
    def contadores(db: Session) -> dict:
        base = db.query(CanalItem).filter(
            CanalItem.deletado_em.is_(None),
            CanalItem.arquivado.is_(False),
        )
        abertas = base.filter(
            CanalItem.tipo == CanalTipo.DEMANDA,
            CanalItem.status.notin_(STATUS_ENCERRADOS),
        )
        return {
            "novidades_atila": base.filter(CanalItem.visto_atila.is_(False)).count(),
            "novidades_cmport": base.filter(CanalItem.visto_cmport.is_(False)).count(),
            "demandas_abertas": abertas.count(),
            "aguardando_atila": abertas.filter(CanalItem.status == CanalStatus.AGUARDANDO_ATILA).count(),
            "aguardando_cmport": abertas.filter(CanalItem.status == CanalStatus.AGUARDANDO_CMPORT).count(),
        }
