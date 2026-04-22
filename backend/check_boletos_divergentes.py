"""
Script somente leitura — verifica boletos EMABERTO/VENCIDO no banco
que o Inter já considera como PAGO, BAIXADO, CANCELADO ou EXPIRADO.
Não altera nada no banco.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.core.database import SessionLocal
# importar todos os models para o SQLAlchemy resolver os relacionamentos
from app.models.condominio_model import Condominio
from app.models.endereco_model import Endereco
from app.models.contato_model import Contato
from app.models.servico_model import ManutencaoAssistencia
from app.models.nota_fiscal_model import NotaFiscal
from app.models.boleto_model import Boleto, SituacaoBoleto
from app.services import inter_client

SITUACOES_PENDENTES = {SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO}

MAPA = {
    "EMABERTO": SituacaoBoleto.EMABERTO,
    "PAGO": SituacaoBoleto.PAGO,
    "CANCELADO": SituacaoBoleto.CANCELADO,
    "EXPIRADO": SituacaoBoleto.EXPIRADO,
    "VENCIDO": SituacaoBoleto.VENCIDO,
    "BAIXADO": SituacaoBoleto.BAIXADO,
    "A_RECEBER": SituacaoBoleto.EMABERTO,
    "REGISTRADO": SituacaoBoleto.EMABERTO,
    "RECEBIDO": SituacaoBoleto.PAGO,
    "BAIXADO_BOLETO_NAO_PAGO": SituacaoBoleto.BAIXADO,
    "ATRASADO": SituacaoBoleto.VENCIDO,
}


def main():
    db = SessionLocal()
    try:
        pendentes = db.query(Boleto).filter(
            Boleto.situacao.in_(SITUACOES_PENDENTES)
        ).all()

        print(f"\nBoletos EMABERTO/VENCIDO no banco: {len(pendentes)}")
        print(f"Destes, com código Inter: {sum(1 for b in pendentes if b.codigo_solicitacao)}\n")

        divergentes = []
        sem_codigo = []
        erros = []

        for b in pendentes:
            if not b.codigo_solicitacao:
                sem_codigo.append(b)
                continue

            try:
                dados = inter_client.consultar_boleto(b.codigo_solicitacao)
                situacao_inter_raw = dados.get("situacao", "EMABERTO")
                situacao_inter = MAPA.get(situacao_inter_raw.upper(), SituacaoBoleto.EMABERTO)

                pag_obj = dados.get("pagamento") or {}
                data_pag = dados.get("dataPagamento") or pag_obj.get("dataPagamento")
                valor_rec = dados.get("valorTotalRecebido") or pag_obj.get("valorPago") or pag_obj.get("valorTotalRecebido")

                if situacao_inter != b.situacao:
                    divergentes.append({
                        "boleto_id": b.id,
                        "codigo": b.codigo_solicitacao,
                        "seu_numero": b.seu_numero,
                        "valor": b.valor_nominal,
                        "vencimento": b.data_vencimento,
                        "status_banco": b.situacao.value,
                        "status_inter": situacao_inter_raw,
                        "data_pagamento": data_pag,
                        "valor_recebido": valor_rec,
                    })
            except Exception as e:
                erros.append({"codigo": b.codigo_solicitacao, "erro": str(e)})

        # ── Relatório ──────────────────────────────────────────────────────────

        if divergentes:
            print(f"{'='*90}")
            print(f"  DIVERGENTES: {len(divergentes)} boleto(s) com status diferente entre banco e Inter")
            print(f"{'='*90}")
            for d in divergentes:
                print(
                    f"  ID={d['boleto_id']:>4} | seuNumero={str(d['seu_numero']):>14} | "
                    f"R$ {d['valor']:>9.2f} | venc={d['vencimento']} | "
                    f"BANCO={d['status_banco']:>8} → INTER={d['status_inter']}"
                )
                if d["data_pagamento"]:
                    print(f"          dataPagamento={d['data_pagamento']}  valorRecebido={d['valor_recebido']}")
        else:
            print("Nenhuma divergência encontrada — banco e Inter estão sincronizados.")

        if sem_codigo:
            print(f"\n  Boletos sem código Inter (manuais/PIX etc): {len(sem_codigo)}")
            for b in sem_codigo:
                print(f"    ID={b.id} | R$ {b.valor_nominal:.2f} | {b.situacao.value} | venc={b.data_vencimento}")

        if erros:
            print(f"\n  Erros ao consultar Inter ({len(erros)}):")
            for e in erros:
                print(f"    {e['codigo']}: {e['erro']}")

        print(f"\nTotal consultados no Inter: {len(pendentes) - len(sem_codigo)}")
        print(f"Divergentes: {len(divergentes)} | Sem código: {len(sem_codigo)} | Erros: {len(erros)}\n")

    finally:
        db.close()


if __name__ == "__main__":
    main()
