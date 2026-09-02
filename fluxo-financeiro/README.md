# fluxo-financeiro/ — índice

Scripts e docs de reconciliação financeira, migração de histórico e planejamento
do módulo Fluxo Financeiro. Organizado por assunto. Atualizado 02/09/2026.

> **Regra:** scripts que tocam produção rodam da máquina local com `--ambiente
> producao` (SSH → `docker exec cmport_db mysql`), sempre dry-run → backup →
> `--aplicar`. Backup + commit são função do Claude. MCP `mysql-cmport` = banco LOCAL.

---

## 🟢 ATIVO

### Reconciliação extratos bancários × sistema (agosto/2026)
| Arquivo | O quê |
|---|---|
| `PLANO_RECONCILIACAO_EXTRATOS_AGOSTO.md` | Plano em 5 passos. Passos 1–2 feitos |
| `ler_extratos_agosto.py` | Passo 1 — parser único dos 3 extratos → `extratos_agosto_normalizado.json` |
| `comparar_extratos_agosto.py` | Passo 2 — cruza entradas sistema × extrato por conta (SSH read-only) |
| `RESULTADO_PASSO2_EXTRATOS_AGOSTO.md` | Resultado do Passo 2: 5 ajustes fecham os 3 CNPJs a 100% (entradas) |
| `RECONCILIACAO_AGOSTO_CLIENTE.html` | Versão cliente do Passo 2 (Artifact) — o que falta ajustar por conta + entrada×transferência |
| `comparar_extrato_tec_agosto.py` | (anterior) Extrato Inter TEC × entradas TEC. Substituído pelo `comparar_extratos_agosto.py` |

### Folha de pagamento — Fase D2 (migração jan–jul) — _sessão `011C7k6iJC2MiR3MVwYikDAA`_
| Arquivo | O quê |
|---|---|
| `PLANO_FASE_D2_FOLHA.md` | Passos 0–5 da migração da folha histórica |
| `PENDENCIAS_FOLHA_CLIENTE.md` | 12 pontos a confirmar com a cliente |
| `TASK_folha_d2_opencode.md` | Spec dos 4 scripts (opencode escreve, Claude valida) |
| `preparar_folha_d2.py` | Gera `folha_d2_input.json` (lista congelada de correções) |
| `conferir_folha_funcionarios.py` | Confere folha da planilha × produção (SSH) → `mapa_folha_funcionarios.json` |
| `extrair_controle_funcionarios.py` | Planilha "Controle de Funcionarios 2026.xlsx" → JSON/CSV |
| `carregar_funcionarios.py` · `gerar_sql_incremento_funcionario.py` | Carga/incremento de funcionários |
| `CATEGORIZACAO_DESPESAS.md` | Categorização das descrições de despesa (input da folha) |

### B1 — banco genérico nas saídas (jan–jul, aguardando cliente)
| Arquivo | O quê |
|---|---|
| `aplicar_relatorio_bancos.py` | **Script canônico**: aplica relatório da tela (banco + valor + data + "não pago") |
| `extrair_bancos_revisao.py` · `montar_dataset_revisao.py` | Regeneram o dataset da tela "Conferência de Bancos" |
| `PROCESSO_RECONCILIACAO_MENSAL.md` | Runbook mês a mês (usar `validar_fluxo_todos_meses.py` primeiro) |

### Validação / fechamento mensal
| Arquivo | O quê |
|---|---|
| `validar_fluxo_todos_meses.py` | Compara planilha × sistema, todos os meses de uma vez (B4) |
| `validar_mes_detalhado.py` · `verificar_fechamento_mes.py` · `identificar_pendencias_mes.py` | Auxiliares de conferência de um mês |
| `comparar_local_producao.py` | Diff entre banco local e produção |
| `backup_bd.py` | Dump do banco (local ou produção) |

### data_emissao na nota fiscal (deployado, falta backfill em produção)
| Arquivo | O quê |
|---|---|
| `backfill_data_emissao_notas.py` | Grava `data_emissao` nas notas com XML real. Rodar em produção. |

### Ferramentas de uso recorrente
| Arquivo | O quê |
|---|---|
| `corrigir_encoding_historico.py` | Corrige mojibake (cp1252) — reutilizável |

### Export planilha do fluxo pro cliente (futuro)
| Arquivo | O quê |
|---|---|
| `ANALISE_EXPORT_PLANILHA_FLUXO.md` | Análise + proposta de abas. Depende da folha fechar. |

---

## 🟡 CANDIDATOS A APAGAR (trabalho já entregue — confirmar com o Atila / sessão da folha)

Já foram deployados e não têm mais uso; alguns podem ser insumo da Fase D2 da folha.

- `PLANO_DESPESA_GERAL.md` — Fases 1–8 em produção (25/08)
- `PLANO_DESPESA_FUNCIONARIO.md` — Fases A–D1 em produção; D2 tem doc próprio
- `FORNECEDORES_FALTANDO_VALIDAR.md` — resolvido 27/08 (44 lançamentos, 23 fornecedores)
- `OBSERVACOES_DESPESAS.md` — notas da migração de 21/08, já aplicada
- `migrar_despesa_geral_v2.py` · `gerar_sql_migracao_producao.py` · `teste_fase2_despesa.py` — despesa geral migrada
- `agrupar_despesas.py` · `categorizar_despesas.py` · `extrair_despesas.py` — pipeline que gerou `CATEGORIZACAO_DESPESAS.md` (pode ser re-rodado na D2)
- `extrair_fornecedores.py` · `gerar_sql_fornecedores_pendencias.py` — fornecedores resolvidos
- `backfill_banco_entradas.py` — B3.1 aplicado 27/08 (one-shot)

---

## Apagados em 02/09 (cleanup)

- **56 backups `.sql`** — mantidos só o último local (`..._historico_fase1_20260827_1401`) e o último de produção (`..._boletos_expirados_agosto_20260901_1244`).
- `opencode-prompts/` + `opencode_*.txt` (prompts de features já entregues: despesa geral 1–8, data_emissao).
- Artefatos intermediários regeneráveis: `_diferencas_detalhadas.*`, `_planilha_discrepancias.json`, `plano_vinculo_*.json`, `despesas_brutas/completo/movimentacao/geral.json`, `fornecedores_*_v2.json`, `diferencas_view.json`, `recorrentes_classificados.json`, `relatorio_bancos_20260827_agosto.json` (v1), etc.
- Scripts one-shot já executados e recuperáveis pelo git: `TASK_b2_encoding.md`, `TASK_pendencias_acoes.md`, `aplicar_correcao_valor_agosto.py`, `migrar_despesa_geral.py` (v1), `corrigir_boletos_expirados_agosto.py`, `verificar_expirados_vs_planilha.py`.
