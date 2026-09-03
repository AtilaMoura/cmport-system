"""Conciliação bancária do Fluxo Financeiro — saldo inicial por conta e saldo
final do extrato (manual ou puxado da API Inter). Alimenta o dashboard "por
banco" (`FinDashboardService.por_banco`)."""
from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.banco_model import Banco
from app.models.configuracao_model import ConfiguracaoInter
from app.repositories.fin_saldo_inicial_repository import FinSaldoInicialRepository
from app.repositories.fin_extrato_saldo_repository import FinExtratoSaldoRepository
from app.schemas.fin_saldo_inicial_schema import (
    SaldoInicialUpsert, SaldoInicialResponse,
    SaldoInicialBancoLinha, SaldoInicialPorBancoResponse,
)
from app.schemas.fin_extrato_saldo_schema import (
    ExtratoSaldoUpsert, ExtratoSaldoResponse,
    ExtratoSaldoBancoLinha, ExtratoSaldoPorBancoResponse,
    ImportarInterItem, ImportarInterResponse,
)

EMPRESA_POR_CNPJ = {
    "22761557000188": "CMPORT",
    "65756913000188": "TEC",
}


def _so_digitos(v: Optional[str]) -> str:
    return "".join(filter(str.isdigit, v or ""))


def _empresa(banco: Banco) -> Optional[str]:
    return EMPRESA_POR_CNPJ.get(_so_digitos(banco.cnpj_titular))


class FinConciliacaoService:

    # ── Saldo inicial por banco ─────────────────────────────────────────────
    @staticmethod
    def saldo_inicial_por_banco(db: Session, ano: int, mes: int) -> SaldoInicialPorBancoResponse:
        bancos = db.query(Banco).filter(Banco.ativo == True).order_by(Banco.id).all()  # noqa: E712
        salvos = {s.banco_id: s for s in FinSaldoInicialRepository.listar_por_mes(db, ano, mes) if s.banco_id}
        linhas = []
        total = Decimal(0)
        for b in bancos:
            s = salvos.get(b.id)
            valor = Decimal(str(s.valor)) if s else Decimal(0)
            total += valor
            linhas.append(SaldoInicialBancoLinha(
                banco_id=b.id,
                banco_nome=(f"{b.nome} ({b.razao_social_titular})" if b.razao_social_titular else b.nome),
                empresa=_empresa(b),
                valor=valor,
                informado=s is not None,
                observacao=(s.observacao if s else None),
            ))
        return SaldoInicialPorBancoResponse(ano=ano, mes=mes, linhas=linhas, total=total)

    @staticmethod
    def upsert_saldo_inicial_banco(db: Session, ano: int, mes: int, banco_id: int,
                                   req: SaldoInicialUpsert) -> SaldoInicialResponse:
        banco = db.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise Exception("Banco não encontrado.")
        obj = FinSaldoInicialRepository.upsert(db, ano, mes, req.valor, req.observacao, banco_id=banco_id)
        return SaldoInicialResponse.model_validate(obj)

    # ── Saldo do extrato ───────────────────────────────────────────────────
    @staticmethod
    def extrato_saldo_por_banco(db: Session, ano: int, mes: int) -> ExtratoSaldoPorBancoResponse:
        bancos = db.query(Banco).filter(Banco.ativo == True).order_by(Banco.id).all()  # noqa: E712
        salvos = {e.banco_id: e for e in FinExtratoSaldoRepository.listar_por_mes(db, ano, mes)}
        linhas = []
        for b in bancos:
            e = salvos.get(b.id)
            linhas.append(ExtratoSaldoBancoLinha(
                banco_id=b.id,
                banco_nome=(f"{b.nome} ({b.razao_social_titular})" if b.razao_social_titular else b.nome),
                empresa=_empresa(b),
                saldo_final=(Decimal(str(e.saldo_final)) if e else None),
                fonte=(e.fonte if e else None),
                conferido_em=(e.conferido_em if e else None),
                observacao=(e.observacao if e else None),
            ))
        return ExtratoSaldoPorBancoResponse(ano=ano, mes=mes, linhas=linhas)

    @staticmethod
    def upsert_extrato_saldo(db: Session, ano: int, mes: int, banco_id: int,
                             req: ExtratoSaldoUpsert) -> ExtratoSaldoResponse:
        banco = db.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise Exception("Banco não encontrado.")
        obj = FinExtratoSaldoRepository.upsert(
            db, banco_id, ano, mes, req.saldo_final, fonte="MANUAL", observacao=req.observacao,
        )
        return ExtratoSaldoResponse.model_validate(obj)

    @staticmethod
    def importar_inter(db: Session, ano: int, mes: int) -> ImportarInterResponse:
        """Puxa o saldo do último dia do mês das contas Inter via API e grava
        como fonte=INTER. Contas sem credencial ou com erro entram em `detalhes`
        e não abortam as outras."""
        from app.services.inter_client import InterClient

        ultimo_dia = date(ano, mes, monthrange(ano, mes)[1]).isoformat()
        bancos = (
            db.query(Banco)
            .filter(Banco.ativo == True, Banco.configuracao_inter_id.isnot(None))  # noqa: E712
            .order_by(Banco.id)
            .all()
        )
        detalhes: list[ImportarInterItem] = []
        importados = 0

        for b in bancos:
            cfg = db.query(ConfiguracaoInter).filter(ConfiguracaoInter.id == b.configuracao_inter_id).first()
            if not cfg or not cfg.client_id or not cfg.client_secret:
                detalhes.append(ImportarInterItem(banco_id=b.id, banco_nome=b.nome, status="sem credencial"))
                continue
            try:
                client = InterClient(
                    client_id=cfg.client_id,
                    client_secret=cfg.client_secret,
                    conta_corrente=cfg.conta_corrente,
                    cert_path=cfg.cert_path,
                )
                data = client.consultar_saldo(ultimo_dia)
                bruto = data.get("disponivel")
                if bruto is None:
                    bruto = data.get("saldoDisponivel") or data.get("saldo")
                if bruto is None:
                    raise Exception(f"resposta sem campo de saldo: {list(data.keys())}")
                saldo = Decimal(str(bruto))
                FinExtratoSaldoRepository.upsert(
                    db, b.id, ano, mes, saldo, fonte="INTER",
                    observacao=f"Importado da API Inter em {ultimo_dia}",
                )
                importados += 1
                detalhes.append(ImportarInterItem(
                    banco_id=b.id, banco_nome=b.nome, status="ok", saldo_final=saldo,
                ))
            except Exception as e:  # noqa: BLE001
                detalhes.append(ImportarInterItem(
                    banco_id=b.id, banco_nome=b.nome, status=f"erro: {e}"[:200],
                ))

        msg = f"{importados} conta(s) importada(s) da API Inter."
        if len(detalhes) > importados:
            msg += f" {len(detalhes) - importados} não importada(s) — ver detalhes."
        return ImportarInterResponse(importados=importados, mensagem=msg, detalhes=detalhes)
