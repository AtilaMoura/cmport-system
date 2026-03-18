-- Migração: adicionar forma_pagamento, banco_pagamento, observacao à tabela boletos
-- Executar UMA VEZ no banco de dados antes de reiniciar o backend

ALTER TABLE boletos
  ADD COLUMN forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'BOLETO_INTER' AFTER situacao,
  ADD COLUMN banco_pagamento VARCHAR(100) NULL AFTER forma_pagamento,
  ADD COLUMN observacao TEXT NULL AFTER banco_pagamento;

-- Migração: parcelas (se ainda não aplicada)
-- Se der erro "Duplicate column", significa que já foi aplicada — ignorar.
ALTER TABLE boletos
  ADD COLUMN numero_parcela INT NOT NULL DEFAULT 1 AFTER tipo_cobranca,
  ADD COLUMN total_parcelas INT NOT NULL DEFAULT 1 AFTER numero_parcela;
