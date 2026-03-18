-- Migração: adiciona campos de impostos, valor_boleto_parcela e parcelas_json
-- Executar uma vez no banco cmport_gerenciamento

ALTER TABLE notas_fiscais
    ADD COLUMN IF NOT EXISTS valor_boleto_parcela FLOAT NULL,
    ADD COLUMN IF NOT EXISTS parcelas_json        JSON   NULL,
    ADD COLUMN IF NOT EXISTS iss                  FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS pis                  FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS cofins               FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS inss                 FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS csll                 FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS icms                 FLOAT  NULL,
    ADD COLUMN IF NOT EXISTS prev                 FLOAT  NULL;
