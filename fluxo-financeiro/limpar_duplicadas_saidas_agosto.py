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
    # LOTE 4 — dups achadas no cruzamento fino sistema x extrato (re-entrada 27-31/08
    #          repetiu o batch limpo de 25/08). keeper = a versao que casa com o extrato.
    (2041, 4, 1315, "Armarinhos R$543 01/08 (dup de 1315)"),
    (2027, 4, 2046, "Cafe/Zona Azul R$13,90 21/08 (dup de 2046 Zona Azul, que casa no extrato)"),
    (2030, 4, 2045, "Cafe R$15,69 24/08 (dup de 2045)"),
    (1708, 4, 2043, "Posto Gasolina R$1319,99 22/08 = valor errado de 2043 R$1391,99 (extrato)"),
    (2091, 4, 2096, "Pix Andre R$50 03/08 (o de 03/08 no extrato e transf; pagto real ao Andre = 2096 04/08)"),
    # LOTE 5 — resolvidos com os 5 extratos completos (BTG + Bradesco)
    (1265, 5, 2044, "'Conta de Luz' R$439,23 19/08 — leftover da RECORRENTE 'Conta de Luz' (despesa 10, deletada 27/08); NAO esta em nenhum dos 5 extratos; conta de luz real de agosto = ENEL R$476,95 mov 2044"),
    (2109, 5, 2147, "Salario Andre R$4542,55 13/08 = dup de 2147 R$4543,55 (extrato Inter TEC 13/08 -4543,55 'Andre Moreira Rosa' = 2147 exato)"),
    (1744, 5, 1741, "DAS 07/2026 R$259,24 20/08 — despesa 452 ja deletada 31/08; NAO esta em nenhum dos 5 extratos (nao foi pago por banco); mov solta"),
    # LOTE 6 — transferencias-saida duplicadas que o comparar_saidas casou por engano
    #          com as linhas de transferencia do extrato. keeper = mov ENTRADA c/ banco_origem_id.
    (2021, 6, 2073, "transf Inter CMPORT->Bradesco R$858 13/08 (espelho ENTRADA 2073)"),
    (2022, 6, 2074, "transf Inter CMPORT->Bradesco R$321 14/08 (espelho ENTRADA 2074)"),
    (2023, 6, 2156, "transf Inter CMPORT->BTG R$270 14/08 (espelho ENTRADA 2156)"),
    (2035, 6, 2075, "transf Inter CMPORT->Bradesco R$600 26/08 (espelho ENTRADA 2075)"),
    (2036, 6, 2002, "transf Inter CMPORT->Itau R$744,18 27/08 (espelho ENTRADA 2002)"),
    (2104, 6, 2154, "transf Inter TEC->BTG R$1080 12/08 13o (espelho ENTRADA 2154)"),
    (2110, 6, 2155, "transf Inter TEC->BTG R$769,09 14/08 imposto (espelho ENTRADA 2155)"),
    (2111, 6, 2157, "transf Inter TEC->BTG R$498 14/08 imposto (espelho ENTRADA 2157)"),
    (2114, 6, 2158, "transf Inter TEC->BTG R$130 17/08 imposto (espelho ENTRADA 2158)"),
    (2118, 6, 2159, "transf Inter TEC->BTG R$509,62 20/08 GPS (espelho ENTRADA 2159)"),
    (2125, 6, 2160, "transf Inter TEC->BTG R$800 24/08 ferias Luis (espelho ENTRADA 2160)"),
    (2130, 6, 2161, "transf Inter TEC->BTG R$1800 26/08 ferias/13o (espelho ENTRADA 2161)"),
    (2153, 6, 2012, "transf BTG->Inter CMPORT R$1350 24/08 (a transf e a ENTRADA 2012; 2153 e a 2a cópia como saida no BTG)"),
]

MOTIVO = "Passo 2b reconciliacao agosto — saida duplicada (ver RESULTADO_PASSO2B_SAIDAS_AGOSTO.md)"

# (mov_id, data_nova, motivo) — pagamento real, so a data estava errada vs extrato
CORRIGIR_DATA = [
    (1934, "2026-08-26", "Convenio Medico = Assoc. Beneficencia no extrato (26/08, nao 20/08)"),
]

# (mov_id, campo, valor_novo, motivo) — correcoes de metadado sem apagar
CORRIGIR_CAMPO = [
    (2147, "descricao", "Salário André Moreira Rosa - Agosto/2026",
     "descricao era 'Pagamento Referente ao Mes Julho/2026' — e o salario do Andre 13/08 (extrato Inter TEC -4543,55)"),
    (2075, "banco_origem_id", "2",
     "transf p/ Bradesco R$600 saiu da Inter CMPORT (extrato Inter CM 26/08 -600 'Pix enviado CM PORT'), nao do Itau"),
    (2012, "banco_origem_id", "5",
     "transf de R$1350 p/ Inter CMPORT (24/08) saiu do BTG (extrato BTG -1350 'Cmport Sistemas'), nao da Inter TEC"),
]


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
    desp_ids = ",".join({str(p[1]) for p in parc.values()}) or "0"
    desp_del = {r[0]: (r[1] not in ("", "NULL", None)) for r in q(ssh, f"SELECT id, deletado_em FROM despesas WHERE id IN ({desp_ids});")}

    print("=" * 100)
    print(f"LIMPAR SAÍDAS DUPLICADAS — {'APLICAR' if APLICAR else 'DRY-RUN'}  ({len(DUPLICADAS)} movs)")
    print("=" * 100)
    ok, problemas, ja_feito = [], [], []
    for mov_id, lote, keeper, desc in DUPLICADAS:
        e = estado.get(str(mov_id))
        k = keep_estado.get(str(keeper))
        p = parc.get(str(mov_id))
        prob = []
        if e and e[5] not in ("", "NULL", None):
            ja_feito.append(mov_id)
            continue
        if not e:
            prob.append("mov NÃO existe")
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

    print(f"\n  {len(ok)} prontas · {len(ja_feito)} já feitas ({ja_feito}) · {len(problemas)} com problema: {problemas}")

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
    ja_set = set(ja_feito)
    for mov_id, lote, keeper, desc in DUPLICADAS:
        if mov_id in ja_set:
            continue
        e = estado[str(mov_id)]
        p = parc.get(str(mov_id))
        snap = f'{{"mov_id": {mov_id}, "valor": "{e[1]}", "data": "{e[2]}", "banco_id": "{e[4]}", "keeper": {keeper}, "lote": {lote}, "desc": "{esc(desc)}"}}'
        # registro de exclusao (mov)
        q(ssh, f"INSERT INTO registros_exclusoes (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, data_exclusao) VALUES ('fin_movimentacao', {mov_id}, '{esc(snap)}', '{esc(MOTIVO)}', 'claude-passo2b', '{now}');")
        q(ssh, f"UPDATE fin_movimentacoes SET deletado_em = '{now}' WHERE id = {mov_id} AND deletado_em IS NULL;")
        despesa_txt = "-"
        if p and not desp_del.get(str(p[1]), False):
            despesa_id = p[1]
            q(ssh, f"INSERT INTO registros_exclusoes (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, data_exclusao) VALUES ('despesa', {despesa_id}, '{esc(snap)}', '{esc(MOTIVO)}', 'claude-passo2b', '{now}');")
            q(ssh, f"UPDATE despesas SET deletado_em = '{now}', ativo = 0 WHERE id = {despesa_id} AND deletado_em IS NULL;")
            despesa_txt = str(despesa_id)
        elif p:
            despesa_txt = f"{p[1]} (já deletada, só a mov)"
        print(f"  mov {mov_id} soft-deletado · despesa {despesa_txt}")

    for mov_id, data_nova, motivo in CORRIGIR_DATA:
        r = q(ssh, f"SELECT data, deletado_em FROM fin_movimentacoes WHERE id = {mov_id};")
        if r and r[0][1] in ("", "NULL", None):
            q(ssh, f"UPDATE fin_movimentacoes SET data = '{data_nova}' WHERE id = {mov_id};")
            print(f"  mov {mov_id}: data {r[0][0]} -> {data_nova}  ({motivo})")

    for mov_id, campo, valor_novo, motivo in CORRIGIR_CAMPO:
        r = q(ssh, f"SELECT {campo}, deletado_em FROM fin_movimentacoes WHERE id = {mov_id};")
        if r and r[0][1] in ("", "NULL", None):
            v = valor_novo if campo == "banco_origem_id" else f"'{esc(valor_novo)}'"
            q(ssh, f"UPDATE fin_movimentacoes SET {campo} = {v} WHERE id = {mov_id};")
            print(f"  mov {mov_id}: {campo} '{r[0][0]}' -> {valor_novo}  ({motivo[:60]})")

    # confere totais depois
    print("\nDEPOIS — saídas fin_movimentacoes por banco ago/2026:")
    for r in q(ssh, "SELECT banco_id, COUNT(*), ROUND(SUM(valor),2) FROM fin_movimentacoes WHERE tipo='SAIDA' AND deletado_em IS NULL AND YEAR(data)=2026 AND MONTH(data)=8 GROUP BY banco_id ORDER BY banco_id;"):
        print(f"   banco {r[0]}: {r[1]} movs  R$ {float(r[2]):,.2f}")
    ssh.close()


if __name__ == "__main__":
    main()
