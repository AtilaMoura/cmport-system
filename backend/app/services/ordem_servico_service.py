from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.services.auvo_client import auvo_client
from app.repositories.ordem_servico_repository import OrdemServicoRepository
from app.models.servico_model import ManutencaoAssistencia
from app.models.nota_fiscal_model import NotaFiscal
from app.schemas.ordem_servico_schema import AUVO_STATUS_DESCRICAO


class OrdemServicoService:

    @staticmethod
    def sincronizar(db: Session, date_start: str, date_end: str) -> dict:
        """Busca OSs do Auvo pelo período e salva/atualiza no banco local."""
        ordens_auvo = auvo_client.get_all_service_orders_by_period(date_start, date_end)
        novas = 0
        atualizadas = 0

        for os_data in ordens_auvo:
            task_id = os_data.get("taskID")
            if not task_id:
                continue

            dados = {
                "customer_id": os_data.get("customerId"),
                "customer_description": (os_data.get("customerDescription") or "")[:255],
                "task_date": _parse_dt(os_data.get("taskDate")),
                "task_type_description": (os_data.get("taskTypeDescription") or "")[:255],
                "user_to_name": (os_data.get("userToName") or "")[:255],
                "orientation": os_data.get("orientation"),
                "report": os_data.get("report"),
                "finished": bool(os_data.get("finished", False)),
                "task_status": os_data.get("taskStatus"),
                "check_in_date": _parse_dt(os_data.get("checkInDate")),
                "check_out_date": _parse_dt(os_data.get("checkOutDate")),
                "duration": (os_data.get("duration") or "")[:20] or None,
                "address": (os_data.get("address") or "")[:500],
                "signature_url": (os_data.get("signatureUrl") or "")[:500] or None,
                "task_url": (os_data.get("taskUrl") or "")[:500] or None,
            }

            _, is_new = OrdemServicoRepository.upsert(db, task_id, dados)
            if is_new:
                novas += 1
            else:
                atualizadas += 1

        return {
            "sincronizadas": len(ordens_auvo),
            "novas": novas,
            "atualizadas": atualizadas,
            "periodo": f"{date_start} a {date_end}",
        }

    @staticmethod
    def listar(
        db: Session,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
        status: Optional[int] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ):
        ordens, total = OrdemServicoRepository.listar(db, data_inicio, data_fim, status, search, page, page_size)
        return [OrdemServicoService._enriquecer(db, o) for o in ordens], total

    @staticmethod
    def detalhe(db: Session, task_id: int):
        ordem = OrdemServicoRepository.get_by_task_id(db, task_id)
        if not ordem:
            return None
        return OrdemServicoService._enriquecer(db, ordem)

    @staticmethod
    def _enriquecer(db: Session, ordem) -> dict:
        """Busca ManutencaoAssistencia e NotaFiscal vinculadas via numero_os == task_id."""
        servico = (
            db.query(ManutencaoAssistencia)
            .filter(ManutencaoAssistencia.numero_os == str(ordem.task_id))
            .first()
        )
        nota = None
        if servico and servico.nota_fiscal_id:
            nota = db.query(NotaFiscal).filter(NotaFiscal.id == servico.nota_fiscal_id).first()

        return {
            "id": ordem.id,
            "task_id": ordem.task_id,
            "customer_id": ordem.customer_id,
            "customer_description": ordem.customer_description,
            "task_date": ordem.task_date,
            "task_type_description": ordem.task_type_description,
            "user_to_name": ordem.user_to_name,
            "orientation": ordem.orientation,
            "report": ordem.report,
            "finished": ordem.finished,
            "task_status": ordem.task_status,
            "task_status_descricao": AUVO_STATUS_DESCRICAO.get(ordem.task_status, "Desconhecido"),
            "check_in_date": ordem.check_in_date,
            "check_out_date": ordem.check_out_date,
            "duration": ordem.duration,
            "address": ordem.address,
            "signature_url": ordem.signature_url,
            "task_url": ordem.task_url,
            "sincronizado_em": ordem.sincronizado_em,
            "servico_id": servico.id if servico else None,
            "servico_tipo": servico.tipo.value if servico else None,
            "nota_fiscal_id": nota.id if nota else None,
            "nota_numero": nota.numero_nota if nota else None,
            "condominio_id": servico.condominio_id if servico else None,
        }


def _parse_dt(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None
