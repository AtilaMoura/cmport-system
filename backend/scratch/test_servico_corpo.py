"""
Testa a lógica do corpo da nota de SERVIÇO sem afetar banco de dados.
Execute: python scratch/test_servico_corpo.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Mock de módulos que dependem de boto3 / banco ────────────────────────────
import types

boto3_mock = types.ModuleType("boto3")
sys.modules["boto3"] = boto3_mock

botocore_mock = types.ModuleType("botocore")
botocore_client_mock = types.ModuleType("botocore.client")
botocore_client_mock.Config = object
botocore_exceptions_mock = types.ModuleType("botocore.exceptions")
botocore_exceptions_mock.ClientError = Exception
sys.modules["botocore"] = botocore_mock
sys.modules["botocore.client"] = botocore_client_mock
sys.modules["botocore.exceptions"] = botocore_exceptions_mock
botocore_mock.client = botocore_client_mock
botocore_mock.exceptions = botocore_exceptions_mock

# ── Imports reais ────────────────────────────────────────────────────────────
from datetime import date
from app.services.corpo_nota_service import CorpoNotaService
from app.services.imposto_service import ImpostosCalculados


# ── Helpers ──────────────────────────────────────────────────────────────────
def secao(titulo: str):
    print(f"\n{'='*60}")
    print(f"  {titulo}")
    print('='*60)

def ok(descricao: str):
    print(f"  [OK]  {descricao}")

def falhou(descricao: str, detalhe: str = ""):
    print(f"  [FALHOU]  {descricao}")
    if detalhe:
        print(f"     {detalhe}")


# ── Fixture de impostos ──────────────────────────────────────────────────────
def impostos_padrao(valor_bruto: float) -> ImpostosCalculados:
    pct_inss   = 11.0
    pct_cofins =  3.0
    pct_pis    =  0.65
    pct_csll   =  1.0
    return ImpostosCalculados(
        percentual_inss=pct_inss,
        percentual_cofins=pct_cofins,
        percentual_pis=pct_pis,
        percentual_csll=pct_csll,
        percentual_iss=0.0,
        valor_inss=round(valor_bruto * pct_inss / 100, 2),
        valor_cofins=round(valor_bruto * pct_cofins / 100, 2),
        valor_pis=round(valor_bruto * pct_pis / 100, 2),
        valor_csll=round(valor_bruto * pct_csll / 100, 2),
        valor_iss=0.0,
        valor_liquido=round(valor_bruto * (1 - (pct_inss + pct_cofins + pct_pis + pct_csll) / 100), 2),
    )


# ── Teste 1: valor por extenso ────────────────────────────────────────────────
secao("1. _valor_por_extenso")
casos = [
    (1000.00,   "mil reais"),
    (1500.50,   "mil e quinhentos reais e cinquenta centavos"),
    (2345.00,   "dois mil e trezentos e quarenta e cinco reais"),
    (100.00,    "cem reais"),
    (15000.00,  "quinze mil reais"),
]
for valor, esperado in casos:
    resultado = CorpoNotaService._valor_por_extenso(valor)
    if resultado == esperado:
        ok(f"R$ {valor:.2f} → '{resultado}'")
    else:
        falhou(f"R$ {valor:.2f}", f"obtido='{resultado}' esperado='{esperado}'")


# ── Teste 2: template SERVIÇO sem nota de produto ─────────────────────────────
secao("2. _montar_texto_servico — só nota de serviço")
valor = 5000.00
imp = impostos_padrao(valor)
texto = CorpoNotaService._montar_texto_servico(
    nome_cond="Condomínio Teste",
    mes_referencia="05/2026",
    descricao_servico="Instalação de motor de portão",
    numero_os="OS nº 74220219",
    data_servico_texto="20.05.2026",
    data_servico=date(2026, 5, 20),
    valor_bruto=valor,
    impostos=imp,
    data_vencimento=date(2026, 6, 10),
    observacoes=None,
    descricao_garantia="06 meses",
    valor_nota_produto=None,
)
linhas = texto.split("\n")
checks = [
    ("Cabeçalho SERVIÇO", "ESSE É O CORPO DA NOTA DE SERVIÇO" in texto),
    ("Não tem MANUTENÇÃO no cabeçalho", "MANUTENÇÃO PREVENTIVA" not in texto),
    ("Data texto livre", "20.05.2026" in texto),
    ("Número OS", "OS nº 74220219" in texto),
    ("Garantia", "06 meses" in texto),
    ("Valor serviço", "R$ 5.000,00" in texto),
    ("INSS 11%", "INSS 11%" in texto),
    ("Vencimento parcela", "10/06/2026" in texto),
    ("Sem bloco Produto", "Nota de Produto" not in texto),
    ("Rodapé", "Atenciosamente," in texto),
]
for desc, cond in checks:
    (ok if cond else falhou)(desc)

print("\n--- Texto gerado ---")
print(texto)


# ── Teste 3: template SERVIÇO COM nota de produto ─────────────────────────────
secao("3. _montar_texto_servico — com nota de produto")
valor = 8000.00
prod  = 3500.00
imp2  = impostos_padrao(valor)
texto2 = CorpoNotaService._montar_texto_servico(
    nome_cond="Condomínio Jussara",
    mes_referencia="05/2026",
    descricao_servico="Substituição de bomba d'água",
    numero_os="OS nº 74220219 e OS nº 74350000",
    data_servico_texto="06.05.2026 e 07.05.2026",
    data_servico=None,
    valor_bruto=valor,
    impostos=imp2,
    data_vencimento=date(2026, 6, 15),
    observacoes=None,
    descricao_garantia="Motor: 3 meses / Bomba: 1 ano",
    valor_nota_produto=prod,
    numero_referencia="SRV-2026/0001",
)
liquido = imp2.valor_liquido
total_boleto = liquido + prod
total_notas  = valor + prod
checks2 = [
    ("Bloco Produto existe", "Nota de Produto" in texto2),
    ("Valor produto",        f"R$ 3.500,00" in texto2),
    ("Total das notas",      "Total das Notas" in texto2),
    ("Total boleto",         "Total do Boleto" in texto2),
    ("Valor total boleto correto", f"R$ {total_boleto:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") in texto2),
    ("Referência SRV",       "SRV-2026/0001" in texto2),
    ("Múltiplas OSs",        "OS nº 74220219 e OS nº 74350000" in texto2),
    ("Datas múltiplas",      "06.05.2026 e 07.05.2026" in texto2),
    ("Garantia composta",    "Motor: 3 meses / Bomba: 1 ano" in texto2),
]
for desc, cond in checks2:
    (ok if cond else falhou)(desc)

print("\n--- Texto gerado ---")
print(texto2)


# ── Teste 4: _cnpj_e_produto sem DB (função retorna False com db=None) ───────
secao("4. _cnpj_e_produto — sem DB (fallback seguro)")
from app.services.nota_fiscal_service import _cnpj_e_produto
r = _cnpj_e_produto(None, "12.345.678/0001-90")
if r is False:
    ok("db=None → retorna False (não bloqueia import)")
else:
    falhou("db=None deveria retornar False")


# ── Teste 5: schema Pydantic — validação dos novos campos ────────────────────
secao("5. Schema CorpoNotaCreate — novos campos")
from app.schemas.corpo_nota_schema import CorpoNotaCreate
payload = CorpoNotaCreate(
    condominio_id=1,
    tipo_nota="SERVICO",
    ano=2026,
    mes=5,
    numero_os="OS nº 74220219",
    valor_bruto=5000.0,
    data_vencimento=date(2026, 6, 10),
    configuracao_inter_id=2,
    orcamento_id=None,
    data_servico_texto="20.05.2026",
    descricao_garantia="06 meses",
    valor_nota_produto=3500.0,
)
checks3 = [
    ("tipo_nota SERVICO", payload.tipo_nota.value == "SERVICO"),
    ("configuracao_inter_id=2", payload.configuracao_inter_id == 2),
    ("data_servico_texto", payload.data_servico_texto == "20.05.2026"),
    ("descricao_garantia", payload.descricao_garantia == "06 meses"),
    ("valor_nota_produto=3500", payload.valor_nota_produto == 3500.0),
]
for desc, cond in checks3:
    (ok if cond else falhou)(desc)


# ── Teste 6: schema ConfiguracaoInterCreate com tipo_nota ────────────────────
secao("6. Schema ConfiguracaoInterCreate — tipo_nota")
from app.schemas.configuracao_schema import ConfiguracaoInterCreate
inter = ConfiguracaoInterCreate(
    cnpj="12.345.678/0001-90",
    client_id="abc",
    client_secret="xyz",
    conta_corrente="123456",
    cert_path="/app/auth/cert.crt",
    tipo_nota="PRODUTO",
)
if inter.tipo_nota == "PRODUTO":
    ok("tipo_nota='PRODUTO' aceito")
else:
    falhou("tipo_nota PRODUTO não aceito")

inter_default = ConfiguracaoInterCreate(
    cnpj="99.999.999/0001-99",
    client_id="a",
    client_secret="b",
    conta_corrente="1",
    cert_path="/c",
)
if inter_default.tipo_nota == "SERVICO":
    ok("tipo_nota default='SERVICO'")
else:
    falhou(f"default incorreto: {inter_default.tipo_nota}")


# ── Resultado final ───────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  Todos os testes concluídos.")
print("="*60 + "\n")
