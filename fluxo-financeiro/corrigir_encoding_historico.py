# -*- coding: utf-8 -*-
"""
Corrige texto com acento "double-encoded" (mojibake) gravado errado no banco
durante as migracoes historicas (Fase 6 / incremento funcionario / fornecedores).

Exemplo real:
    gravado:  'CartÃ£o de debito - (CafÃ© da manha)'   'MigraÃ§Ã£o histÃ³rica ... â€” ...'
    correto:  'Cartão de débito - (Café da manha)'     'Migração histórica ... — ...'

Causa: bytes UTF-8 corretos foram interpretados como Windows-1252 (cp1252) e
regravados. A reversao e' s.encode('cp1252').decode('utf-8'). So' aplica quando
a reversao (a) nao lanca excecao e (b) REDUZ a quantidade de caracteres suspeitos
-- assim strings ja corretas que contem 'Ã'/'Â' legitimo (ex: 'SÃO BENTO',
'Câmera', 'CONSTRUÇÃO') nunca sao tocadas.

Escopo (so estas tabelas/colunas):
    fin_movimentacoes.descricao, fin_movimentacoes.observacao
    despesas.descricao,          despesas.observacao
    condominios.nome  (SO onde tipo = 'FORNECEDOR')

REQUISITO DE CHARSET: SET NAMES utf8mb4 em toda sessao, charset=utf8mb4 em toda
conexao pymysql, primeira linha do .sql gerado. Sem isso o script reintroduz o bug.

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_encoding_historico.py
        (dry-run: so mostra ANTES/DEPOIS e contagem, nao altera nada)

    ... corrigir_encoding_historico.py --aplicar
        (aplica os UPDATE de verdade -- no ambiente escolhido)

    ... corrigir_encoding_historico.py --sql-only
        (nao aplica; gera fluxo-financeiro/correcao_encoding_<amb>_<timestamp>.sql)

    ... --ambiente producao   (default: local)
"""
import argparse
import io
import os
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import pymysql
import paramiko

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

PROD_HOST = "168.231.96.184"
PROD_SSH_KEY = os.path.expanduser("~/.ssh/id_ed25519")
DEST_DIR = os.path.dirname(os.path.abspath(__file__))

# (tabela, coluna, filtro_extra_sql)
ALVOS = [
    ("fin_movimentacoes", "descricao", None),
    ("fin_movimentacoes", "observacao", None),
    ("despesas", "descricao", None),
    ("despesas", "observacao", None),
    ("condominios", "nome", "tipo = 'FORNECEDOR'"),
]

# caracteres tipicos de mojibake pt-BR (cp1252/latin1 mal interpretado)
SUSPEITOS = "ÃÂâ€™“”‘–—œžŸ "


def escore_suspeito(s: str) -> int:
    return sum(s.count(ch) for ch in SUSPEITOS)


def reverter(texto: str):
    """Tenta reverter o mojibake. Devolve (texto_corrigido, mudou: bool).
    Nunca devolve algo que nao seja estritamente 'menos suspeito' que a entrada."""
    if not texto:
        return texto, False
    if not any(ch in texto for ch in "ÃÂâ€"):
        return texto, False

    atual = texto
    for _ in range(2):  # cobre double e (raro) triple encoding
        try:
            proximo = atual.encode("cp1252").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            break
        if escore_suspeito(proximo) >= escore_suspeito(atual):
            break
        atual = proximo

    return (atual, True) if atual != texto else (texto, False)


def conectar_local():
    return pymysql.connect(**LOCAL_DB)


class ProdConn:
    """Executa SELECT/UPDATE em producao via SSH -> docker exec mysql, sempre
    com 'SET NAMES utf8mb4;' na frente. SELECT devolve linhas (lista de tuplas)."""

    def __init__(self):
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(PROD_HOST, username="root", key_filename=PROD_SSH_KEY, timeout=15)

    def _run(self, sql: str, ler: bool):
        cmd = ("docker exec -i cmport_db sh -c "
               "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 "
               + ("-N --batch" if ler else "") + "'")
        stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=120)
        stdin.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        if rc != 0:
            raise RuntimeError(f"mysql producao rc={rc}: {err}")
        return out

    def select_id_col(self, tabela, coluna, filtro):
        where = f"{coluna} IS NOT NULL AND {coluna} <> ''"
        if filtro:
            where += f" AND {filtro}"
        # separador improvavel no texto pra parsear id<TAB>valor com valor podendo ter \t? nao tem.
        out = self._run(f"SELECT id, {coluna} FROM {tabela} WHERE {where};", ler=True)
        linhas = []
        for ln in out.split("\n"):
            if not ln:
                continue
            partes = ln.split("\t", 1)
            if len(partes) != 2:
                continue
            linhas.append((int(partes[0]), partes[1].replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\")))
        return linhas

    def update(self, tabela, coluna, id_, valor):
        v = valor.replace("\\", "\\\\").replace("'", "\\'")
        self._run(f"UPDATE {tabela} SET {coluna} = '{v}' WHERE id = {id_};", ler=False)

    def close(self):
        self.ssh.close()


def esc_sql(v: str) -> str:
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    grp = ap.add_mutually_exclusive_group()
    grp.add_argument("--aplicar", action="store_true", help="executa os UPDATE de verdade")
    grp.add_argument("--sql-only", action="store_true", help="so gera o arquivo .sql, nao aplica")
    args = ap.parse_args()

    print(f"Ambiente: {args.ambiente}  |  modo: "
          f"{'APLICAR' if args.aplicar else ('SQL-ONLY' if args.sql_only else 'dry-run')}\n")

    if args.ambiente == "local":
        conn = conectar_local()
        cur = conn.cursor()
        cur.execute("SET NAMES utf8mb4;")

        def buscar(t, c, f):
            where = f"{c} IS NOT NULL AND {c} <> ''" + (f" AND {f}" if f else "")
            cur.execute(f"SELECT id, {c} FROM {t} WHERE {where}")
            return cur.fetchall()

        def aplicar_update(t, c, i, v):
            cur.execute(f"UPDATE {t} SET {c} = %s WHERE id = %s", (v, i))
    else:
        pc = ProdConn()
        buscar = lambda t, c, f: pc.select_id_col(t, c, f)
        aplicar_update = lambda t, c, i, v: pc.update(t, c, i, v)

    linhas_sql = ["SET NAMES utf8mb4;", "USE cmport_gerenciamento;", ""]
    total_corrigir = 0
    total_flag_ok = 0
    resumo = []

    for tabela, coluna, filtro in ALVOS:
        rows = buscar(tabela, coluna, filtro)
        corrigir, flag_ok, mostrados = [], 0, 0
        for id_, valor in rows:
            if valor is None:
                continue
            novo, mudou = reverter(valor)
            if mudou:
                corrigir.append((id_, valor, novo))
            elif any(ch in valor for ch in "Ã Â â".split()):  # tinha pinta de mojibake mas nao mexeu
                flag_ok += 1

        resumo.append((f"{tabela}.{coluna}", len(rows), len(corrigir), flag_ok))
        total_corrigir += len(corrigir)
        total_flag_ok += flag_ok

        if corrigir:
            print(f"### {tabela}.{coluna}  —  {len(corrigir)} a corrigir")
            for id_, antes, depois in corrigir:
                if mostrados < 30:
                    print(f"  id={id_}\n    ANTES : {antes[:90]}\n    DEPOIS: {depois[:90]}")
                    mostrados += 1
                linhas_sql.append(f"UPDATE {tabela} SET {coluna} = {esc_sql(depois)} WHERE id = {id_};")
                if args.aplicar:
                    aplicar_update(tabela, coluna, id_, depois)
            if mostrados >= 30 and len(corrigir) > 30:
                print(f"  ... (+{len(corrigir) - 30} nao listados)")
            print()

    print("=" * 60)
    print(f"{'tabela.coluna':32}{'linhas':>9}{'corrigir':>10}{'flag/ok':>9}")
    for nome, n, c, f in resumo:
        print(f"{nome:32}{n:>9}{c:>10}{f:>9}")
    print("-" * 60)
    print(f"{'TOTAL':32}{'':>9}{total_corrigir:>10}{total_flag_ok:>9}")
    print("\nflag/ok = tinha caractere suspeito mas a reversao nao melhorou "
          "(ja estava correto, ex: 'SÃO BENTO') — nao foi tocado.")

    if args.aplicar:
        if args.ambiente == "local":
            conn.commit()
        print(f"\n✅ {total_corrigir} UPDATE aplicados em {args.ambiente}.")
    elif args.sql_only:
        nome = f"correcao_encoding_{args.ambiente}_{datetime.now():%Y%m%d_%H%M}.sql"
        caminho = os.path.join(DEST_DIR, nome)
        with open(caminho, "w", encoding="utf-8") as fh:
            fh.write("\n".join(linhas_sql) + "\n")
        print(f"\n📄 SQL gerado: fluxo-financeiro/{nome}  ({total_corrigir} UPDATE)")
    else:
        print("\n(dry-run — nada foi alterado. Use --aplicar ou --sql-only.)")

    if args.ambiente == "local":
        conn.close()
    else:
        pc.close()


if __name__ == "__main__":
    main()
