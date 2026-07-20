"""
Testes de ServicoService.resumo_financeiro incluindo valores de Recibo.

Motivação: um serviço nascido de Recibo (tipo ENTRADA) não tem nota_fiscal_id
nem Boleto — o dinheiro já está registrado direto em Recibo.valor/status. Sem
isso, PAGO/PENDENTE do dashboard de /servicos sempre ignoravam esse dinheiro.

Como a função monta queries agregadas reais (func.sum, join), usa SQLite
in-memory em vez de MagicMock — só as 3 tabelas envolvidas são criadas
(SQLite não valida FK por padrão, então não precisa das tabelas pai).
Filtro mes/ano não é testado aqui: usa func.year/func.month, específico de
MySQL, incompatível com SQLite (mesma limitação preexistente do boleto,
nunca coberta por teste antes desta mudança).
"""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models.recibo_model  # noqa: F401 — garante registro no mapper
import app.models.servico_model  # noqa: F401
import app.models.boleto_model  # noqa: F401
import app.models.cliente_model  # noqa: F401
import app.models.condominio_model  # noqa: F401
import app.models.nota_fiscal_model  # noqa: F401
import app.models.ordem_servico_model  # noqa: F401
import app.models.orcamento_model  # noqa: F401

from app.models.recibo_model import Recibo
from app.models.servico_model import ManutencaoAssistencia, TipoServico
from app.models.boleto_model import Boleto, SituacaoBoleto
from app.services.servico_service import ServicoService


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    tables = [Recibo.__table__, ManutencaoAssistencia.__table__, Boleto.__table__]
    Recibo.metadata.create_all(engine, tables=tables)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _recibo(db, id_, tipo="ENTRADA", status="PAGO", valor=650.0, deletado_em=None):
    r = Recibo(
        id=id_, numero_recibo=f"REC-TEST-{id_}", tipo=tipo, status=status, valor=valor,
        data_emissao=date(2026, 2, 16), data_pagamento=date(2026, 2, 20),
        descricao_servico="Servico teste", deletado_em=deletado_em,
    )
    db.add(r)
    db.flush()
    return r


def _servico(db, id_, recibo_id=None, nota_fiscal_id=None):
    s = ManutencaoAssistencia(
        id=id_, tipo=TipoServico.ASSISTENCIA, data_servico=date(2026, 2, 16),
        recibo_id=recibo_id, nota_fiscal_id=nota_fiscal_id,
    )
    db.add(s)
    db.flush()
    return s


def _boleto(db, id_, nota_fiscal_id, valor_nominal, situacao):
    b = Boleto(
        id=id_, nota_fiscal_id=nota_fiscal_id, valor_nominal=valor_nominal, situacao=situacao,
        data_emissao=date(2026, 2, 1), data_vencimento=date(2026, 2, 20),
        data_pagamento=date(2026, 2, 20) if situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO) else None,
    )
    db.add(b)
    db.flush()
    return b


# ─── 1. Recibo ENTRADA PAGO soma em valor_pago ────────────────────────────────

def test_recibo_entrada_pago_soma_valor_pago(db):
    _recibo(db, 1, tipo="ENTRADA", status="PAGO", valor=650.0)
    _servico(db, 1, recibo_id=1, nota_fiscal_id=None)
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    assert resultado["valor_pago"] == 650.0
    assert resultado["qtd_pago"] == 1
    assert resultado["valor_pendente"] == 0
    assert resultado["qtd_pendente"] == 0


# ─── 2. Recibo ENTRADA PENDENTE soma em valor_pendente ────────────────────────

def test_recibo_entrada_pendente_soma_valor_pendente(db):
    _recibo(db, 2, tipo="ENTRADA", status="PENDENTE", valor=300.0)
    _servico(db, 2, recibo_id=2, nota_fiscal_id=None)
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    assert resultado["valor_pendente"] == 300.0
    assert resultado["qtd_pendente"] == 1
    assert resultado["valor_pago"] == 0


# ─── 3. Recibo SAIDA não conta em nada ────────────────────────────────────────

def test_recibo_saida_nao_conta(db):
    _recibo(db, 3, tipo="SAIDA", status="PAGO", valor=500.0)
    _servico(db, 3, recibo_id=3, nota_fiscal_id=None)
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    assert resultado["valor_pago"] == 0
    assert resultado["valor_pendente"] == 0


# ─── 4. Recibo CANCELADO não conta em nada ────────────────────────────────────

def test_recibo_cancelado_nao_conta(db):
    _recibo(db, 4, tipo="ENTRADA", status="CANCELADO", valor=200.0)
    _servico(db, 4, recibo_id=4, nota_fiscal_id=None)
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    assert resultado["valor_pago"] == 0
    assert resultado["valor_pendente"] == 0


# ─── 5. Servico com recibo_id E nota_fiscal_id → recibo não conta (evita dupla) ─

def test_servico_com_recibo_e_nota_nao_duplica_recibo(db):
    _recibo(db, 5, tipo="ENTRADA", status="PAGO", valor=999.0)
    _servico(db, 5, recibo_id=5, nota_fiscal_id=42)  # nota vinculada depois
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    # Sem Boleto cadastrado para a nota 42 neste teste — resultado deve ser 0,
    # nunca os 999.0 do recibo (senão estaria duplicando quando o boleto existir).
    assert resultado["valor_pago"] == 0
    assert resultado["qtd_pago"] == 0


# ─── 6. Combinação recibo + boleto no mesmo resultado ─────────────────────────

def test_combina_recibo_e_boleto_no_mesmo_resultado(db):
    _recibo(db, 6, tipo="ENTRADA", status="PAGO", valor=400.0)
    _servico(db, 6, recibo_id=6, nota_fiscal_id=None)
    _boleto(db, 100, nota_fiscal_id=77, valor_nominal=1000.0, situacao=SituacaoBoleto.PAGO)
    db.commit()

    resultado = ServicoService.resumo_financeiro(db)

    assert resultado["valor_pago"] == 1400.0
    assert resultado["qtd_pago"] == 2
