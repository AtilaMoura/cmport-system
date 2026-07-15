"""Fixtures compartilhadas para os testes do CMPort."""
import pytest
from unittest.mock import MagicMock, patch
from decimal import Decimal

# Garante que todos os models estejam registrados no registry do SQLAlchemy antes de
# qualquer teste instanciar um model real (ex: Recibo(...), ManutencaoAssistencia(...)) —
# evita "InvalidRequestError: ... failed to locate a name" ao resolver relationships
# declaradas por nome de string (mesmo padrão de import usado em app/main.py).
import app.models.condominio_model
import app.models.endereco_model
import app.models.contato_model
import app.models.servico_model
import app.models.nota_fiscal_model
import app.models.exclusao_model
import app.models.boleto_model
import app.models.configuracao_impostos_model
import app.models.usuario_model
import app.models.configuracao_model
import app.models.ordem_servico_model
import app.models.produto_model
import app.models.orcamento_model
import app.models.termo_garantia_model
import app.models.declaracao_fiscal_model
import app.models.contrato_condominio_model
import app.models.ciclo_nota_model
import app.models.corpo_nota_model
import app.models.fin_categoria_model
import app.models.fin_movimentacao_model
import app.models.fin_saldo_inicial_model
import app.models.cliente_model
import app.models.recibo_model


def make_nota_fiscal(
    id=1,
    numero_nota="11-1",
    tipo=None,
    condominio_id=1,
    cnpj_emitente="12345678000100",
    data_vencimento=None,
    descricao_servico="Troca de motor",
    nota_vinculada_id=None,
    corpo_nota_id=None,
):
    from app.models.nota_fiscal_model import TipoNota, StatusNota
    from datetime import date

    nota = MagicMock()
    nota.id = id
    nota.numero_nota = numero_nota
    nota.tipo = tipo or TipoNota.PRODUTO
    nota.condominio_id = condominio_id
    nota.cnpj_emitente = cnpj_emitente
    nota.data_vencimento = data_vencimento or date(2026, 5, 20)
    nota.descricao_servico = descricao_servico
    nota.nota_vinculada_id = nota_vinculada_id
    nota.corpo_nota_id = corpo_nota_id
    nota.status = StatusNota.AUTORIZADA
    return nota


def make_corpo_nota(
    id=10,
    condominio_id=1,
    ciclo_id=5,
    tipo_nota=None,
    numero_nf=42,
    numero_nf_produto=None,
    valor_nota_produto=Decimal("1500.00"),
    nota_fiscal_id=None,
    nota_produto_id=None,
    status=None,
    mes_referencia="05/2026",
    numero_os="OS-001",
    descricao_servico="Manutenção preventiva",
):
    from app.models.ciclo_nota_model import TipoNotaCorpo
    from app.models.corpo_nota_model import StatusCorpoNota

    corpo = MagicMock()
    corpo.id = id
    corpo.condominio_id = condominio_id
    corpo.ciclo_id = ciclo_id
    corpo.tipo_nota = tipo_nota or TipoNotaCorpo.SERVICO
    corpo.numero_nf = numero_nf
    corpo.numero_nf_produto = numero_nf_produto
    corpo.valor_nota_produto = valor_nota_produto
    corpo.nota_fiscal_id = nota_fiscal_id
    corpo.nota_produto_id = nota_produto_id
    corpo.status = status or StatusCorpoNota.GERADO
    corpo.mes_referencia = mes_referencia
    corpo.numero_os = numero_os
    corpo.descricao_servico = descricao_servico
    corpo.deletado_em = None
    return corpo


def make_configuracao_inter(
    id=1,
    cnpj="12345678000100",
    tipo_nota="PRODUTO",
    numero_nf_produto=11,
    numero_nf_servico=42,
    ativo=True,
):
    conta = MagicMock()
    conta.id = id
    conta.cnpj = cnpj
    conta.tipo_nota = tipo_nota
    conta.numero_nf_produto = numero_nf_produto
    conta.numero_nf_servico = numero_nf_servico
    conta.ativo = ativo
    return conta
