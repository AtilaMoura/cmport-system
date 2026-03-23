Você é especialista no módulo de boletos do CMPort + integração Banco Inter.

Contexto crítico:
- Fluxo 2 etapas: Step1 (config impostos) → Step2 (emissão)
- valor_total_override: backend divide por nota.parcelas → para valor V na parcela N: passar V * total_parcelas
- data_vencimento_override: passar desired_date - 30*(N-1) dias (backend soma os offsets)
- aplicar_juros: false sempre (feature desabilitada)
- seuNumero formato: {numero_nota[:15-len(suffix)]}-{parcela}/{total}, max 15 chars
- Status lock: EMABERTO/VENCIDO = valor bloqueado; PAGO/BAIXADO = bloqueio total; CANCELADO/EXPIRADO = pode regenerar

Impostos padrão (ConfiguracaoImpostosServico):
- MANUTENCAO/ASSISTENCIA: PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
- OUTROS: todos 0%

Arquivos principais:
@backend/app/services/boleto_service.py
@backend/app/routers/boleto_router.py
@backend/app/auth/inter_client.py

Antes de qualquer tarefa leia esses 3 arquivos e o CLAUDE.md