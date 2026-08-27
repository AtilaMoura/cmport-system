"""Categoriza cada descricao unica de despesa de escritorio em uma categoria,
separando em destaque tudo que e' 'saida de funcionario' (folha, adiantamento,
vale, ferias, rescisao, PRL, beneficios, encargos) do restante. Gera um MD
pra revisao manual do usuario."""
import json
import re
import unicodedata
from collections import defaultdict

def normaliza(desc):
    s = desc.strip()
    s = re.sub(r'\s*-?\s*\d{1,2}\s*(/|e)\s*\d{1,2}\s*\$', '', s)
    s = re.sub(r'\s*-?\s*\d{1,2}\s*(/|e)\s*\d{1,2}\s*$', '', s)
    s = re.sub(r'\d+[ªº]\s*(e\s*\d+[ªº]\s*)?parcela\s*-?\s*', '', s, flags=re.IGNORECASE)
    s = re.sub(r'\s{2,}', ' ', s).strip()
    return s


def sem_acento(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')

# Nomes de funcionarios conhecidos (extraidos das descricoes) — usado pra
# detectar linhas de funcionario mesmo quando o padrao nao e' obvio.
NOMES_FUNCIONARIOS = [
    "André Moreira Rosa", "Fabiana Pedretti Moreira Rosa", "Fabiana Pedretti",
    "Luis Antonio Melgarejo Neves", "Welligton Lucas Menezes Rodrigues",
    "Pedro Henrique da Silva", "Pedro Henrique", "Gabriel Moreira Pedretti",
    "Gabriel", "Almira Moreira Rosa Salomao", "Almira Moreira Rosa Salomão",
    "Almira Salomão",
]

# Regras aplicadas sobre a descricao SEM ACENTO (sem_acento(desc_norm)) —
# escrever os padroes sempre sem acento tambem.
REGRAS_FUNCIONARIO = [
    ("Salário (folha mensal)", re.compile(r'^Salario\s', re.I)),
    ("Empréstimo de salário", re.compile(r'Emprestimo.*Salario', re.I)),
    ("Adiantamento de salário", re.compile(r'^Adiantamento(\s+de\s+Salario)?\s', re.I)),
    ("Adiantamento de salário", re.compile(r'Adiantamento\s+Salario', re.I)),
    ("Férias", re.compile(r'^Ferias\s', re.I)),
    ("Rescisão", re.compile(r'^Rescisao\s', re.I)),
    ("PRL (participação resultado)", re.compile(r'^PRL\s', re.I)),
    ("Vale transporte/refeição/alimentação", re.compile(r'Vale\s+(Transporte|Refeicao|Alimentacao)', re.I)),
    ("Vale transporte/refeição/alimentação", re.compile(r'\(Vale\s+(transporte|refeicao|alimentacao)', re.I)),
    ("Encargos trabalhistas (FGTS/GPS/Sindicato)", re.compile(r'^(FGTS|GPS)\b', re.I)),
    ("Encargos trabalhistas (FGTS/GPS/Sindicato)", re.compile(r'^Sindicato', re.I)),
    ("Benefício — convênio médico/odontológico", re.compile(r'Convenio\s+(Medico|Odontologico)', re.I)),
    ("Benefício — convênio médico/odontológico", re.compile(r'^(Amil|SanMedi|Bem Mais Familiar|Berazil Medicina|Brasil Medicina)\b', re.I)),
    ("Café/lanche/confraternização para funcionários", re.compile(r'funcionarios?\)?$', re.I)),
    ("Café/lanche/confraternização para funcionários", re.compile(r'Cafe da (manha|tarde)', re.I)),
    ("Uniforme/EPI funcionários", re.compile(r'Uniformes', re.I)),
    ("Uniforme/EPI funcionários", re.compile(r'Material de Seguranca', re.I)),
    ("Passagem/reembolso pessoal a funcionário nomeado", re.compile(
        r'(Pedro Henrique|Luis Antonio|Gabriel Moreira Pedretti|Welligton Lucas|Almira (Moreira Rosa )?Salom[ao]?o?|Fabiana Pedretti|Andre Moreira Rosa)'
        r'.*(Passagem|Reembolso|aniversario|Bolo|presente|Limpeza Escritorio|Comisao|Cafe)',
        re.I)),
    ("Passagem/reembolso pessoal a funcionário nomeado", re.compile(
        r'(Passagem|Reembolso|aniversario|Bolo|presente|Comisao)'
        r'.*(Pedro Henrique|Pedro|Luis Antonio|Gabriel|Welligton Lucas|Almira|Fabiana|Andre)',
        re.I)),
]

CATEGORIAS_MOVIMENTACAO = [
    ("Transferência entre contas próprias (movimentação, não despesa)", re.compile(r'^(Pix|Transf\.)\s*(Inter|Itau|Bradesco).*(para|Para)\s*(Inter|Itau|Bradesco|BTG)', re.I)),
]

# Descricoes que bateriam em REGRAS_FUNCIONARIO mas foram revisadas manualmente
# (checklist de validacao, 25/08) e reclassificadas como despesa GERAL — mantem
# a subcategoria original, so muda o grupo. Chave = mesma subcategoria que
# REGRAS_FUNCIONARIO daria; valor = descricoes exatas (pos normaliza()).
OVERRIDES_PARA_GERAL = {
    "Adiantamento de salário": {
        "Adiantamento Fabiana Pedretti Moreira Rosa (Transferencia CARRO)",
        "Adiantamento Fabiana Pedretti Moreira Rosa (Conserto Maquina)",
        "Pix André (Adiantamento Salário)",
    },
    "Encargos trabalhistas (FGTS/GPS/Sindicato)": {
        "GPS - Acordo",
        "FGTS - Acordo 2025023010",
    },
    "Benefício — convênio médico/odontológico": {
        "Convenio Medico",
        "Convenio Medico - (Mês de Dezembro)",
        "Convenio Medico - Mês",
        "Amil",
        "Amil Plano Odontologico",
    },
    "Empréstimo de salário": {
        "Emprestimo de Salario Fabiana Pedretti Moreira Rosa (Referente ao Mês Abril)",
    },
    "Café/lanche/confraternização para funcionários": {
        "Cartão de debito - (Café da manha funcionarios)",
        "Pix Acessorios Industriais (Material de Segurança dos funcionarios)",
        "Pix Cacau Show (Chocolate para Funcionários)",
        "Pix Maria Lima(Gracha Funcionarios)",
        "Cartão de debito - (Café da tarde funcionarios)",
        "Pix Almira Salomão (Café da manha funcionários)",
        "Pix Almira Salomão (Pagar café da manhã)",
    },
    "Passagem/reembolso pessoal a funcionário nomeado": {
        "Pix Almira Moreira Rosa Salomão (Limpeza Escritorio)",
        "Pix Sabor do Bolo 9Bolo aniversario do Pedro)",
    },
    "Uniforme/EPI funcionários": {
        "Pix Kontes Express (Uniformes do Tecnicos)",
    },
}

CATEGORIAS_GERAIS = [
    ("Aluguel", re.compile(r'^Aluguel', re.I)),
    ("Tarifa bancária", re.compile(r'^Banco Tarifa', re.I)),
    ("Cartão de crédito corporativo (fatura)", re.compile(r'^Cartao (Clebinho|Jusmarina|Armarinhos Fernan?des)', re.I)),
    ("Contas fixas (água/luz/telefone/internet)", re.compile(r'^(Conta de (Luz|Agua|INTERNET)|Vivo (Movel|Fixo))', re.I)),
    ("Serviços de TI/sistemas/site", re.compile(r'(Auvo Sistema|Quero Faturar|Engecomerce|Demerg|Lattine|CertWeb|Astral Cloud|PIX Site|Dominio COM|^JLA|Pix JLA)', re.I)),
    ("Serviços de TI/sistemas/site", re.compile(r'^Pix Atila \(Sistemas', re.I)),
    ("Serviços de TI/sistemas/site", re.compile(r'^Atila \(Sistemas', re.I)),
    ("Contabilidade", re.compile(r'Quisi Contabilidade', re.I)),
    ("Impostos/tributos da empresa", re.compile(r'^(Imposto|DAS -|COFINS|PIS ref|DARF|DARE|TFE|Receita Federal)', re.I)),
    ("Acordos/dívidas/jurídico", re.compile(r'(Acordo|Advogado|Operacao Capital Giro)', re.I)),
    ("Veículo — combustível", re.compile(r'(Posto de Gasolina|Abastecimento|Gasolina)', re.I)),
    ("Veículo — IPVA/licenciamento/multa", re.compile(r'(IPVA|Licenciamento|Lincenciamento|Multa (Carro|Moto|Fieste|carro))', re.I)),
    ("Veículo — seguro", re.compile(r'^Seguro (carro|moto|Carro|Moto)', re.I)),
    ("Veículo — manutenção/oficina/acidente", re.compile(r'(Centro Automotivo|Troca de Oleo|Conserto (do )?Carro|Conserto Vidro|Guincho|Elionardo|AngeLucia|\bMarinho\b|Batida)', re.I)),
    ("Veículo — pedágio/zona azul", re.compile(r'(Sem Parar|Zona Azul)', re.I)),
    ("Veículo — garagem", re.compile(r'Garagem', re.I)),
    ("Estacionamento em condomínio (operacional)", re.compile(r'Estacionamento', re.I)),
    ("Transporte urbano (Uber)", re.compile(r'\bUber\b', re.I)),
    ("Repasse a zelador/síndico de condomínio cliente", re.compile(r'(zelador|sindico|Caixinha)', re.I)),
    ("Material de escritório/informática", re.compile(
        r'(Mercado Livre|Marcado Livre|Casas Bahia|Kalunga|Shoop|SHPP Brasil|Imprimi Tech|Joel \(Conserto Microondas\)|Nakajo|Etiquetadora|Impressora|Correios|Envelope|Magalupay|Marketplace|Tinta\)|Serve Qulity Tintas)',
        re.I)),
    ("Material para condomínio (repassado)", re.compile(r'Material (Condominio|Angra|para angra|Cullinan)|Parafuso para|SOS Materiais', re.I)),
]


def classifica(desc_norm):
    alvo = sem_acento(desc_norm)
    # Movimentacao entre contas proprias tem prioridade: mesmo que a descricao
    # cite "funcionarios" no destino, o Pix em si e' so' transferencia interna,
    # so' vira despesa quando sair de fato pra fora da empresa.
    for nome_cat, rx in CATEGORIAS_MOVIMENTACAO:
        if rx.search(alvo):
            return "MOVIMENTACAO", nome_cat
    for subcat, descs in OVERRIDES_PARA_GERAL.items():
        if desc_norm in descs:
            return "GERAL", subcat
    for nome_cat, rx in REGRAS_FUNCIONARIO:
        if rx.search(alvo):
            return "FUNCIONARIO", nome_cat
    for nome_cat, rx in CATEGORIAS_GERAIS:
        if rx.search(alvo):
            return "GERAL", nome_cat
    return "GERAL", "Não classificado (revisar)"


def exporta_json(nome_arquivo, transacoes):
    """Exporta lista de transacoes classificadas + resumo por subcategoria."""
    por_subcat = defaultdict(lambda: {"count": 0, "total": 0.0})
    for t in transacoes:
        s = por_subcat[t["subcategoria"]]
        s["count"] += 1
        s["total"] += float(t["pagos"] or 0)

    resumo = [
        {"subcategoria": k, "quantidade_lancamentos": v["count"], "total": round(v["total"], 2)}
        for k, v in sorted(por_subcat.items(), key=lambda x: x[1]["total"])
    ]

    saida = {
        "total_lancamentos": len(transacoes),
        "total_valor": round(sum(float(t["pagos"] or 0) for t in transacoes), 2),
        "resumo_por_subcategoria": resumo,
        "transacoes": transacoes,
    }
    with open(f"fluxo-financeiro/{nome_arquivo}", "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)
    print(f"{nome_arquivo}: {len(transacoes)} lancamentos | R$ {saida['total_valor']:,.2f}")


def main():
    data = json.load(open("fluxo-financeiro/despesas_brutas.json", encoding="utf-8"))
    grupos = defaultdict(lambda: {"count": 0, "total": 0.0, "cnpjs": set()})
    for d in data:
        n = normaliza(d["descricao"])
        g = grupos[n]
        g["count"] += 1
        g["total"] += float(d["pagos"] or 0)
        g["cnpjs"].add(d["cnpj"])

    funcionario = defaultdict(list)
    geral = defaultdict(list)
    movimentacao = defaultdict(list)

    desc_para_categoria = {}
    for desc, g in grupos.items():
        grupo, subcat = classifica(desc)
        item = (desc, g["count"], g["total"], "/".join(sorted(g["cnpjs"])))
        desc_para_categoria[desc] = (grupo, subcat)
        if grupo == "FUNCIONARIO":
            funcionario[subcat].append(item)
        elif grupo == "MOVIMENTACAO":
            movimentacao[subcat].append(item)
        else:
            geral[subcat].append(item)

    # transacoes cruas (uma linha = um lancamento da planilha) com a
    # classificacao aplicada, pra exportar em JSONs separados por grupo
    trans_funcionario, trans_geral, trans_movimentacao = [], [], []
    for d in data:
        n = normaliza(d["descricao"])
        grupo, subcat = desc_para_categoria[n]
        item = {
            "cnpj": d["cnpj"],
            "descricao": d["descricao"],
            "descricao_normalizada": n,
            "subcategoria": subcat,
            "nf": d["nf"],
            "parcela": d["parcela"],
            "pagto": d["pagto"],
            "vencto": d["vencto"],
            "pagos": d["pagos"],
            "valor": d["valor"],
            "linha_planilha": d["linha_planilha"],
        }
        if grupo == "FUNCIONARIO":
            trans_funcionario.append(item)
        elif grupo == "MOVIMENTACAO":
            trans_movimentacao.append(item)
        else:
            trans_geral.append(item)

    exporta_json("despesas_funcionario.json", trans_funcionario)
    exporta_json("despesas_geral.json", trans_geral)
    exporta_json("despesas_movimentacao.json", trans_movimentacao)

    linhas = []
    linhas.append("# Categorização de Despesas Escritório\n")
    linhas.append("Cada linha = uma descrição única (já sem o sufixo de parcela/mês). Confira se a categoria bateu certo.\n")

    total_func = sum(sum(v for _, _, v, _ in itens) for itens in funcionario.values())
    total_geral = sum(sum(v for _, _, v, _ in itens) for itens in geral.values())
    total_mov = sum(sum(v for _, _, v, _ in itens) for itens in movimentacao.values())
    total_despesa_real = total_func + total_geral
    linhas.append(f"**Total DESPESA real (funcionário + geral, exclui movimentação): R$ {total_despesa_real:,.2f}**")
    linhas.append(f"- Total em itens de FUNCIONÁRIO: R$ {total_func:,.2f}")
    linhas.append(f"- Total em itens GERAIS (não-funcionário): R$ {total_geral:,.2f}")
    linhas.append(f"\n**Total MOVIMENTAÇÃO (transferência entre contas próprias, NÃO é despesa, fica fora do total acima): R$ {total_mov:,.2f}**\n")

    linhas.append("---\n## 🔄 MOVIMENTAÇÃO (não é despesa — dinheiro migrando entre contas da própria empresa)\n")
    for subcat in sorted(movimentacao.keys(), key=lambda s: -sum(v for _, _, v, _ in movimentacao[s])):
        itens = sorted(movimentacao[subcat], key=lambda x: -abs(x[2]))
        subtotal = sum(v for _, _, v, _ in itens)
        linhas.append(f"\n### {subcat} — {len(itens)} descrições únicas — R$ {subtotal:,.2f}")
        for desc, count, total, cnpjs in itens:
            linhas.append(f"- [{cnpjs}] {count}x | R$ {total:,.2f} | {desc}")

    linhas.append("\n---\n## 🧑‍💼 SAÍDA DE FUNCIONÁRIO (categoria nova separada)\n")
    for subcat in sorted(funcionario.keys(), key=lambda s: -sum(v for _, _, v, _ in funcionario[s])):
        itens = sorted(funcionario[subcat], key=lambda x: -abs(x[2]))
        subtotal = sum(v for _, _, v, _ in itens)
        linhas.append(f"\n### {subcat} — {len(itens)} descrições únicas — R$ {subtotal:,.2f}")
        for desc, count, total, cnpjs in itens:
            linhas.append(f"- [{cnpjs}] {count}x | R$ {total:,.2f} | {desc}")

    linhas.append("\n---\n## 🏢 DEMAIS CATEGORIAS (não-funcionário)\n")
    for subcat in sorted(geral.keys(), key=lambda s: -sum(v for _, _, v, _ in geral[s])):
        itens = sorted(geral[subcat], key=lambda x: -abs(x[2]))
        subtotal = sum(v for _, _, v, _ in itens)
        linhas.append(f"\n### {subcat} — {len(itens)} descrições únicas — R$ {subtotal:,.2f}")
        for desc, count, total, cnpjs in itens:
            linhas.append(f"- [{cnpjs}] {count}x | R$ {total:,.2f} | {desc}")

    with open("fluxo-financeiro/CATEGORIZACAO_DESPESAS.md", "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print("gerado: fluxo-financeiro/CATEGORIZACAO_DESPESAS.md")
    print(f"funcionario: {sum(len(v) for v in funcionario.values())} descricoes | R$ {total_func:,.2f}")
    print(f"geral: {sum(len(v) for v in geral.values())} descricoes | R$ {total_geral:,.2f}")
    print(f"movimentacao (nao despesa): {sum(len(v) for v in movimentacao.values())} descricoes | R$ {total_mov:,.2f}")
    print(f"TOTAL DESPESA REAL: R$ {total_despesa_real:,.2f}")
    naoclass = geral.get("Não classificado (revisar)", [])
    print(f"nao classificado: {len(naoclass)}")


if __name__ == "__main__":
    main()
