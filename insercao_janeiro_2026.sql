SET NAMES utf8mb4;
SET autocommit=0;
START TRANSACTION;

-- Row 4: Assumpita Sica | NF: 7467 | cond_id: 378
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7467', 'MANUTENCAO', 'AUTORIZADA', 1, 759.15, '2026-01-10', '2026-01-12', 378, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (378, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 759.15, 759.15, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 5: Alvorada | NF: 7468 | cond_id: 225
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7468', 'MANUTENCAO', 'AUTORIZADA', 1, 632.63, '2026-01-10', '2026-01-12', 225, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (225, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 632.63, 632.63, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 6: Bahamas | NF: 7469 | cond_id: 596
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7469', 'MANUTENCAO', 'AUTORIZADA', 1, 404.88, '2026-01-10', '2026-01-12', 596, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (596, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 404.88, 404.88, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 7: Bonaire | NF: 7470 | cond_id: 663
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7470', 'MANUTENCAO', 'AUTORIZADA', 1, 308.32, '2026-01-10', '2026-01-12', 663, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (663, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 308.32, 308.32, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 8: Cap Martinique | NF: 7471 | cond_id: 414
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7471', 'MANUTENCAO', 'AUTORIZADA', 1, 379.58, '2026-01-10', '2026-01-12', 414, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (414, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 379.58, 379.58, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 9: Cezario Motta | NF: 7472 | cond_id: 670
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7472', 'MANUTENCAO', 'AUTORIZADA', 1, 615.86, '2026-01-10', '2026-01-12', 670, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (670, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 615.86, 615.86, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 10: Cintia | NF: 7473 | cond_id: 650
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7473', 'MANUTENCAO', 'AUTORIZADA', 1, 387.58, '2026-01-10', '2026-01-12', 650, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (650, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 387.58, 387.58, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 11: Costa Brava | NF: 7474 | cond_id: 394
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7474', 'MANUTENCAO', 'AUTORIZADA', 1, 798.08, '2026-01-10', '2026-01-12', 394, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (394, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 798.08, 798.08, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 12: Cube Vila Ipojuca | NF: 7475 | cond_id: 714
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7475', 'MANUTENCAO', 'AUTORIZADA', 1, 590.45, '2026-01-10', '2026-01-12', 714, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (714, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 590.45, 590.45, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 13: Ipiranga | NF: 7476 | cond_id: 176
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7476', 'MANUTENCAO', 'AUTORIZADA', 1, 457.64, '2026-01-10', '2026-01-12', 176, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (176, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 457.64, 457.64, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 14: Lucerna | NF: 7477 | cond_id: 651
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7477', 'MANUTENCAO', 'AUTORIZADA', 1, 401.3, '2026-01-10', '2026-01-12', 651, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (651, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 401.3, 401.3, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 15: Odete | NF: 7478 | cond_id: 689
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7478', 'MANUTENCAO', 'AUTORIZADA', 1, 295.23, '2026-01-10', '2026-01-12', 689, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (689, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 295.23, 295.23, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 16: Olivais | NF: 7479 | cond_id: 661
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7479', 'MANUTENCAO', 'AUTORIZADA', 1, 482.68, '2026-01-10', '2026-01-12', 661, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (661, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 482.68, 482.68, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 17: Paço de Hygienopolis | NF: 7480 | cond_id: 675
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7480', 'MANUTENCAO', 'AUTORIZADA', 1, 533.34, '2026-01-10', '2026-01-09', 675, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (675, @nf_id, 'manutencao', '2026-01-09', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 533.34, 533.34, '2026-01-09', '2026-01-10', '2026-01-09', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 18: Penthouse | NF: 7481 | cond_id: 671
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7481', 'MANUTENCAO', 'AUTORIZADA', 1, 548.28, '2026-01-10', '2026-01-12', 671, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (671, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 548.28, 548.28, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 19: Piazza Fontana (Poste) | NF: 7482 | cond_id: 678
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7482', 'MANUTENCAO', 'AUTORIZADA', 1, 337.4, '2026-01-10', '2026-01-09', 678, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (678, @nf_id, 'manutencao', '2026-01-09', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 337.4, 337.4, '2026-01-09', '2026-01-10', '2026-01-09', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 20: Raposo Tavares (Poste) | NF: 7483 | cond_id: 672
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7483', 'MANUTENCAO', 'AUTORIZADA', 1, 337.4, '2026-01-10', '2026-01-12', 672, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (672, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 337.4, 337.4, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 21: Sbios | NF: 7484 | cond_id: 451
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7484', 'MANUTENCAO', 'AUTORIZADA', 1, 337.4, '2026-01-10', '2026-01-12', 451, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (451, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 337.4, 337.4, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 22: Sintonia Perdizes | NF: 7485 | cond_id: 534
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7485', 'MANUTENCAO', 'AUTORIZADA', 1, 759.15, '2026-01-10', '2026-01-09', 534, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (534, @nf_id, 'manutencao', '2026-01-09', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 759.15, 759.15, '2026-01-09', '2026-01-10', '2026-01-09', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 23: The Crystal Houser | NF: 7486 | cond_id: 505
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7486', 'MANUTENCAO', 'AUTORIZADA', 1, 506.1, '2026-01-10', '2026-01-12', 505, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (505, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 506.1, 506.1, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 24: Ville Courchevel | NF: 7487 | cond_id: 244
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7487', 'MANUTENCAO', 'AUTORIZADA', 1, 168.7, '2026-01-10', '2026-01-12', 244, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (244, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 168.7, 168.7, '2026-01-12', '2026-01-10', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 25: Angra dos Reis | NF: 7488 | cond_id: 648
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7488', 'MANUTENCAO', 'AUTORIZADA', 1, 538.51, '2026-01-12', '2026-01-12', 648, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (648, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 538.51, 538.51, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 26: Concor | NF: 7489 | cond_id: 685
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7489', 'MANUTENCAO', 'AUTORIZADA', 1, 349.5, '2026-01-12', '2026-01-12', 685, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (685, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 349.5, 349.5, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 27: Maison Saint Etienne | NF: 7490 | cond_id: 674
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7490', 'MANUTENCAO', 'AUTORIZADA', 1, 468.6, '2026-01-12', '2026-01-12', 674, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (674, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 468.6, 468.6, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 28: Park | NF: 7491 | cond_id: 673
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7491', 'MANUTENCAO', 'AUTORIZADA', 1, 361.5, '2026-01-12', '2026-01-12', 673, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (673, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 361.5, 361.5, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 29: Piazza Fontana | NF: 7492 | cond_id: 678
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7492', 'MANUTENCAO', 'AUTORIZADA', 1, 514.01, '2026-01-12', '2026-01-12', 678, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (678, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 514.01, 514.01, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 30: Raposo Tavares | NF: 7493 | cond_id: 672
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7493', 'MANUTENCAO', 'AUTORIZADA', 1, 357.42, '2026-01-12', '2026-01-12', 672, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (672, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 357.42, 357.42, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 31: Vermont | NF: 7494 | cond_id: 652
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7494', 'MANUTENCAO', 'AUTORIZADA', 1, 457.62, '2026-01-12', '2026-01-12', 652, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (652, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 457.62, 457.62, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 32: Via Del Corso | NF: 7495 | cond_id: 657
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7495', 'MANUTENCAO', 'AUTORIZADA', 1, 378.71, '2026-01-12', '2026-01-12', 657, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (657, @nf_id, 'manutencao', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 378.71, 378.71, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 33: Helbor Lof Evolution | NF: 7496 | cond_id: 679
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7496', 'MANUTENCAO', 'AUTORIZADA', 1, 631.93, '2026-01-15', '2026-01-15', 679, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (679, @nf_id, 'manutencao', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 631.93, 631.93, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 34: Ibirapuera Park | NF: 7497 | cond_id: 684
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7497', 'MANUTENCAO', 'AUTORIZADA', 1, 499.73, '2026-01-15', '2026-01-15', 684, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (684, @nf_id, 'manutencao', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 499.73, 499.73, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 35: Jardim Buenos Aires | NF: 7498 | cond_id: 653
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7498', 'MANUTENCAO', 'AUTORIZADA', 1, 392.54, '2026-01-15', '2026-01-15', 653, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (653, @nf_id, 'manutencao', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 392.54, 392.54, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 36: Park Avenue | NF: 7499 | cond_id: 676
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7499', 'MANUTENCAO', 'AUTORIZADA', 1, 437.46, '2026-01-15', '2026-01-15', 676, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (676, @nf_id, 'manutencao', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 437.46, 437.46, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 37: Reynolds | NF: 7500 | cond_id: 654
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7500', 'MANUTENCAO', 'AUTORIZADA', 1, 388.84, '2026-01-15', '2026-01-15', 654, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (654, @nf_id, 'manutencao', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 388.84, 388.84, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 38: Fortezza Di Ferrara | NF: 7501 | cond_id: 742
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7501', 'MANUTENCAO', 'AUTORIZADA', 1, 590.46, '2026-01-20', '2026-01-20', 742, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (742, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 590.46, 590.46, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 39: Jose Antonio Alpiovezza | NF: 7502 | cond_id: 686
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7502', 'MANUTENCAO', 'AUTORIZADA', 1, 521.09, '2026-01-20', '2026-01-20', 686, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (686, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 521.09, 521.09, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 40: Jussara | NF: 7503 | cond_id: 668
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7503', 'MANUTENCAO', 'AUTORIZADA', 1, 439.23, '2026-01-20', '2026-01-27', 668, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (668, @nf_id, 'manutencao', '2026-01-27', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 439.23, 439.23, '2026-01-27', '2026-01-20', '2026-01-27', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 41: Jussara - Mês de Dezembro | NF: 7399 M | cond_id: 668
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7399 M', 'MANUTENCAO', 'AUTORIZADA', 1, 602.21, '2026-01-20', '2026-01-27', 668, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (668, @nf_id, 'manutencao', '2026-01-27', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 602.21, 602.21, '2026-01-27', '2026-01-20', '2026-01-27', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 42: Le Monde | NF: 7504 | cond_id: 665
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7504', 'MANUTENCAO', 'AUTORIZADA', 1, 260.73, '2026-01-20', '2026-01-20', 665, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (665, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 260.73, 260.73, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 43: Macunaima | NF: 7505 | cond_id: 125
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7505', 'MANUTENCAO', 'AUTORIZADA', 1, 469.1, '2026-01-20', '2026-01-20', 125, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (125, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 469.1, 469.1, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 44: Margaux | NF: 7506 | cond_id: 152
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7506', 'MANUTENCAO', 'AUTORIZADA', 1, 449.4, '2026-01-20', '2026-01-20', 152, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (152, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 449.4, 449.4, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 45: Mont Blanc | NF: 7507 | cond_id: 688
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7507', 'MANUTENCAO', 'AUTORIZADA', 1, 919.42, '2026-01-20', '2026-01-20', 688, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (688, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 919.42, 919.42, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 46: Verbena | NF: 7508 | cond_id: 175
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7508', 'MANUTENCAO', 'AUTORIZADA', 1, 553.99, '2026-01-20', '2026-01-20', 175, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (175, @nf_id, 'manutencao', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 553.99, 553.99, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 47: Araucarias | NF: 7509 | cond_id: 582
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7509', 'MANUTENCAO', 'AUTORIZADA', 1, 674.8, '2025-01-25', '2026-01-26', 582, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (582, @nf_id, 'manutencao', '2026-01-26', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 674.8, 674.8, '2026-01-26', '2025-01-25', '2026-01-26', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 48: Cullinan | NF: 7510 | cond_id: 154
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7510', 'MANUTENCAO', 'AUTORIZADA', 1, 421.75, '2026-01-25', '2026-01-26', 154, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (154, @nf_id, 'manutencao', '2026-01-26', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 421.75, 421.75, '2026-01-26', '2026-01-25', '2026-01-26', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 49: Olga | NF: 7511 | cond_id: 736
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7511', 'MANUTENCAO', 'AUTORIZADA', 1, 612.96, '2026-01-25', '2026-01-26', 736, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (736, @nf_id, 'manutencao', '2026-01-26', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 612.96, 612.96, '2026-01-26', '2026-01-25', '2026-01-26', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 54: Angra dos Reis | NF: 1185 A | cond_id: 648
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1185 A', 'ASSISTENCIA', 'AUTORIZADA', 10, 856.65, '2025-10-14', '2026-01-14', 648, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (648, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 10, 10, 856.65, 856.65, '2026-01-14', '2025-10-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 55: Costa Brava | NF: 1267 A | cond_id: 394
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1267 A', 'ASSISTENCIA', 'AUTORIZADA', 10, 695.8, '2025-10-17', '2026-01-19', 394, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (394, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 7, 10, 695.8, 695.8, '2026-01-19', '2025-10-17', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 56: Mariangela Texeira | NF: 1288 A | cond_id: 555
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1288 A', 'ASSISTENCIA', 'AUTORIZADA', 10, 611.11, '2026-01-06', '2026-01-06', 555, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (555, @nf_id, 'assistencia', '2026-01-06', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 6, 10, 611.11, 611.11, '2026-01-06', '2026-01-06', '2026-01-06', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 57: Fortezza Di Ferrara | NF: 1317 A | cond_id: 742
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1317 A', 'ASSISTENCIA', 'AUTORIZADA', 10, 936.66, '2026-01-08', '2026-01-08', 742, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (742, @nf_id, 'assistencia', '2026-01-08', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 5, 10, 936.66, 936.66, '2026-01-08', '2026-01-08', '2026-01-08', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 58: Ibirapuera Park | NF: 1337 A | cond_id: 684
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1337 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 798.12, '2026-01-02', '2026-01-02', 684, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (684, @nf_id, 'assistencia', '2026-01-02', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 4, 5, 798.12, 798.12, '2026-01-02', '2026-01-02', '2026-01-02', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 59: Cullian | NF: 1338 A | cond_id: 154
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1338 A', 'ASSISTENCIA', 'AUTORIZADA', 6, 930.0, '2026-01-06', '2026-01-06', 154, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (154, @nf_id, 'assistencia', '2026-01-06', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 4, 6, 930.0, 930.0, '2026-01-06', '2026-01-06', '2026-01-06', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 60: Maison Saint Etiene | NF: 1343 A | cond_id: 674
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1343 A', 'ASSISTENCIA', 'AUTORIZADA', 4, 700.0, '2026-01-06', '2026-01-06', 674, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (674, @nf_id, 'assistencia', '2026-01-06', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 4, 4, 700.0, 700.0, '2026-01-06', '2026-01-06', '2026-01-06', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 61: Helbor Loft Evolution | NF: 1351 A | cond_id: 679
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1351 A', 'ASSISTENCIA', 'AUTORIZADA', 4, 779.16, '2026-01-13', '2026-01-13', 679, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (679, @nf_id, 'assistencia', '2026-01-13', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 4, 4, 779.16, 779.16, '2026-01-13', '2026-01-13', '2026-01-13', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 62: Costa Brava | NF: 1363 A | cond_id: 394
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1363 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 372.01, '2025-12-25', '2026-01-23', 394, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (394, @nf_id, 'assistencia', '2026-01-23', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 4, 5, 372.01, 372.01, '2026-01-23', '2025-12-25', '2026-01-23', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 63: Cezario Motta | NF: 1375 A | cond_id: 670
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1375 A', 'ASSISTENCIA', 'AUTORIZADA', 10, 1339.68, '2026-01-05', '2026-01-05', 670, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (670, @nf_id, 'assistencia', '2026-01-05', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 10, 1339.68, 1339.68, '2026-01-05', '2026-01-05', '2026-01-05', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 64: Via Del Corso | NF: 1380 A | cond_id: 657
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1380 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 573.75, '2025-11-14', '2026-01-14', 657, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (657, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 5, 573.75, 573.75, '2026-01-14', '2025-11-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 65: Angra dos Reis | NF: 1382 A | cond_id: 648
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1382 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 837.5, '2025-11-14', '2026-01-14', 648, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (648, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 5, 837.5, 837.5, '2026-01-14', '2025-11-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 66: Jardim Buenos Aires | NF: 1384 A | cond_id: 653
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1384 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 1150.0, '2025-11-14', '2026-01-16', 653, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (653, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 3, 1150.0, 1150.0, '2026-01-16', '2025-11-14', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 67: Grevillle Flamboyate | NF: 1387 A | cond_id: 733
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1387 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 558.29, '2025-11-14', '2026-01-16', 733, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (733, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 3, 558.29, 558.29, '2026-01-16', '2025-11-14', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 68: Villar Paraiso | NF: 1394 A | cond_id: 728
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1394 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 512.5, '2026-01-15', '2026-01-15', 728, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (728, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 512.5, 512.5, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 69: The Cristal | NF: 1401 A | cond_id: 505
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1401 A', 'ASSISTENCIA', 'AUTORIZADA', 4, 550.0, '2025-12-29', '2026-01-28', 505, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (505, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 4, 550.0, 550.0, '2026-01-28', '2025-12-29', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 70: Paços Hygeanopolis | NF: 1405 A | cond_id: 675
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1405 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 750.0, '2026-01-05', '2026-01-05', 675, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (675, @nf_id, 'assistencia', '2026-01-05', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 3, 750.0, 750.0, '2026-01-05', '2026-01-05', '2026-01-05', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 71: Mont Blanc | NF: 1409 A | cond_id: 688
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1409 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 700.0, '2025-12-16', '2026-01-16', 688, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (688, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 3, 700.0, 700.0, '2026-01-16', '2025-12-16', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 72: Porto Alegre | NF: 1412 A | cond_id: 501
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1412 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 900.0, '2025-12-16', '2026-01-16', 501, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (501, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 3, 900.0, 900.0, '2026-01-16', '2025-12-16', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 73: Ipiranga | NF: 1413 A | cond_id: 176
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1413 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 523.75, '2025-12-16', '2026-01-23', 176, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (176, @nf_id, 'assistencia', '2026-01-23', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 3, 523.75, 523.75, '2026-01-23', '2025-12-16', '2026-01-23', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 74: Mont Blanc | NF: 1416 A | cond_id: 688
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1416 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 800.0, '2025-12-19', '2026-01-19', 688, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (688, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 2, 800.0, 800.0, '2026-01-19', '2025-12-19', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 75: Helbor Loft | NF: 1417 A | cond_id: 679
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1417 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 545.0, '2025-12-19', '2026-01-19', 679, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (679, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 2, 545.0, 545.0, '2026-01-19', '2025-12-19', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 76: Araucarias | NF: 7351 A | cond_id: 582
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7351 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 725.0, '2026-01-02', '2026-01-02', 582, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (582, @nf_id, 'assistencia', '2026-01-02', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 3, 725.0, 725.0, '2026-01-02', '2026-01-02', '2026-01-02', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 77: Via Del Corso | NF: 7519 A | cond_id: 657
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7519 A', 'ASSISTENCIA', 'AUTORIZADA', 4, 1729.18, '2026-01-14', '2026-01-15', 657, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (657, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 4, 1729.18, 1729.18, '2026-01-15', '2026-01-14', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 78: Five Stars | NF: 7512 A | cond_id: 365
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7512 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 210.88, '2026-01-14', '2026-01-14', 365, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (365, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 210.88, 210.88, '2026-01-14', '2026-01-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 79: Castel Mantova | NF: 7514 A | cond_id: 149
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7514 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 210.88, '2026-01-14', '2026-01-14', 149, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (149, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 210.88, 210.88, '2026-01-14', '2026-01-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 80: Green Gold | NF: 7515 A | cond_id: 384
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7515 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 210.88, '2026-01-14', '2026-01-14', 384, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (384, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 210.88, 210.88, '2026-01-14', '2026-01-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 81: San Mariano | NF: 7516 A | cond_id: 139
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7516 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 210.88, '2026-01-14', '2026-01-13', 139, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (139, @nf_id, 'assistencia', '2026-01-13', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 210.88, 210.88, '2026-01-13', '2026-01-14', '2026-01-13', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 82: California Park | NF: 7517 A | cond_id: 529
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7517 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 337.4, '2026-01-14', '2026-01-14', 529, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (529, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 337.4, 337.4, '2026-01-14', '2026-01-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 83: Praças São Paulo | NF: 7518 A | cond_id: 219
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7518 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 210.88, '2026-01-14', '2026-01-14', 219, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (219, @nf_id, 'assistencia', '2026-01-14', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 210.88, 210.88, '2026-01-14', '2026-01-14', '2026-01-14', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 84: Lorrenzetti | NF: 7522 A | cond_id: 233
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7522 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 236.18, '2026-01-28', '2026-01-28', 233, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (233, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 236.18, 236.18, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 85: Grevillle Flamboyate | NF: 7523 A | cond_id: 733
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7523 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 236.18, '2026-01-28', '2026-01-28', 733, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (733, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 236.18, 236.18, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 86: Fabiola | NF: 7524 A | cond_id: 454
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7524 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 280.0, '2026-01-28', '2026-01-28', 454, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (454, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 280.0, 280.0, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 87: São Vicente | NF: 7525 A | cond_id: 759
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7525 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 379.58, '2026-01-28', '2026-01-28', 759, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (759, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 379.58, 379.58, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 88: Zueno (Tapajos) | NF: 7526 A | cond_id: 484
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7526 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 280.0, '2026-01-28', '2026-01-28', 484, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (484, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 280.0, 280.0, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 89: Olivais | NF: 7527 A | cond_id: 661
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('7527 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 632.62, '2026-01-28', '2026-01-28', 661, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (661, @nf_id, 'assistencia', '2026-01-28', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 632.62, 632.62, '2026-01-28', '2026-01-28', '2026-01-28', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 90: Villar Paraiso | NF: 1411.7407 A | cond_id: 728
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1411.7407 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 1566.17, '2026-01-15', '2026-01-15', 728, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (728, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 3, 1566.17, 1566.17, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 91: Bambino | NF: 1415.7411 A | cond_id: 578
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('1415.7411 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 750.0, '2026-01-16', '2026-01-16', 578, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (578, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 2, 750.0, 750.0, '2026-01-16', '2026-01-16', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 92: Raposo Tavares | NF: 000.000.0004 A | cond_id: 672
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0004 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 350.0, '2026-01-15', '2026-01-15', 672, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (672, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 350.0, 350.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 93: Reynolds | NF: 000.000.0005 A | cond_id: 654
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0005 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 350.0, '2026-01-15', '2026-01-15', 654, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (654, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 350.0, 350.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 94: Maison Saint Etienne | NF: 000.000.0006 A | cond_id: 674
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0006 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 350.0, '2026-01-15', '2026-01-15', 674, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (674, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 350.0, 350.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 95: Park | NF: 000.000.0007 A | cond_id: 673
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0007 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 1250.0, '2026-01-15', '2026-01-19', 673, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (673, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 1250.0, 1250.0, '2026-01-19', '2026-01-15', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 96: Via Del Corso | NF: 000.000.0009 A | cond_id: 657
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0009 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 350.0, '2026-01-15', '2026-01-15', 657, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (657, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 350.0, 350.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 97: Raposo Tavares | NF: 000.000.0010 A | cond_id: 672
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0010 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 1800.0, '2026-01-15', '2026-01-15', 672, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (672, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 1800.0, 1800.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 98: Jardim Buenos Aires | NF: 000.000.0011 A | cond_id: 653
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0011 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 450.0, '2026-01-15', '2026-01-15', 653, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (653, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 450.0, 450.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 99: Green Gold | NF: 000.000.0012 A | cond_id: 384
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0012 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 750.0, '2026-01-19', '2026-01-19', 384, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (384, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 750.0, 750.0, '2026-01-19', '2026-01-19', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 100: Odete | NF: 000.000.0013 A | cond_id: 689
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0013 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 250.0, '2026-01-19', '2026-01-19', 689, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (689, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 250.0, 250.0, '2026-01-19', '2026-01-19', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 101: Cintia | NF: 000.000.0014 A | cond_id: 650
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0014 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 1150.0, '2026-01-30', '2026-01-30', 650, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (650, @nf_id, 'assistencia', '2026-01-30', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 1150.0, 1150.0, '2026-01-30', '2026-01-30', '2026-01-30', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 102: Ipiranga | NF: 000.000.0015 A | cond_id: 176
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0015 A', 'ASSISTENCIA', 'AUTORIZADA', 3, 725.0, '2026-01-20', '2026-01-20', 176, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (176, @nf_id, 'assistencia', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 3, 725.0, 725.0, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 103: Bonaire | NF: 000.000.0016 A | cond_id: 663
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0016 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 500.0, '2026-01-20', '2026-01-20', 663, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (663, @nf_id, 'assistencia', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 500.0, 500.0, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 104: Olivais | NF: 000.000.0017 A | cond_id: 661
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0017 A', 'ASSISTENCIA', 'AUTORIZADA', 2, 730.0, '2026-01-20', '2026-01-20', 661, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (661, @nf_id, 'assistencia', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 2, 730.0, 730.0, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 105: Costa Brava | NF: 000.000.0018 A | cond_id: 394
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0018 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 718.96, '2026-01-20', '2026-01-20', 394, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (394, @nf_id, 'assistencia', '2026-01-20', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 5, 718.96, 718.96, '2026-01-20', '2026-01-20', '2026-01-20', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 106: Via Del Corso | NF: 000.000.0019 A | cond_id: 657
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0019 A', 'ASSISTENCIA', 'AUTORIZADA', 1, 300.0, '2026-01-21', '2026-01-21', 657, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (657, @nf_id, 'assistencia', '2026-01-21', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 300.0, 300.0, '2026-01-21', '2026-01-21', '2026-01-21', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 107: Jose Antonio Alpiovezza | NF: 000.000.0020 A | cond_id: 686
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('000.000.0020 A', 'ASSISTENCIA', 'AUTORIZADA', 5, 3207.48, '2026-01-22', '2026-01-22', 686, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (686, @nf_id, 'assistencia', '2026-01-22', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 5, 3207.48, 3207.48, '2026-01-22', '2026-01-22', '2026-01-22', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 108: Dulce | NF: REC-2026-001 | cond_id: 730
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-001', 'ASSISTENCIA', 'AUTORIZADA', 1, 450.0, '2026-01-19', '2026-01-19', 730, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (730, @nf_id, 'assistencia', '2026-01-19', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 450.0, 450.0, '2026-01-19', '2026-01-19', '2026-01-19', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 109: Helbor Lof Evolution (Rodrigo ap. 605) | NF: REC-2026-002 | cond_id: 679
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-002', 'ASSISTENCIA', 'AUTORIZADA', 1, 70.0, '2026-01-05', '2026-01-05', 679, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (679, @nf_id, 'assistencia', '2026-01-05', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 70.0, 70.0, '2026-01-05', '2026-01-05', '2026-01-05', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 110: BBARE 02/06 | NF: REC-2026-003 | cond_id: 602
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-003', 'ASSISTENCIA', 'AUTORIZADA', 6, 1500.0, '2026-01-08', '2026-01-08', 602, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (602, @nf_id, 'assistencia', '2026-01-08', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 2, 6, 1500.0, 1500.0, '2026-01-08', '2026-01-08', '2026-01-08', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 111: BBARE 03/06 | NF: REC-2026-004 | cond_id: 602
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-004', 'ASSISTENCIA', 'AUTORIZADA', 6, 1500.0, '2026-01-12', '2026-01-12', 602, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (602, @nf_id, 'assistencia', '2026-01-12', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 3, 6, 1500.0, 1500.0, '2026-01-12', '2026-01-12', '2026-01-12', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 112: BBARE todos | NF: REC-2026-005 | cond_id: 602
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-005', 'ASSISTENCIA', 'AUTORIZADA', 1, 4600.0, '2026-01-23', '2026-01-23', 602, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (602, @nf_id, 'assistencia', '2026-01-23', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 4600.0, 4600.0, '2026-01-23', '2026-01-23', '2026-01-23', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 113: Edgar | NF: REC-2026-006 | cond_id: 148
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-006', 'ASSISTENCIA', 'AUTORIZADA', 4, 1750.0, '2026-01-15', '2026-01-15', 148, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (148, @nf_id, 'assistencia', '2026-01-15', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 4, 1750.0, 1750.0, '2026-01-15', '2026-01-15', '2026-01-15', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 114: Mario Cantoni | NF: REC-2026-007 | cond_id: 333
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-007', 'ASSISTENCIA', 'AUTORIZADA', 1, 200.0, '2026-01-16', '2026-01-16', 333, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (333, @nf_id, 'assistencia', '2026-01-16', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 200.0, 200.0, '2026-01-16', '2026-01-16', '2026-01-16', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 120: Alessandra | NF: REC-2026-008 | cond_id: 608
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-008', 'ASSISTENCIA', 'AUTORIZADA', 1, 70.0, '2026-01-27', '2026-01-27', 608, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (608, @nf_id, 'assistencia', '2026-01-27', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 70.0, 70.0, '2026-01-27', '2026-01-27', '2026-01-27', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

-- Row 122: Rafaela | NF: REC-2026-009 | cond_id: 469
INSERT INTO notas_fiscais
  (numero_nota, tipo, status, parcelas, valor, data_vencimento, data_pagamento, condominio_id, xml_original, alerta_impostos)
  VALUES ('REC-2026-009', 'ASSISTENCIA', 'AUTORIZADA', 1, 70.0, '2026-01-27', '2026-01-27', 469, 'ENTRADA_MANUAL', 0)
  ON DUPLICATE KEY UPDATE data_pagamento=VALUES(data_pagamento), id=LAST_INSERT_ID(id);
SET @nf_id = LAST_INSERT_ID();
INSERT INTO manutencoes_assistencias
  (condominio_id, nota_fiscal_id, tipo, data_servico, criado_em, atualizado_em)
  VALUES (469, @nf_id, 'assistencia', '2026-01-27', NOW(), NOW());
INSERT INTO boletos
  (nota_fiscal_id, numero_parcela, total_parcelas, valor_nominal, valor_total_recebido,
   data_emissao, data_vencimento, data_pagamento, tipo_cobranca, situacao, forma_pagamento)
  VALUES (@nf_id, 1, 1, 70.0, 70.0, '2026-01-27', '2026-01-27', '2026-01-27', 'SIMPLES', 'PAGO', 'TRANSFERENCIA');

COMMIT;
-- Total inseridos: 109, pendentes: 7