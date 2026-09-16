# Demandas Dev — espelho local

Espelho local, só leitura, do canal "Demandas Dev" (Atila ↔ CMPort/Almira/Fabiana)
que roda em produção (`/demandas-dev` no sistema, tabelas `canal_*`). Existe pra não
precisar entrar no sistema toda vez só pra saber "tem demanda nova?" ou "essa já tem
resposta?".

O script **nunca escreve nada em produção** — só lê via API e salva aqui.

## Uso

```bash
python sync_demandas.py            # sincroniza tudo que mudou desde o último sync
python sync_demandas.py D-26       # só esse item específico
python sync_demandas.py --forcar   # reprocessa tudo do zero (usar só se o FORMATO
                                    # do .md mudou — ignora o .state.json)
```

Saída de exemplo:
```
2 novas: D-28, D-29
1 atualizada(s): D-27
1 resolvida(s)/descartada(s) agora: D-25
12 sem mudança
```

## Credenciais

O script loga na API com as variáveis de ambiente `CMPORT_EMAIL` e `CMPORT_SENHA`
(não hardcoda credencial em arquivo versionado). Configurar antes de rodar:

PowerShell:
```powershell
$env:CMPORT_EMAIL = "..."
$env:CMPORT_SENHA = "..."
```

Bash:
```bash
export CMPORT_EMAIL=...
export CMPORT_SENHA=...
```

## Estrutura

```
INDEX.md          # só demandas/notas ATIVAS — reescrito do zero a cada sync
RESOLVIDAS.md      # histórico do que já foi resolvido/descartado — só cresce
itens/<código>.md  # 1 arquivo por demanda/nota — descrição + thread + análise
anexos/<código>/   # arquivos baixados (imagens, docs)
.state.json        # controle interno (não editar na mão)
```

Cada `itens/<código>.md` tem uma seção **`## Nossa análise`** no final que o sync
**nunca sobrescreve** — é o espaço livre pra anotar causa raiz, decisão tomada,
link de commit etc. Tudo acima dessa seção vem direto da produção e é reescrito
a cada sync (não editar essa parte, seria perdida no próximo sync).

Quando um item é resolvido/descartado: sai do `INDEX.md`, ganha um bloco resumido
no `RESOLVIDAS.md`, e o arquivo completo continua em `itens/` como histórico.
