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
    ImportarSaldoInicialItem, ImportarSaldoInicialResponse,
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
                fonte=(s.fonte if s else None),
                observacao=(s.observacao if s else None),
            ))
        return SaldoInicialPorBancoResponse(ano=ano, mes=mes, linhas=linhas, total=total)

    @staticmethod
    def upsert_saldo_inicial_banco(db: Session, ano: int, mes: int, banco_id: int,
                                   req: SaldoInicialUpsert) -> SaldoInicialResponse:
        banco = db.query(Banco).filter(Banco.id == banco_id).first()
        if not banco:
            raise Exception("Banco não encontrado.")
        obj = FinSaldoInicialRepository.upsert(db, ano, mes, req.valor, req.observacao,
                                               banco_id=banco_id, fonte="MANUAL")
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
        """Puxa o saldo das contas Inter via API e grava como fonte=INTER. Se
        ano/mes é o mês corrente, usa o saldo em tempo real (`consultar_saldo()`
        sem data) — pedir saldo de uma data futura (ex.: dia 30 rodando dia 16)
        devolve o saldo de hoje mesmo, então antes gravávamos isso com uma
        observação enganosa de "saldo do fim do mês". Só usa o último dia do mês
        quando o mês já fechou (histórico). Contas sem credencial ou com erro
        entram em `detalhes` e não abortam as outras."""
        from app.services.inter_client import InterClient

        hoje = date.today()
        mes_corrente = (ano == hoje.year and mes == hoje.month)
        ultimo_dia = date(ano, mes, monthrange(ano, mes)[1]).isoformat()
        data_consulta = None if mes_corrente else ultimo_dia
        observacao = (f"Importado da API Inter (saldo em tempo real) em {hoje.isoformat()}" if mes_corrente
                      else f"Importado da API Inter em {ultimo_dia}")
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
                data = client.consultar_saldo(data_consulta)
                bruto = data.get("disponivel")
                if bruto is None:
                    bruto = data.get("saldoDisponivel") or data.get("saldo")
                if bruto is None:
                    raise Exception(f"resposta sem campo de saldo: {list(data.keys())}")
                saldo = Decimal(str(bruto))
                FinExtratoSaldoRepository.upsert(
                    db, b.id, ano, mes, saldo, fonte="INTER",
                    observacao=observacao,
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

    # ── Saldo inicial automático (Inter) ────────────────────────────────────
    @staticmethod
    def importar_saldo_inicial_inter(db: Session, ano: int, mes: int) -> ImportarSaldoInicialResponse:
        """Preenche o saldo inicial de ano/mes pras contas Inter puxando o saldo
        real do ÚLTIMO DIA DO MÊS ANTERIOR na API (data passada — diferente do
        saldo "hoje", uma data no passado sempre devolve o valor correto) e
        grava como fonte=INTER. É o mesmo saldo que devia ter fechado o mês
        anterior no `importar_inter`, só que gravado como abertura do mês
        seguinte. Contas sem credencial ou com erro entram em `detalhes`."""
        from app.services.inter_client import InterClient

        mes_ant, ano_ant = (12, ano - 1) if mes == 1 else (mes - 1, ano)
        ultimo_dia_mes_anterior = date(ano_ant, mes_ant, monthrange(ano_ant, mes_ant)[1]).isoformat()

        bancos = (
            db.query(Banco)
            .filter(Banco.ativo == True, Banco.configuracao_inter_id.isnot(None))  # noqa: E712
            .order_by(Banco.id)
            .all()
        )
        detalhes: list[ImportarSaldoInicialItem] = []
        importados = 0

        for b in bancos:
            cfg = db.query(ConfiguracaoInter).filter(ConfiguracaoInter.id == b.configuracao_inter_id).first()
            if not cfg or not cfg.client_id or not cfg.client_secret:
                detalhes.append(ImportarSaldoInicialItem(banco_id=b.id, banco_nome=b.nome, status="sem credencial"))
                continue
            try:
                client = InterClient(
                    client_id=cfg.client_id,
                    client_secret=cfg.client_secret,
                    conta_corrente=cfg.conta_corrente,
                    cert_path=cfg.cert_path,
                )
                data = client.consultar_saldo(ultimo_dia_mes_anterior)
                bruto = data.get("disponivel")
                if bruto is None:
                    bruto = data.get("saldoDisponivel") or data.get("saldo")
                if bruto is None:
                    raise Exception(f"resposta sem campo de saldo: {list(data.keys())}")
                valor = Decimal(str(bruto))
                FinSaldoInicialRepository.upsert(
                    db, ano, mes, valor,
                    observacao=f"Importado da API Inter — saldo de {ultimo_dia_mes_anterior}",
                    banco_id=b.id, fonte="INTER",
                )
                importados += 1
                detalhes.append(ImportarSaldoInicialItem(
                    banco_id=b.id, banco_nome=b.nome, status="ok", valor=valor,
                ))
            except Exception as e:  # noqa: BLE001
                detalhes.append(ImportarSaldoInicialItem(
                    banco_id=b.id, banco_nome=b.nome, status=f"erro: {e}"[:200],
                ))

        msg = f"{importados} conta(s) importada(s) da API Inter."
        if len(detalhes) > importados:
            msg += f" {len(detalhes) - importados} não importada(s) — ver detalhes."
        return ImportarSaldoInicialResponse(importados=importados, mensagem=msg, detalhes=detalhes)
