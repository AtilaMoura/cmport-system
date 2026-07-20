import base64
import io
import json
import os
from datetime import datetime, date
from typing import List, Optional
from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from app.models.recibo_model import Recibo
from app.repositories.recibo_repository import ReciboRepository
from app.schemas.recibo_schema import ReciboCreate, ReciboUpdate

_EMPRESA_FALLBACK = "CMPORT Sistemas Eletrônicos de Segurança"
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_TIMBRADO_PATH = os.path.join(_ASSETS_DIR, "timbrado.png")
_ASSINATURA_PATH = os.path.join(_ASSETS_DIR, "assinatura_andre.png")
_JINJA_ENV = Environment(loader=FileSystemLoader(_ASSETS_DIR), autoescape=False)


def _fmt_date(d) -> str:
    return d.strftime('%d/%m/%Y') if d else ""


def _fmt_valor(v) -> str:
    return f"R$ {float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_data_extenso(d) -> str:
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def _b64_file(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


class ReciboService:

    @staticmethod
    def criar(db: Session, payload: ReciboCreate) -> Recibo:
        if not payload.cliente_id and not payload.cliente_nome_avulso:
            raise HTTPException(status_code=422, detail="Informe cliente_id ou cliente_nome_avulso.")

        ano = payload.data_emissao.year
        numero = payload.numero_recibo or ReciboRepository.proximo_numero(db, ano)

        if ReciboRepository.get_by_numero(db, numero):
            numero = ReciboRepository.proximo_numero(db, ano)

        # Resolve condominio_id: prioridade → payload → cliente vinculado
        condominio_id = payload.condominio_id
        if not condominio_id and payload.cliente_id:
            from app.models.cliente_model import Cliente
            cliente = db.get(Cliente, payload.cliente_id)
            if cliente and cliente.condominio_id:
                condominio_id = cliente.condominio_id

        recibo = Recibo(
            numero_recibo=numero,
            tipo=payload.tipo,
            cliente_id=payload.cliente_id,
            condominio_id=condominio_id,
            cliente_nome_avulso=payload.cliente_nome_avulso,
            configuracao_inter_id=payload.configuracao_inter_id,
            cnpj_emitente=payload.cnpj_emitente,
            cnpj_cliente=payload.cnpj_cliente,
            descricao_servico=payload.descricao_servico,
            valor=payload.valor,
            data_emissao=payload.data_emissao,
            data_vencimento=payload.data_vencimento,
            data_pagamento=payload.data_pagamento,
            status=payload.status,
            observacao=payload.observacao,
        )
        recibo = ReciboRepository.create(db, recibo)

        if condominio_id and payload.numero_os:
            # Reaproveita OS existente — só possível quando há condomínio para identificá-la.
            ReciboService._vincular_ou_criar_servico_por_os(
                db, recibo, condominio_id, payload.numero_os, payload.data_servico, tipo=payload.tipo_servico,
            )
        elif payload.tipo == "ENTRADA":
            # ENTRADA sempre gera serviço usando os dados do próprio recibo/cliente,
            # com ou sem condomínio vinculado — nunca depende de checkbox.
            ReciboService._criar_servico(db, recibo, condominio_id, tipo=payload.tipo_servico)
        elif payload.gerar_servico and condominio_id:
            # SAIDA continua opcional via checkbox (pagamento a terceiro, não serviço ao cliente).
            ReciboService._criar_servico(db, recibo, condominio_id, tipo=payload.tipo_servico)

        return recibo

    @staticmethod
    def _vincular_ou_criar_servico_por_os(
        db: Session,
        recibo: Recibo,
        condominio_id: int,
        numero_os: str,
        data_servico: Optional[date],
        tipo: str = "ASSISTENCIA",
    ) -> None:
        """Reaproveita a OS já cadastrada (mesmo padrão do Corpo de Nota — nunca duplica
        ManutencaoAssistencia para a mesma (condominio_id, numero_os)). Se a OS encontrada
        já pertence a outro recibo, não a rouba — cria uma nova em vez de sobrescrever."""
        from app.models.servico_model import ManutencaoAssistencia

        servico = (
            db.query(ManutencaoAssistencia)
            .filter(
                ManutencaoAssistencia.condominio_id == condominio_id,
                ManutencaoAssistencia.numero_os == numero_os,
            )
            .order_by(ManutencaoAssistencia.criado_em.desc())
            .first()
        )
        if servico and servico.recibo_id and servico.recibo_id != recibo.id:
            servico = None

        if servico:
            servico.recibo_id = recibo.id
            db.commit()
            return

        ReciboService._criar_servico(db, recibo, condominio_id, tipo=tipo, numero_os=numero_os, data_servico=data_servico)

    @staticmethod
    def _criar_servico(
        db: Session,
        recibo: Recibo,
        condominio_id: Optional[int],
        tipo: str = "ASSISTENCIA",
        numero_os: Optional[str] = None,
        data_servico: Optional[date] = None,
    ) -> None:
        from app.models.servico_model import ManutencaoAssistencia, TipoServico
        nome_cliente = (
            recibo.cliente.nome if recibo.cliente_id and recibo.cliente
            else recibo.cliente_nome_avulso or "Cliente"
        )
        tipo_enum = TipoServico.MANUTENCAO if tipo == "MANUTENCAO" else TipoServico.ASSISTENCIA
        servico = ManutencaoAssistencia(
            condominio_id=condominio_id,
            tipo=tipo_enum,
            numero_os=numero_os,
            data_servico=data_servico or recibo.data_emissao,
            descricao=f"{recibo.descricao_servico} — {nome_cliente}",
            recibo_id=recibo.id,
        )
        db.add(servico)
        db.commit()

    @staticmethod
    def get_by_id(db: Session, recibo_id: int) -> Recibo:
        r = ReciboRepository.get_by_id(db, recibo_id)
        if not r:
            raise HTTPException(status_code=404, detail="Recibo não encontrado.")
        return r

    @staticmethod
    def list_all(
        db: Session,
        condominio_id: Optional[int] = None,
        cliente_id: Optional[int] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
        mes: Optional[int] = None,
    ) -> List[Recibo]:
        return ReciboRepository.list_all(db, condominio_id, cliente_id, status, ano, mes)

    @staticmethod
    def atualizar(db: Session, recibo_id: int, payload: ReciboUpdate) -> Recibo:
        r = ReciboService.get_by_id(db, recibo_id)

        condominio_novo = (
            payload.condominio_id is not None and payload.condominio_id != r.condominio_id
        )

        if payload.tipo is not None:
            r.tipo = payload.tipo
        if payload.condominio_id is not None:
            r.condominio_id = payload.condominio_id
        if payload.cliente_id is not None:
            r.cliente_id = payload.cliente_id
        if payload.cliente_nome_avulso is not None:
            r.cliente_nome_avulso = payload.cliente_nome_avulso
        if payload.configuracao_inter_id is not None:
            r.configuracao_inter_id = payload.configuracao_inter_id
        if payload.cnpj_emitente is not None:
            r.cnpj_emitente = payload.cnpj_emitente
        if payload.cnpj_cliente is not None:
            r.cnpj_cliente = payload.cnpj_cliente
        if payload.descricao_servico is not None:
            r.descricao_servico = payload.descricao_servico
        if payload.valor is not None:
            r.valor = payload.valor
        if payload.data_emissao is not None:
            r.data_emissao = payload.data_emissao
        if payload.data_vencimento is not None:
            r.data_vencimento = payload.data_vencimento
        if payload.data_pagamento is not None:
            r.data_pagamento = payload.data_pagamento
        if payload.status is not None:
            r.status = payload.status
        if payload.observacao is not None:
            r.observacao = payload.observacao
        r = ReciboRepository.save(db, r)

        # Retrofit: recibo ENTRADA que nunca gerou serviço (ex: criado antes da
        # correção, sem condomínio identificado) ganha o serviço retroativamente
        # assim que o condomínio é informado — mesma lógica do Passo 2.3, sem duplicar.
        if condominio_novo and r.tipo == "ENTRADA" and not r.servicos:
            ReciboService._criar_servico(db, r, r.condominio_id, tipo="ASSISTENCIA")

        return r

    @staticmethod
    def deletar(db: Session, recibo_id: int, motivo: Optional[str] = None) -> None:
        from app.routers.auditoria_router import registrar_exclusao
        r = ReciboService.get_by_id(db, recibo_id)
        dados = {
            "id": r.id,
            "numero_recibo": r.numero_recibo,
            "tipo": r.tipo,
            "valor": str(r.valor),
            "status": r.status,
            "condominio_id": r.condominio_id,
            "cliente_id": r.cliente_id,
            "data_emissao": str(r.data_emissao),
        }
        registrar_exclusao(db, "recibo", recibo_id, dados, motivo)
        r.deletado_em = datetime.utcnow()
        r.status = "CANCELADO"
        ReciboRepository.save(db, r)

    @staticmethod
    def marcar_pago(db: Session, recibo_id: int, data_pagamento: Optional[date] = None) -> Recibo:
        r = ReciboService.get_by_id(db, recibo_id)
        r.status = "PAGO"
        r.data_pagamento = data_pagamento or date.today()
        return ReciboRepository.save(db, r)

    # ── PDF + Email ─────────────────────────────────────────────────────────

    @staticmethod
    def _nome_cliente(recibo: Recibo) -> str:
        if recibo.cliente_id and recibo.cliente:
            return recibo.cliente.nome
        return recibo.cliente_nome_avulso or "Cliente"

    @staticmethod
    def _build_context_pdf(db: Session, recibo: Recibo) -> dict:
        from app.models.configuracao_model import ConfiguracaoEmpresa
        empresa_obj = db.query(ConfiguracaoEmpresa).first()
        empresa_nome = empresa_obj.nome if empresa_obj and empresa_obj.nome else _EMPRESA_FALLBACK

        return {
            "data_hoje":        f"São Paulo, {_fmt_data_extenso(datetime.now())}",
            "numero_recibo":    recibo.numero_recibo,
            "tipo_label":       "Entrada" if recibo.tipo == "ENTRADA" else "Saída",
            "valor_fmt":        _fmt_valor(recibo.valor),
            "cliente_nome":     ReciboService._nome_cliente(recibo),
            "descricao_servico": recibo.descricao_servico,
            "data_emissao":     _fmt_date(recibo.data_emissao),
            "data_pagamento":   _fmt_date(recibo.data_pagamento) if recibo.data_pagamento else None,
            "cnpj_cliente":     recibo.cnpj_cliente,
            "empresa_nome":     empresa_nome,
            "timbrado_b64":     _b64_file(_TIMBRADO_PATH),
        }

    @staticmethod
    def gerar_pdf(db: Session, recibo_id: int) -> io.BytesIO:
        from weasyprint import HTML
        recibo = ReciboService.get_by_id(db, recibo_id)
        context = ReciboService._build_context_pdf(db, recibo)
        context["assinatura_src"] = f"data:image/png;base64,{_b64_file(_ASSINATURA_PATH)}"
        tpl = _JINJA_ENV.get_template("recibo_template.html")
        html_str = tpl.render(**context)
        base_url = f"file://{os.path.abspath(_ASSETS_DIR)}/"
        pdf_bytes = HTML(string=html_str, base_url=base_url).write_pdf()
        return io.BytesIO(pdf_bytes)

    @staticmethod
    def enviar_email(
        db: Session,
        recibo_id: int,
        destinatarios: Optional[List[str]] = None,
        cc_emails: Optional[List[str]] = None,
    ) -> dict:
        from app.services.email_service import EmailService

        recibo = ReciboService.get_by_id(db, recibo_id)

        _destinatarios = destinatarios
        if not _destinatarios:
            if recibo.cliente_id and recibo.cliente and recibo.cliente.email:
                _destinatarios = [recibo.cliente.email]
            else:
                raise HTTPException(
                    status_code=422,
                    detail="Informe destinatários — cliente sem email cadastrado.",
                )

        pdf_buffer = ReciboService.gerar_pdf(db, recibo_id)

        EmailService.enviar_recibo(
            destinatarios=_destinatarios,
            recibo_pdf=pdf_buffer.getvalue(),
            numero_recibo=recibo.numero_recibo,
            nome_cliente=ReciboService._nome_cliente(recibo),
            valor=float(recibo.valor),
            tipo=recibo.tipo,
            data_emissao=recibo.data_emissao,
            cc_emails=cc_emails,
            db=db,
        )

        if recibo.servicos:
            for servico in recibo.servicos:
                servico.email_enviado_em = datetime.utcnow()
                servico.email_destinatarios = json.dumps(_destinatarios)
                db.add(servico)
            db.commit()

        return {"enviado": True, "destinatarios": _destinatarios}
