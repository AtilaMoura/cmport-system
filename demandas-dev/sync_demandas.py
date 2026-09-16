# -*- coding: utf-8 -*-
"""
sync_demandas.py — puxa as demandas/notas do canal (Demandas Dev) da PRODUCAO
pra essa pasta local, sempre em modo leitura (nunca escreve nada no sistema).

Por que existe: antes disso, pra saber "tem demanda nova?" ou "essa ja tem
atualizacao?" era preciso entrar no sistema toda vez. Esse script mantem um
espelho local (itens/<codigo>.md + anexos/<codigo>/) e dois indices:
  - INDEX.md      -> so o que esta ATIVO (nao resolvida/descartada), reescrito
                     do zero a cada sync
  - RESOLVIDAS.md -> historico do que ja foi resolvido/descartado, so cresce

Cada itens/<codigo>.md tem uma secao fixa "## Nossa analise" no final que o
script NUNCA sobrescreve — e o espaco livre pra anotar causa raiz, decisao,
link de commit etc.

Uso:
    python sync_demandas.py              # sincroniza tudo que mudou
    python sync_demandas.py D-26         # so esse item (mesmo sem mudanca)
    python sync_demandas.py --forcar     # rebaixa tudo de novo (ignora o
                                          # .state.json — usar se o FORMATO do
                                          # .md mudou, nao pra uso normal)

Credenciais: variaveis de ambiente CMPORT_EMAIL / CMPORT_SENHA (nao hardcoda
no script — ver README.md).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
ITENS_DIR = BASE_DIR / "itens"
ANEXOS_DIR = BASE_DIR / "anexos"
INDEX_PATH = BASE_DIR / "INDEX.md"
RESOLVIDAS_PATH = BASE_DIR / "RESOLVIDAS.md"
STATE_PATH = BASE_DIR / ".state.json"

BASE_URL = "http://168.231.96.184/api/v1"

STATUS_RESOLVIDOS = {"RESOLVIDA", "DESCARTADA"}
MARCADOR_ANALISE = "## Nossa análise"

AUTOR_LABEL = {"ATILA": "Atila", "ALMIRA": "Almira", "FABIANA": "Fabiana"}


# ── Autenticação / HTTP ───────────────────────────────────────────────────────

def login() -> str:
    email = os.environ.get("CMPORT_EMAIL")
    senha = os.environ.get("CMPORT_SENHA")
    if not email or not senha:
        sys.exit(
            "Faltam as variaveis de ambiente CMPORT_EMAIL e CMPORT_SENHA.\n"
            "Ver demandas-dev/README.md pra como configurar."
        )
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "senha": senha}, timeout=20)
    resp.raise_for_status()
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def listar_itens(token: str) -> list:
    resp = requests.get(
        f"{BASE_URL}/canal",
        params={"incluir_arquivados": "false", "incluir_encerrados": "true"},
        headers=_headers(token),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["itens"]


def obter_item(token: str, item_id: int) -> dict:
    resp = requests.get(f"{BASE_URL}/canal/{item_id}", headers=_headers(token), timeout=30)
    resp.raise_for_status()
    return resp.json()


def baixar_anexo(token: str, anexo_id: int, destino: Path) -> None:
    if destino.exists():
        return
    resp = requests.get(f"{BASE_URL}/canal/anexos/{anexo_id}", headers=_headers(token), timeout=60)
    resp.raise_for_status()
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(resp.content)


# ── Estado local (.state.json) ────────────────────────────────────────────────

def carregar_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def salvar_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


# ── Markdown de um item ────────────────────────────────────────────────────────

def _fmt_data(iso: str) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return iso


def _nome_anexo_local(anexo: dict) -> str:
    return f"{anexo['id']}_{anexo['nome_arquivo']}"


def _extrair_analise_existente(path: Path) -> str:
    if not path.exists():
        return f"{MARCADOR_ANALISE} (Claude/Atila — nunca sobrescrito pelo sync)\n\n_(ainda sem anotação)_\n"
    texto = path.read_text(encoding="utf-8")
    idx = texto.find(MARCADOR_ANALISE)
    if idx == -1:
        return f"{MARCADOR_ANALISE} (Claude/Atila — nunca sobrescrito pelo sync)\n\n_(ainda sem anotação)_\n"
    return texto[idx:]


def _montar_markdown(item: dict, anexos_baixados: dict) -> str:
    codigo = item.get("codigo") or f"item-{item['id']}"
    titulo = item.get("titulo") or "(sem título)"
    linhas = [f"# {codigo} — {titulo}", ""]
    linhas.append(f"- Tipo: {item['tipo']}")
    linhas.append(f"- Status: {item['status']}")
    linhas.append(f"- Prioridade: {item['prioridade']}")
    linhas.append(f"- Autor: {AUTOR_LABEL.get(item['autor'], item['autor'])}")
    linhas.append(f"- Aberta em: {_fmt_data(item.get('data_abertura'))}")
    linhas.append(f"- Última atividade: {_fmt_data(item.get('atualizado_em') or item.get('data_abertura'))}")
    if item.get("data_resolucao"):
        linhas.append(f"- Resolvida/descartada em: {_fmt_data(item['data_resolucao'])}")
    if item.get("resolucao_texto"):
        linhas.append(f"- Resolução: {item['resolucao_texto']}")
    if item.get("commit_ref"):
        linhas.append(f"- Commit: {item['commit_ref']}")
    if item.get("motivo_descarte"):
        linhas.append(f"- Motivo do descarte: {item['motivo_descarte']}")
    linhas.append("")

    linhas.append("## Descrição")
    linhas.append(item.get("descricao") or "_(sem descrição)_")
    linhas.append("")

    linhas.append("## Anexos")
    if item.get("anexos"):
        for anexo in item["anexos"]:
            nome_local = anexos_baixados.get(anexo["id"], _nome_anexo_local(anexo))
            linhas.append(f"- [{anexo['nome_arquivo']}](../anexos/{codigo}/{nome_local})")
    else:
        linhas.append("_(nenhum)_")
    linhas.append("")

    linhas.append("## Comentários")
    if item.get("comentarios"):
        for c in item["comentarios"]:
            autor = AUTOR_LABEL.get(c["autor"], c["autor"])
            quando = _fmt_data(c.get("criado_em"))
            texto = c.get("texto") or ""
            reacao = f" {c['reacao']}" if c.get("reacao") else ""
            linhas.append(f"- **{autor}** ({quando}){reacao}: {texto}")
            for anexo in c.get("anexos") or []:
                nome_local = anexos_baixados.get(anexo["id"], _nome_anexo_local(anexo))
                linhas.append(f"  - anexo: [{anexo['nome_arquivo']}](../anexos/{codigo}/{nome_local})")
    else:
        linhas.append("_(nenhum ainda)_")
    linhas.append("")

    for form in item.get("formularios") or []:
        linhas.append(f"## Formulário — {form['titulo']} ({form['status']})")
        if form.get("contexto"):
            linhas.append(form["contexto"])
        for p in form.get("perguntas") or []:
            resposta = (form.get("respostas") or {}).get(p.get("id"), "—")
            linhas.append(f"- **{p.get('enunciado')}**: {resposta}")
        linhas.append("")

    linhas.append("---")
    linhas.append("")

    corpo = "\n".join(linhas)
    analise = _extrair_analise_existente(ITENS_DIR / f"{codigo}.md")
    return corpo + analise


# ── RESOLVIDAS.md ──────────────────────────────────────────────────────────────

def _garantir_arquivos_base() -> None:
    if not RESOLVIDAS_PATH.exists():
        RESOLVIDAS_PATH.write_text(
            "# Demandas resolvidas / descartadas\n\n"
            "Histórico — cada bloco é escrito uma vez pelo `sync_demandas.py` quando o item "
            "sai do estado ativo. Nunca é reescrito automaticamente; edite à vontade.\n\n---\n\n",
            encoding="utf-8",
        )


def _registrar_resolvida(item: dict) -> None:
    codigo = item.get("codigo") or f"item-{item['id']}"
    titulo = item.get("titulo") or "(sem título)"
    bloco = [
        f"## {codigo} — {titulo} ({item['status']})",
        f"- Autor: {AUTOR_LABEL.get(item['autor'], item['autor'])}",
        f"- Aberta em: {_fmt_data(item.get('data_abertura'))} · Encerrada em: {_fmt_data(item.get('data_resolucao'))}",
    ]
    if item.get("resolucao_texto"):
        bloco.append(f"- Resolução: {item['resolucao_texto']}")
    if item.get("commit_ref"):
        bloco.append(f"- Commit: {item['commit_ref']}")
    if item.get("motivo_descarte"):
        bloco.append(f"- Motivo do descarte: {item['motivo_descarte']}")
    bloco.append(f"- Detalhe completo: `itens/{codigo}.md`")
    bloco.append("")
    bloco.append("---")
    bloco.append("")
    with RESOLVIDAS_PATH.open("a", encoding="utf-8") as f:
        f.write("\n".join(bloco) + "\n")


# ── INDEX.md ────────────────────────────────────────────────────────────────────

def _reescrever_index(itens_ativos: list) -> None:
    ordem_prioridade = {"URGENTE": 0, "ALTA": 1, "NORMAL": 2, "BAIXA": 3}
    itens_ativos = sorted(
        itens_ativos,
        key=lambda i: (ordem_prioridade.get(i["prioridade"], 9), i.get("data_abertura") or ""),
    )
    agora = datetime.now(timezone.utc)
    linhas = [
        "# Demandas ativas",
        "",
        f"_Gerado automaticamente por `sync_demandas.py` — última sincronização: {agora.strftime('%Y-%m-%d %H:%M UTC')}._",
        "",
        "| Código | Tipo | Título | Status | Prioridade | Autor | Última atividade | Parada há |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in itens_ativos:
        codigo = item.get("codigo") or f"item-{item['id']}"
        ultima = item.get("atualizado_em") or item.get("data_abertura")
        dias = "—"
        if ultima:
            try:
                dt = datetime.fromisoformat(ultima.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                d = (agora - dt).days
                dias = f"🔴 {d}d" if d >= 5 else f"{d}d"
            except ValueError:
                pass
        linhas.append(
            f"| [{codigo}](itens/{codigo}.md) | {item['tipo']} | {item.get('titulo') or '—'} "
            f"| {item['status']} | {item['prioridade']} | {AUTOR_LABEL.get(item['autor'], item['autor'])} "
            f"| {_fmt_data(ultima)} | {dias} |"
        )
    linhas.append("")
    INDEX_PATH.write_text("\n".join(linhas), encoding="utf-8")


# ── Núcleo do sync ──────────────────────────────────────────────────────────────

def _processar_item(token: str, item_resumo: dict, state: dict) -> dict:
    """Busca o detalhe, baixa anexos novos, escreve o .md. Retorna o item completo."""
    codigo = item_resumo.get("codigo") or f"item-{item_resumo['id']}"
    item = obter_item(token, item_resumo["id"])

    anexos_dir = ANEXOS_DIR / codigo
    anexos_baixados = {}
    todos_anexos = list(item.get("anexos") or [])
    for c in item.get("comentarios") or []:
        todos_anexos.extend(c.get("anexos") or [])
    for anexo in todos_anexos:
        nome_local = _nome_anexo_local(anexo)
        baixar_anexo(token, anexo["id"], anexos_dir / nome_local)
        anexos_baixados[anexo["id"]] = nome_local

    ITENS_DIR.mkdir(parents=True, exist_ok=True)
    markdown = _montar_markdown(item, anexos_baixados)
    (ITENS_DIR / f"{codigo}.md").write_text(markdown, encoding="utf-8")

    return item


def sync(alvo_codigo: str = None, forcar: bool = False) -> None:
    _garantir_arquivos_base()
    token = login()
    todos = listar_itens(token)

    if alvo_codigo:
        todos = [i for i in todos if (i.get("codigo") or f"item-{i['id']}") == alvo_codigo]
        if not todos:
            sys.exit(f"Item {alvo_codigo} não encontrado na produção.")

    state = {} if forcar else carregar_state()

    novas, atualizadas, resolvidas_agora, sem_mudanca = [], [], [], []
    itens_ativos_final = []

    for resumo in todos:
        codigo = resumo.get("codigo") or f"item-{resumo['id']}"
        ultima = resumo.get("atualizado_em") or resumo.get("data_abertura")
        anterior = state.get(codigo)

        mudou = anterior is None or anterior.get("ultima_atividade") != ultima
        if not mudou:
            sem_mudanca.append(codigo)
            item_completo = None
        else:
            item_completo = _processar_item(token, resumo, state)
            if anterior is None:
                novas.append(codigo)
            else:
                atualizadas.append(codigo)

        status = resumo["status"]
        ja_registrada_resolvida = anterior and anterior.get("resolvido_registrado")
        if status in STATUS_RESOLVIDOS and not ja_registrada_resolvida:
            if item_completo is None:
                item_completo = obter_item(token, resumo["id"])
            _registrar_resolvida(item_completo)
            resolvidas_agora.append(codigo)

        state[codigo] = {
            "id": resumo["id"],
            "ultima_atividade": ultima,
            "status": status,
            "resolvido_registrado": status in STATUS_RESOLVIDOS,
        }

        if status not in STATUS_RESOLVIDOS and not resumo.get("arquivado"):
            itens_ativos_final.append(resumo)

    if not alvo_codigo:
        _reescrever_index(itens_ativos_final)

    salvar_state(state)

    print(f"{len(novas)} novas: {', '.join(novas) or '—'}")
    print(f"{len(atualizadas)} atualizada(s): {', '.join(atualizadas) or '—'}")
    print(f"{len(resolvidas_agora)} resolvida(s)/descartada(s) agora: {', '.join(resolvidas_agora) or '—'}")
    print(f"{len(sem_mudanca)} sem mudança")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sincroniza demandas/notas do canal (produção → local, só leitura).")
    parser.add_argument("codigo", nargs="?", default=None, help="Sincroniza só esse item (ex: D-26)")
    parser.add_argument("--forcar", action="store_true", help="Ignora o .state.json e reprocessa tudo")
    args = parser.parse_args()
    sync(alvo_codigo=args.codigo, forcar=args.forcar)
