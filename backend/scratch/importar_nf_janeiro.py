"""
Importa as 45 NFs de manutenção de Janeiro 2026 que estão na planilha mas faltam no banco.
Executa em modo DRY_RUN por padrão — só imprime o SQL.
Para executar de verdade: python importar_nf_janeiro.py --executar
"""
import sys
import re
import subprocess
from pathlib import Path
from datetime import datetime

try:
    import openpyxl
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "openpyxl"], check=True)
    import openpyxl

DRY_RUN = "--executar" not in sys.argv

# Nomes abreviados/incertos — aguardando confirmação do usuário
PULAR = {
    "Assumpita Sica",
    "Penthouse",
    "Sbios",
    "Piazza Fontana (Poste)",
    "Raposo Tavares (Poste)",
    "The Crystal Houser",
}
BASE = Path(__file__).parent.parent.parent

# ──────────────────────────────────────────────────────────────
# MAPEAMENTO: nome na planilha → condominio_id no banco
# Verificado manualmente contra a tabela condominios
# ──────────────────────────────────────────────────────────────
MAPA_CONDOMINIO = {
    "Assumpita Sica":          378,   # EDIFICIO ASSUMPTA DE SICA
    "Alvorada":                225,   # CONDOMINIO EDIFICIO ALVORADA
    "Bahamas":                 596,   # CONDOMINIO EDIFICIO BAHAMAS
    "Bonaire":                 663,   # CONDOMINIO EDIFICIO BONAIRE
    "Cap Martinique":          414,   # CONDOMINIO EDIFICIO CAP MARTINIQUE
    "Cezario Motta":           670,   # CONDOMINIO EDIFICIO CEZARIO MOTTA
    "Cintia":                  650,   # Condominio Edificio Cintia
    "Costa Brava":             394,   # Condominio Edificio Costa Brava
    "Cube Vila Ipojuca":       714,   # Condominio Cube Vila Ipojuca
    "Ipiranga":                176,   # Condomínio Residencial Ipiranga
    "Lucerna":                 651,   # Condominio Edificio Lucerna
    "Odete":                   689,   # Condominio Edificio Odete
    "Olivais":                 661,   # Condominio Edificio Olivais
    "Paço de Hygienopolis":    675,   # Condominio Edificio Paço de Hygienopolis
    "Penthouse":               671,   # Edificio Penthouse Campo Belo
    "Piazza Fontana (Poste)":  678,   # Condominio Edificio Piazza Fontana
    "Raposo Tavares (Poste)":  672,   # Condominio Edificio Raposo Tavares
    "Sbios":                   451,   # Sbios - Investimentos Imobilirios
    "Sintonia Perdizes":       534,   # CONDOMINIO SINTONIA PERDIZES
    "The Crystal Houser":      505,   # CONDOMINIO EDIFICIO THE CRYSTAL HOUSE
    "Ville Courchevel":        244,   # Condomínio Ville Courchevel
    "Angra dos Reis":          648,   # Condominio Edificio Angra dos Reis
    "Concor":                  685,   # Condominio Edificio Concor
    "Maison Saint Etienne":    674,   # Condominio Edificio Maison Saint Etienne
    "Park":                    673,   # Condominio Edificio Park
    "Piazza Fontana":          678,   # Condominio Edificio Piazza Fontana
    "Raposo Tavares":          672,   # Condominio Edificio Raposo Tavares
    "Vermont":                 652,   # Condominio Edificio Vermont
    "Via Del Corso":           657,   # Condominio Edificio Via Del Corso
    "Helbor Lof Evolution":    679,   # Edificio Helbor Loft Evolution
    "Ibirapuera Park":         684,   # Condominio Edificio Ibirapuera Park
    "Jardim Buenos Aires":     653,   # Condominio Edificio Jardim Buenos Aires
    "Park Avenue":             676,   # Condominio Edificio Park Avenue
    "Reynolds":                654,   # Condominio Edificio Reynolds
    "Fortezza Di Ferrara":     742,   # Associação Dos Moradores Do Conj Res Fortezza Di Ferrara
    "Jose Antonio Alpiovezza": 686,   # Condominio Edificio Jose Antonio Alpiovezza
    "Jussara":                 668,   # Condominio Edificio Jussara
    "Le Monde":                665,   # Condominio Residencial Le Monde
    "Macunaima":               125,   # Condominio Edificio Macunaima
    "Margaux":                 152,   # Condomínio Edifício Margaux
    "Mont Blanc":              688,   # Condominio Edificio Mont Blanc
    "Verbena":                 175,   # Condominio Edificio Verbena
    "Araucarias":              582,   # CONDOMINIO RESIDENCIAL ARAUCARIAS
    "Cullinan":                154,   # Condomínio Cullinan
    "Olga":                    736,   # Condomínio Edifício Olga
}

# ──────────────────────────────────────────────────────────────
# 1. LER PLANILHA
# ──────────────────────────────────────────────────────────────
PLANILHA = BASE / "Entradas Fluxo Janeiro.xlsx"
wb = openpyxl.load_workbook(PLANILHA, data_only=True, read_only=True)
ws = wb.active

nfs = []
mes_atual = None
for row in ws.iter_rows(min_row=1, max_col=12, values_only=True):
    cod, _, cond, categ, nf_raw, parcela, _, vencto, _, _, valor, _ = (row + (None,)*12)[:12]

    if cod and isinstance(cod, str):
        m = re.search(r"(\d+)2026", cod)
        if m:
            mes_atual = int(m.group(1))

    if not nf_raw:
        continue
    try:
        nf_num = int(nf_raw)
    except (ValueError, TypeError):
        continue
    if nf_num < 1000 or mes_atual is None:
        continue

    cond_str = str(cond).strip() if cond else ""
    if cond_str in PULAR:
        continue
    venc_dt = vencto if hasattr(vencto, "strftime") else None
    valor_f = float(valor) if isinstance(valor, (int, float)) else None

    # Corrige erro de digitação: NF 7509 tem 2025 na planilha, deve ser 2026
    venc_str_fix = venc_dt.strftime("%Y-%m-%d") if venc_dt else None
    if str(nf_num) == "7509" and venc_str_fix and venc_str_fix.startswith("2025"):
        venc_str_fix = venc_str_fix.replace("2025", "2026")

    nfs.append({
        "numero_nota": str(nf_num),
        "condominio_nome": cond_str,
        "condominio_id":   MAPA_CONDOMINIO.get(cond_str),
        "vencimento":      venc_str_fix,
        "valor":           valor_f,
        "mes":             mes_atual,
    })

print(f"NFs lidas da planilha: {len(nfs)}")

# ──────────────────────────────────────────────────────────────
# 2. VERIFICAR MAPEAMENTO
# ──────────────────────────────────────────────────────────────
sem_mapa = [n for n in nfs if n["condominio_id"] is None]
if sem_mapa:
    print("\nATENCAO: condomínios sem mapeamento encontrado:")
    for n in sem_mapa:
        print(f"  NF {n['numero_nota']} — '{n['condominio_nome']}'")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────
# 3. GERAR SQL
# ──────────────────────────────────────────────────────────────
OBS = "Importado manualmente - Janeiro 2026 - valor ja pago na epoca"
XML_PLACEHOLDER = "IMPORTADO_MANUAL_JAN2026"

inserts = []
for n in nfs:
    sql = (
        f"INSERT INTO notas_fiscais "
        f"(condominio_id, numero_nota, tipo, status, parcelas, valor, valor_boleto_parcela, "
        f"data_vencimento, data_pagamento, observacao, xml_original, alerta_impostos) VALUES ("
        f"{n['condominio_id']}, "
        f"'{n['numero_nota']}', "
        f"'MANUTENCAO', "
        f"'AUTORIZADA', "
        f"1, "
        f"{n['valor']}, "
        f"{n['valor']}, "
        f"'{n['vencimento']}', "
        f"'{n['vencimento']}', "  # data_pagamento = vencimento (já foram pagos)
        f"'{OBS}', "
        f"'{XML_PLACEHOLDER}', "
        f"0"
        f");"
    )
    inserts.append((n, sql))

# ──────────────────────────────────────────────────────────────
# 4. PREVIEW
# ──────────────────────────────────────────────────────────────
print(f"\n{'='*80}")
print(f"PREVIEW — {len(inserts)} registros a inserir")
print(f"{'='*80}")
print(f"{'NF':<8} {'Condomínio':<35} {'Vencimento':<12} {'Valor':>10}  Cond.ID")
print(f"{'-'*8} {'-'*35} {'-'*12} {'-'*10}  {'-'*7}")
total = 0
for n, _ in inserts:
    print(f"{n['numero_nota']:<8} {n['condominio_nome'][:35]:<35} {n['vencimento']:<12} {n['valor']:>10.2f}  {n['condominio_id']}")
    total += n['valor']
print(f"\nTOTAL: R$ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
print(f"\nCampos que serao preenchidos:")
print(f"  tipo            = MANUTENCAO")
print(f"  status          = AUTORIZADA")
print(f"  parcelas        = 1")
print(f"  data_pagamento  = mesma data do vencimento (ja pago)")
print(f"  xml_original    = '{XML_PLACEHOLDER}' (placeholder)")
print(f"  alerta_impostos = 0")
print(f"  observacao      = '{OBS}'")
print(f"  cnpj_emitente   = NULL (igual as demais manutencoes no sistema)")

if DRY_RUN:
    print(f"\n[DRY RUN] Nenhum dado foi alterado.")
    print(f"Para executar de verdade rode:")
    print(f"  python backend\\scratch\\importar_nf_janeiro.py --executar")
    sys.exit(0)

# ──────────────────────────────────────────────────────────────
# 5. EXECUTAR NO BANCO
# ──────────────────────────────────────────────────────────────
print(f"\n{'='*80}")
print(f"EXECUTANDO no banco de producao...")
print(f"{'='*80}")

sql_completo = "\n".join(sql for _, sql in inserts)

# Envia SQL via stdin para evitar problemas de escape com aspas
CMD = [
    "ssh", "-i", str(Path.home() / ".ssh" / "id_ed25519"),
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=15",
    "root@168.231.96.184",
    "docker exec -i cmport_db mysql -uroot -pcmport2026 cmport_gerenciamento"
]

result = subprocess.run(CMD, input=sql_completo, capture_output=True, text=True, timeout=60)
if result.returncode != 0:
    print(f"ERRO:\n{result.stderr}")
    sys.exit(1)

print(f"OK — {len(inserts)} NFs inseridas com sucesso!")

# Criar boleto PAGO e serviço para cada NF inserida
sql_boletos_servicos = []
for n, _ in inserts:
    nf_id_placeholder = f"(SELECT id FROM notas_fiscais WHERE numero_nota='{n['numero_nota']}')"
    cond_id = n['condominio_id']
    v = n['vencimento']
    val = n['valor']
    sql_boletos_servicos.append(
        f"INSERT INTO boletos (nota_fiscal_id, numero_parcela, total_parcelas, "
        f"valor_nominal, valor_juros, valor_multa, valor_total_recebido, "
        f"data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento, observacao) "
        f"VALUES ({nf_id_placeholder}, 1, 1, {val}, 0, 0, {val}, '{v}', '{v}', '{v}', "
        f"'SIMPLES', 'PAGO', 'TRANSFERENCIA', '{OBS}');"
    )
    sql_boletos_servicos.append(
        f"INSERT INTO manutencoes_assistencias "
        f"(condominio_id, nota_fiscal_id, tipo, data_servico, descricao, bloquear_vinculo_automatico, criado_em, atualizado_em) "
        f"VALUES ({cond_id}, {nf_id_placeholder}, 'MANUTENCAO', '2026-01-01', '{OBS}', 1, NOW(), NOW());"
    )

result2 = subprocess.run(CMD, input="\n".join(sql_boletos_servicos), capture_output=True, text=True, timeout=60)
if result2.returncode != 0:
    print(f"AVISO boletos/servicos: {result2.stderr}")
else:
    print(f"OK — boletos e servicos criados para as {len(inserts)} NFs")

# Verificação
verify = subprocess.run(CMD,
    input="SELECT COUNT(*) as total FROM notas_fiscais WHERE numero_nota BETWEEN 7467 AND 7511;",
    capture_output=True, text=True, timeout=15
)
print(f"Verificacao: {verify.stdout.strip()}")
