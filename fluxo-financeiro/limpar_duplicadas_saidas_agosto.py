# -*- coding: utf-8 -*-
"""
Passo 2b — soft-delete das SAÍDAS DUPLICADAS de agosto/2026 (produção).

Lista CONGELADA abaixo (37 movs). Cada uma foi conferida contra o extrato do banco
e/ou contra a mov "que fica" (keeper). Detalhe em RESULTADO_PASSO2B_SAIDAS_AGOSTO.md.

  LOTE 1 (26) — transferência interna lançada 2× como SAÍDA. A transferência já
               está como fin_movimentacoes ENTRADA com banco_origem_id (keeper).
  LOTE 2 (10) — fornecedor: batch de 31/08 repete a migração Fornecedor de 25/08
               (keeper = a de 25/08, tem fornecedor_id).
  LOTE 3 ( 1) — folha: 2097 é cópia de 2092 (mesma rescisão Pedro, mesmo dia).

NÃO toca na folha de agosto propriamente (salários/adiantamentos únicos do batch
31/08) — isso é da Fase D2.

Soft-delete = `despesas.deletado_em` + `fin_movimentacoes.deletado_em`
(igual DespesaService.deletar) + registro em `registros_exclusoes`. Parcela PAGO
fica pendurada numa despesa já apagada (inerte — toda query junta em despesas).

Uso:
  dry-run: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/limpar_duplicadas_saidas_agosto.py
  aplicar:  ... limpar_duplicadas_saidas_agosto.py --aplicar
"""
import io
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import paramiko

APLICAR = "--aplicar" in sys.argv
HOST = "168.231.96.184"

# (mov_id, lote, keeper_id, motivo_curto)
DUPLICADAS = [
    # LOTE 1 — transferências (keeper = mov ENTRADA com banco_origem_id)
    (2047, 1, 2005, "transf Itau->Inter CMPORT R$200 05/08"),
    (2048, 1, 2006, "transf Itau->Inter CMPORT R$50 06/08"),
    (2050, 1, 2060, "transf Itau->Inter TEC R$1882,24 07/08"),
    (2051, 1, 2062, "transf Itau->Inter TEC R$199,73 12/08"),
    (2053, 1, 2067, "transf Itau->Inter TEC R$487,20 21/08"),
    (2054, 1, 2011, "transf Itau->Inter CMPORT R$550,17 24/08"),
    (2018, 1, 2061, "transf Inter CMPORT->TEC R$10000 11/08"),
    (2019, 1, 2063, "transf Inter CMPORT->TEC R$900 12/08"),
    (2020, 1, 2064, "transf Inter CMPORT->TEC R$1400 13/08"),
    (2024, 1, 2065, "transf Inter CMPORT->TEC R$1200 14/08"),
    (2028, 1, 2068, "transf Inter CMPORT->TEC R$2641,88 21/08"),
    (2029, 1, 2069, "transf Inter CMPORT->TEC R$700 21/08"),
    (2032, 1, 2070, "transf Inter CMPORT->TEC R$300 25/08"),
    (2033, 1, 2071, "transf Inter CMPORT->TEC R$870 25/08"),
    (2042, 1, 2066, "transf Inter CMPORT->TEC R$439,23 20/08"),
    (2080, 1, 2072, "transf Inter CMPORT->TEC R$1500 28/08"),
    (2088, 1, 2078, "transf Inter CMPORT->Bradesco R$638,37 31/08"),
    (2090, 1, 2004, "transf Inter TEC->CMPORT R$245 03/08"),
    (2093, 1, 2008, "transf Inter TEC->CMPORT R$2014,92 11/08"),
    (2094, 1, 2004, "transf Inter TEC->CMPORT R$245 03/08 (2a copia)"),
    (2095, 1, 2003, "transf Inter TEC->CMPORT R$50 03/08"),
    (2103, 1, 2007, "transf Inter TEC->CMPORT R$1304,44 11/08"),
    (2115, 1, 2009, "transf Inter TEC->CMPORT R$1000 17/08"),
    (2117, 1, 2010, "transf Inter TEC->CMPORT R$950 18/08"),
    (2129, 1, 2014, "transf Inter TEC->CMPORT R$400 26/08"),
    (2131, 1, 2013, "transf Inter TEC->CMPORT R$1200 26/08"),
    # LOTE 2 — fornecedor 31/08 repete migração 25/08
    (2137, 2, 1994, "DIPROSSEG R$1338,62 07/08 (dup de 1994)"),
    (2138, 2, 1995, "DIPROSSEG R$148,06 07/08 (dup de 1995)"),
    (2139, 2, 1998, "TELMAN R$235,36 14/08 (dup de 1998)"),
    (2140, 2, 1999, "TELMAN R$2035 17/08 (dup de 1999)"),
    (2141, 2, 2000, "JT Thenorio R$110 18/08 (dup de 2000)"),
    (2142, 2, 1996, "DIPROSSEG R$92,92 11/08 (dup de 1996)"),
    (2143, 2, 1997, "DISFER R$539,11 14/08 (dup de 1997)"),
    (2145, 2, 2001, "DISFER R$536,44 26/08 (dup de 2001)"),
    (2116, 2, 1241, "Quero Faturar R$39,90 17/08 (dup de 1241)"),
    (2113, 2, 1282, "Atila Sistema R$1000 14/08 (dup de 1282)"),
    # LOTE 3 — folha duplicada dentro do batch 31/08
    (2097, 3, 2092, "Rescisao Pedro R$5152,32 07/08 (dup de 2092)"),
]

MOTIVO = "Passo 2b reconciliacao agosto — saida duplicada (ver RESULTADO_PASSO2B_SAIDAS_AGOSTO.md)"


def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N cmport_gerenciamento'")
    i, o, e = ssh.exec_command(cmd, timeout=90)
    i.write("SET NAMES utf8mb4; " + sql)
    i.channel.shutdown_write()
    o.channel.recv_exit_status()
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if err.strip() and "Warning" not in err:
        print("SQL ERR:", err[:300])
    return [ln.split("\t") for ln in out.splitlines() if ln.strip()]


def esc(s):
    return s.replace("'", "''")


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", timeout=15)

    ids = ",".join(str(m) for m, _, _, _ in DUPLICADAS)
    keepers = ",".join(str(k) for _, _, k, _ in DUPLICADAS)

    estado = {r[0]: r for r in q(ssh, f"SELECT id,valor,data,tipo,banco_id,deletado_em,LEFT(descricao,34) FROM fin_movimentacoes WHERE id IN ({ids});")}
    keep_estado = {r[0]: r for r in q(ssh, f"SELECT id,valor,data,tipo,banco_id,banco_origem_id,deletado_em FROM fin_movimentacoes WHERE id IN ({keepers});")}
    parc = {}
    for r in q(ssh, f"SELECT dp.movimentacao_id,dp.id,dp.despesa_id FROM despesa_parcelas dp WHERE dp.movimentacao_id IN ({ids});"):
        parc[r[0]] = (r[1], r[2])

    print("=" * 100)
    print(f"LIMPAR SAÍDAS DUPLICADAS — {'APLICAR' if APLICAR else 'DRY-RUN'}  ({len(DUPLICADAS)} movs)")
    print("=" * 100)
    ok, problemas = [], []
    for mov_id, lote, keeper, desc in DUPLICADAS:
        e = estado.get(str(mov_id))
        k = keep_estado.get(str(keeper))
        p = parc.get(str(mov_id))
        prob = []
        if not e:
            prob.append("mov NÃO existe")
        elif e[5] not in ("", "NULL", None):
            prob.append("mov JÁ deletada")
        elif e[3] != "SAIDA":
            prob.append(f"mov tipo={e[3]} (esperado SAIDA)")
        if not k:
            prob.append(f"keeper {keeper} NÃO existe")
        elif k[6] not in ("", "NULL", None):
            prob.append(f"keeper {keeper} está deletado")
        elif lote == 1 and (k[3] != "ENTRADA" or k[5] in ("", "NULL", None)):
            prob.append(f"keeper {keeper} não é ENTRADA c/ banco_origem_id")
        elif lote in (2, 3) and e and abs(float(k[1]) - float(e[1])) > 0.02:
            prob.append(f"keeper {keeper} valor {k[1]} != mov {e[1]}")

        val = e[1] if e else "?"
        dat = e[2] if e else "?"
        marca = "  ".join(prob) if prob else "OK"
        print(f"  L{lote} mov {mov_id:>5}  R$ {float(val):>9,.2f} {dat}  parc={p[0] if p else '-'} desp={p[1] if p else '-'}  keep={keeper}  [{marca}]  {desc}")
        (problemas if prob else ok).append(mov_id)

    print(f"\n  {len(ok)} prontas · {len(problemas)} com problema: {problemas}")

    if not APLICAR:
        print("\n(dry-run — nada aplicado. Rode com --aplicar)")
        ssh.close()
        return
    if problemas:
        print("\nABORTADO — resolva os problemas acima antes de aplicar.")
        ssh.close()
        return

    print("\nAPLICANDO (registrar_exclusao + soft-delete despesa + mov)...")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for mov_id, lote, keeper, desc in DUPLICADAS:
        e = estado[str(mov_id)]
        p = parc.get(str(mov_id))
        snap = f'{{"mov_id": {mov_id}, "valor": "{e[1]}", "data": "{e[2]}", "banco_id": "{e[4]}", "keeper": {keeper}, "lote": {lote}, "desc": "{esc(desc)}"}}'
        # registro de exclusao (mov)
        q(ssh, f"INSERT INTO registros_exclusoes (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, data_exclusao) VALUES ('fin_movimentacao', {mov_id}, '{esc(snap)}', '{esc(MOTIVO)}', 'claude-passo2b', '{now}');")
        q(ssh, f"UPDATE fin_movimentacoes SET deletado_em = '{now}' WHERE id = {mov_id} AND deletado_em IS NULL;")
        if p:
            despesa_id = p[1]
            q(ssh, f"INSERT INTO registros_exclusoes (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, data_exclusao) VALUES ('despesa', {despesa_id}, '{esc(snap)}', '{esc(MOTIVO)}', 'claude-passo2b', '{now}');")
            q(ssh, f"UPDATE despesas SET deletado_em = '{now}', ativo = 0 WHERE id = {despesa_id} AND deletado_em IS NULL;")
        print(f"  mov {mov_id} + despesa {p[1] if p else '-'} soft-deletados")

    # confere totais depois
    print("\nDEPOIS — saídas fin_movimentacoes por banco ago/2026:")
    for r in q(ssh, "SELECT banco_id, COUNT(*), ROUND(SUM(valor),2) FROM fin_movimentacoes WHERE tipo='SAIDA' AND deletado_em IS NULL AND YEAR(data)=2026 AND MONTH(data)=8 GROUP BY banco_id ORDER BY banco_id;"):
        print(f"   banco {r[0]}: {r[1]} movs  R$ {float(r[2]):,.2f}")
    ssh.close()


if __name__ == "__main__":
    main()
