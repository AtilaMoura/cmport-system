# TAREFA: script de correção de encoding (mojibake) no histórico financeiro

## Objetivo
Escrever UM script Python: `fluxo-financeiro/corrigir_encoding_historico.py`.
Ele detecta e conserta texto com acento "double-encoded" (mojibake) que foi gravado
errado no banco durante migrações antigas, e gera os comandos UPDATE pra consertar.

Exemplo do problema (dado REAL do banco):
- Gravado errado:  `CartÃ£o de debito - (CafÃ© da manha funcionarios)`
- Deveria ser:     `Cartão de débito - (Café da manhã funcionários)`

A causa: bytes UTF-8 corretos foram lidos como Latin-1 e regravados. A reversão
padrão é: `texto.encode('latin-1').decode('utf-8')`.

## Escopo — quais tabelas/colunas
Só estas (banco MySQL `cmport_gerenciamento`):
| Tabela | Colunas de texto a corrigir |
|---|---|
| `fin_movimentacoes` | `descricao`, `observacao` |
| `despesas` | `descricao`, `observacao` |
| `condominios` | `nome` — **SÓ as linhas onde `tipo = 'FORNECEDOR'`** |

Chave primária de todas é `id`.

## Como o script deve funcionar

### Conexão
- Local (default): `pymysql.connect(host="localhost", port=3306, user="root", password="cmport2026", database="cmport_gerenciamento", charset="utf8mb4")`
- Produção (`--ambiente producao`): via SSH com `paramiko`, host `168.231.96.184`, user `root`
  (chave default `~/.ssh/id_ed25519`), rodando mysql dentro do container:
  `docker exec -i cmport_db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 -N'`
  Espelhar o padrão do arquivo já existente `fluxo-financeiro/identificar_pendencias_mes.py`
  (função `buscar_notas_producao`) — ler ele antes pra copiar o jeito de mandar query por stdin.

### Detecção de mojibake (função `precisa_corrigir(texto) -> bool`)
Um texto precisa de correção quando TODAS estas condições são verdadeiras:
1. `texto` não é vazio/None.
2. Contém pelo menos uma das sequências típicas de mojibake:
   `Ã¡ Ã  Ã£ Ã¢ Ã© Ãª Ã­ Ã³ Ã´ Ãµ Ãº Ã§ Ã‡ Ãƒ Ã‰ Ã•` ou `Â ` (A-circunflexo + espaço/pontuação) ou `Ã‚`.
3. A reversão `texto.encode('latin-1').decode('utf-8')` **não lança exceção**
   (`UnicodeDecodeError`/`UnicodeEncodeError`) — se lançar, NÃO tenta corrigir, marca como
   "não foi possível reverter automaticamente" e reporta à parte.
4. O texto revertido tem MENOS ocorrências de `Ã` e `Â` do que o original
   (a reversão de fato melhorou — evita mexer em quem já está certo ou tem `Ã` legítimo).

### Correção (função `corrigir(texto) -> str`)
`return texto.encode('latin-1').decode('utf-8')`
Aplicar UMA vez só (não em loop) — double-encoding simples é o caso; não assumir triplo.

### Modos
- **dry-run (default)**: percorre todas as linhas de todas as tabelas/colunas do escopo,
  conta quantas precisam de correção, imprime as primeiras 30 no formato
  `[tabela.coluna id=NNN]  ANTES: ...  ->  DEPOIS: ...`, e no fim um resumo
  `tabela.coluna: X de Y linhas`. NÃO altera nada.
- **`--aplicar`**: além do dry-run, executa os `UPDATE tabela SET coluna=%s WHERE id=%s`
  um por um, dentro de uma transação por tabela (commit no fim de cada tabela).
  Imprimir contagem de linhas afetadas por tabela.
- **`--sql-only`**: em vez de aplicar, escreve todos os `UPDATE` num arquivo
  `fluxo-financeiro/correcao_encoding_<ambiente>_<timestamp>.sql`, com `SET NAMES utf8mb4;`
  na primeira linha. Strings escapadas corretamente (usar `conn.escape_string` do pymysql
  ou aspas simples com escape manual de `'` e `\`).

### REQUISITO ABSOLUTO DE CHARSET
- Toda conexão pymysql: `charset="utf8mb4"`.
- Toda sessão mysql via SSH: começar a query com `SET NAMES utf8mb4;`.
- O arquivo `.sql` gerado: primeira linha `SET NAMES utf8mb4;`.
- `sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")` no topo (Windows).
Se esquecer isso, o script REINTRODUZ o bug. É o erro nº 1 a evitar.

## Regras do projeto (obrigatórias)
- NUNCA deletar registro. Este script só faz UPDATE de coluna de texto.
- NUNCA hardcodar credencial de produção no arquivo além do que já está descrito aqui
  (host/user/senha local são de dev e já são públicos no repo; a senha de produção vem
  da variável `$MYSQL_ROOT_PASSWORD` de dentro do container, nunca escrita no script).
- Não tocar em nenhuma outra tabela/coluna além das 3 do escopo.
- Comentários e mensagens do script em português.
- Um arquivo só. Não criar outros arquivos, não editar arquivos existentes.

## Critério de pronto (o que validar)
1. `cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_encoding_historico.py`
   roda sem erro e mostra o dry-run com exemplos ANTES/DEPOIS legíveis
   (ex: `CartÃ£o` -> `Cartão`).
2. `... corrigir_encoding_historico.py --sql-only` gera o `.sql` com `SET NAMES utf8mb4;`
   na primeira linha e UPDATEs bem formados.
3. O resumo final bate: reporta contagem por `tabela.coluna` e lista à parte os casos
   que não deu pra reverter automaticamente (se houver).
4. Rodar de novo o dry-run depois de um `--aplicar` em local deve mostrar `0 linhas` a
   corrigir (idempotência).
