# Workflow: Arquiteto → Dev → Validação

## Como usar

Quando quiser que o arquiteto analise um problema e escreva o plano para o dev implementar, use o comando:

```
/orquestrador analisa [descrição do problema] e escreve o plano no @Refatoracao.md
```

Ou simplesmente descreva o problema e diga: **"cria plano no Refatoracao.md"**

---

## Como funciona o fluxo

```
[Você descreve o problema]
        ↓
[Arquiteto (Claude Opus) investiga o código]
        ↓
[Arquiteto escreve Refatoracao.md com:]
  • Diagnóstico com evidências (arquivo + linha)
  • Causa raiz clara
  • Correção detalhada por arquivo
  • Sequência de execução numerada
  • Quais agentes usar
        ↓
[Dev lê o Refatoracao.md e implementa na íntegra]
        ↓
[Dev avisa o arquiteto: "feito, pode verificar"]
        ↓
[Arquiteto valida cada ponto do checklist]
        ↓
[Se aprovado → dev faz git push vps master]
```

---

## Regras do workflow

- **Dev não altera o plano** — segue na íntegra
- **Dev não sobe para produção** antes da validação do arquiteto
- **Arquiteto sempre verifica** os arquivos reais após a implementação
- **Refatoracao.md é sobrescrito** a cada novo problema (não é histórico)

---

## Estrutura padrão do Refatoracao.md

```markdown
# Plano de Correção — [nome do problema]

> Arquiteto: Claude Opus (plan mode)
> Status: Aguardando implementação

## Diagnóstico
- Causa raiz com evidência (arquivo:linha)
- Fluxo com o bug ilustrado

## Correção — N arquivos

### Arquivo 1: [caminho]
[código exato a mudar, de → para]

### Arquivo 2: [caminho]
[código exato a mudar, de → para]

## Sequência de execução pelo dev
1. ...
2. ...

## Agentes disponíveis
| Tarefa | Agente |

## O que o arquiteto vai validar
- [ ] item 1
- [ ] item 2

> IMPORTANTE: Dev não deve alterar este plano.
> Após concluir, avisar o arquiteto para validação.
```

---

## Exemplos de uso

```
"o boleto não está gerando, cria plano no Refatoracao.md"

"o email de cobrança não chega, analisa e atualiza o Refatoracao.md"

"a sync do Auvo está quebrando, arquiteto investiga e escreve o plano"

"acabei de perceber que o campo X não salva, verifica e coloca no Refatoracao.md"
```
