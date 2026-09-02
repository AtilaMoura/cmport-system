# -*- coding: utf-8 -*-
"""
Backfill de notas_fiscais.data_emissao a partir do xml_original ja salvo.

Roda SO no banco LOCAL (usa o SessionLocal da app). NAO toca em producao.

Ordem de preenchimento por nota:
  1. data de emissao lida do XML (extrair_data_emissao)
  2. fallback: data_servico do servico vinculado (ManutencaoAssistencia)
  3. fallback: data_vencimento da propria nota

Uso (a partir da pasta backend, com a venv):
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backfill_data_emissao_notas.py
        -> DRY-RUN: so conta e mostra amostra, nao grava nada

    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backfill_data_emissao_notas.py --aplicar
        -> grava data_emissao no banco local

    ... --force   -> reprocessa tambem as notas que ja tem data_emissao preenchida
"""
import argparse
import sys
from pathlib import Path

# permite rodar de qualquer cwd: poe backend/ no sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

# importa app.main pra registrar TODOS os models (senao o mapper do SQLAlchemy
# nao resolve as relationships de ManutencaoAssistencia). Roda migracoes/seeds
# do banco LOCAL — idempotente.
import app.main  # noqa: F401
from app.core.database import SessionLocal
from app.models.nota_fiscal_model import NotaFiscal
from app.models.servico_model import ManutencaoAssistencia
from app.services.nota_fiscal_service import extrair_data_emissao


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="grava no banco (default: dry-run)")
    ap.add_argument("--force", action="store_true", help="reprocessa notas que ja tem data_emissao")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        notas = db.query(NotaFiscal).all()
        total = len(notas)
        # mapa nota_id -> data_servico do primeiro servico vinculado
        serv = db.query(ManutencaoAssistencia).filter(
            ManutencaoAssistencia.nota_fiscal_id.isnot(None)
        ).all()
        data_servico_por_nota = {}
        for s in serv:
            data_servico_por_nota.setdefault(s.nota_fiscal_id, s.data_servico)

        via_xml = via_servico = via_vencimento = ja_ok = sem_data = 0
        amostra = []

        for nota in notas:
            if nota.data_emissao and not args.force:
                ja_ok += 1
                continue

            fonte = None
            nova = extrair_data_emissao(nota.xml_original)
            if nova:
                fonte = "xml"
            else:
                nova = data_servico_por_nota.get(nota.id)
                if nova:
                    fonte = "servico"
                else:
                    nova = nota.data_vencimento
                    fonte = "vencimento" if nova else None

            if not nova:
                sem_data += 1
                continue

            if fonte == "xml":
                via_xml += 1
            elif fonte == "servico":
                via_servico += 1
            else:
                via_vencimento += 1

            if len(amostra) < 15:
                amostra.append((nota.id, nota.numero_nota, str(nova), fonte))

            if args.aplicar:
                nota.data_emissao = nova

        if args.aplicar:
            db.commit()

        print(f"Total de notas .............. {total}")
        print(f"Ja tinham data_emissao ...... {ja_ok}" + ("  (reprocessadas por --force)" if args.force else ""))
        print(f"Preenchidas via XML ......... {via_xml}")
        print(f"Preenchidas via data_servico  {via_servico}")
        print(f"Preenchidas via vencimento .. {via_vencimento}")
        print(f"Sem nenhuma data ............ {sem_data}")
        print()
        print("Amostra (nota_id | numero | data_emissao | fonte):")
        for r in amostra:
            print(f"  {r[0]:>6} | {r[1]:<14} | {r[2]} | {r[3]}")
        print()
        print("APLICADO no banco local." if args.aplicar else "DRY-RUN — nada foi gravado. Rode com --aplicar.")
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
