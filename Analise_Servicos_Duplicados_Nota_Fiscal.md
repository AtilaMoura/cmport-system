# Análise: Serviços duplicados por Nota Fiscal parcelada (2026-07-30)

> **Status: ✅ corrigido no banco LOCAL em 2026-07-30. Produção NÃO foi alterada — aguardando aprovação separada.**
>
> Antes de mexer, verifiquei que produção estava idêntica ao local (mesmas contagens em recibos/notas/boletos/serviços/condomínios/clientes) — confirmado que nada disso foi criado pelo cliente: os 127 registros envolvidos (46 mantidos + 81 excluídos) têm `criado_em` concentrado em só 6 dias (01/04, 28/05, 14/07, 22/07, 24/07, 27/07/2026), todos batendo com execuções de script de importação/reconciliação desta e de sessões anteriores — nenhum tem cara de clique real do cliente no sistema.
>
> Os 2 casos de mesma data (Shift Mobilidade #1226, Chanceler #1337) foram checados manualmente: os boletos duplicados de cada nota têm a **mesma descrição de serviço** e o mesmo lote de criação — confirmado como o mesmo bug, não cobranças distintas. Entraram na correção.
>
> **Resultado local:** 81 serviços excluídos (soft delete com auditoria). Serviços 812→731. Boletos (813) e notas fiscais (710) **intactos** — só o registro de serviço saiu.

> **Contexto:** a arquitetura correta é `NotaFiscal (1)——(N) Boleto` e `NotaFiscal (1)——(1) ManutencaoAssistencia` (documentado no `CLAUDE.md`). Quando uma nota é parcelada (paga em várias parcelas/meses), deveria existir **1 nota + N boletos + 1 serviço**. O que encontrei: em 46 notas, cada mês em que uma parcela foi paga **gerou um serviço novo**, todos apontando pra mesma nota — exatamente o mesmo tipo de bug do caso do recibo (Edgar), só que do lado de Nota Fiscal/Boleto, e em escala bem maior.

## Resumo

- **46 notas fiscais afetadas**
- **81 serviços excedentes** (deveriam ser 46, existem 127 no total — 81 de sobra)
- Praticamente todas do tipo **ASSISTENCIA** (só 2 são MANUTENCAO — contratos mensais normalmente não são parcelados, então é esperado que a maior parte do bug esteja em Assistência)
- Confirmado cruzando com a planilha `FLUXO FINANCEIRO - 2026.xlsx`: os NFs afetados aparecem repetidos em vários meses com PARCELA incrementando (ex: `1267 A` aparece em Jan `07/10`, Fev `08/10`, Mar `09/10`, Abr `10/10` — mesma nota, mesmo condomínio, mesmo valor de parcela R$695,80) — é o mesmo trabalho sendo pago em parcelas, não trabalhos diferentes.
- Cada nota tem exatamente **N boletos e N serviços** (um serviço por boleto/mês) — os boletos em si estão corretos (representam pagamentos reais), só os serviços extras que sobram.

## Lista completa das 46 notas afetadas

| Nota (id) | Número | Condomínio | Tipo | Valor parcela | Qtd. serviços (deveria ser 1) | Serviço a manter (mais antigo) | Serviços a remover |
|---|---|---|---|---:|---:|---|---|
| 431 | 7690 | Piazza Fontana | MANUTENCAO | 609,38 | 3 | #359 (24/03) | #1103, #1104 |
| 444 | 7706 | Verbena | MANUTENCAO | 656,77 | 2 | #372 (24/03) | #1120 |
| 672 | 1267 A | Costa Brava | ASSISTENCIA | 695,80 | 4 | #605 (19/01) | #870, #1014, #1124 |
| 673 | 1288 A | Mariangela Teixeira | ASSISTENCIA | 611,11 | 5 | #606 (06/01) | #871, #1015, #1125, #1240 |
| 674 | 1317 A | Fortezza Di Ferrara | ASSISTENCIA | 936,66 | 5 | #607 (08/01) | #872, #1016, #1126, #1241 |
| 675 | 1337 A | Ibirapuera Park | ASSISTENCIA | 798,12 | 2 | #608 (02/01) | #873 |
| 676 | 1338 A | Cullinan | ASSISTENCIA | 930,00 | 3 | #609 (06/01) | #874, #1017 |
| 679 | 1363 A | Costa Brava | ASSISTENCIA | 372,01 | 2 | #612 (23/01) | #875 |
| 680 | 1375 A | Cezario Motta | ASSISTENCIA | 1.339,68 | 5 | #613 (05/01) | #876, #1018, #1127, #1242 |
| 681 | 1380 A | Via Del Corso | ASSISTENCIA | 573,75 | 3 | #614 (14/01) | #877, #1019 |
| 682 | 1382 A | Angra dos Reis | ASSISTENCIA | 837,50 | 3 | #615 (14/01) | #880, #1021 |
| 684 | 1387 A | Greville e Flamboyant | ASSISTENCIA | 558,29 | 3 | #617 (16/01) | #881, #1022 |
| 686 | 1401 A | The Crystal House | ASSISTENCIA | 550,00 | 2 | #619 (28/01) | #882 |
| 687 | 1405 A | Paço de Hygienópolis | ASSISTENCIA | 750,00 | 2 | #620 (05/01) | #883 |
| 688 | 1409 A | Mont Blanc | ASSISTENCIA | 700,00 | 2 | #621 (16/01) | #884 |
| 689 | 1412 A | Porto Alegre | ASSISTENCIA | 900,00 | 2 | #622 (16/01) | #885 |
| 690 | 1413 A | Ipiranga | ASSISTENCIA | 523,75 | 2 | #623 (23/01) | #886 |
| 693 | 7351 A | Araucárias | ASSISTENCIA | 725,00 | 2 | #626 (02/01) | #887 |
| 694 | 7519 A | Via Del Corso | ASSISTENCIA | 1.729,18 | 4 | #627 (15/01) | #888, #1023, #1129 |
| 707 | 1411.7407 A | Villar do Paraíso | ASSISTENCIA | 1.566,17 | 5 | #640 (15/01) | #901, #1035, #1271, #1272 |
| 712 | 000.000.0007 A | Park | ASSISTENCIA | 1.250,00 | 2 | #645 (19/01) | #902 |
| 942 | 1381 A | Lucerna | ASSISTENCIA | 438,00 | 4 | #879 (13/02) | #878, #1020, #1128 |
| 968 | 000.000.012 A | Green Gold | ASSISTENCIA | 375,00 | 2 | #904 (19/02) | #1039 |
| 969 | 000.000.015 A | Ipiranga | ASSISTENCIA | 362,50 | 2 | #905 (20/02) | #1040 |
| 972 | 000.000.018 A | Costa Brava | ASSISTENCIA | 718,96 | 4 | #908 (20/02) | #1041, #1150, #1243 |
| 973 | 000.000.020 A | José Antonio Alpiovezza | ASSISTENCIA | 801,87 | 4 | #909 (23/02) | #1042, #1151, #1244 |
| 977 | 000.000.025 A | Macunaíma | ASSISTENCIA | 1.600,00 | 4 | #913 (09/02) | #1043, #1152, #1245 |
| 978 | 000.000.026 A | Lucerna | ASSISTENCIA | 600,00 | 2 | #914 (09/02) | #1044 |
| 985 | 000.000.033 A | Maison Saint Etienne | ASSISTENCIA | 1.770,00 | 4 | #921 (09/02) | #1045, #1153, #1246 |
| 990 | 000.000.040 A | Bahamas | ASSISTENCIA | 380,00 | 2 | #926 (23/02) | #1046 |
| 992 | 000.000.042 A | The Crystal House | ASSISTENCIA | 2.725,00 | 2 | #928 (23/02) | #1047 |
| 993 | 000.000.043 A | Cullinan | ASSISTENCIA | 732,50 | 3 | #929 (23/02) | #1048, #1154 |
| 996 | 000.000.047 A | Cullinan | ASSISTENCIA | 910,00 | 2 | #932 (26/02) | #1049 |
| 1001 | 000.000.053 A | Sintonia Perdizes | ASSISTENCIA | 500,00 | 2 | #937 (26/02) | #1051 |
| 1090 | 7643.0059 A | Estilo Higienópolis | ASSISTENCIA | 23.625,00 | 3 | #1036 (06/03) | #1145, #1273 |
| 1091 | 7647.0062 A | Assumpta de Sica | ASSISTENCIA | 353,05 | 2 | #1037 (13/03) | #1146 |
| 1104 | 000.000.050 A | Olivais | ASSISTENCIA | 925,00 | 3 | #1050 (02/03) | #1155, #1247 |
| 1108 | 000.000.057 A | Angra dos Reis | ASSISTENCIA | 450,00 | 2 | #1054 (03/03) | #1156 |
| 1193 | 7651.0071 A | J.R.I | ASSISTENCIA | 487,20 | 2 | #1147 (17/04) | #1274 |
| 1194 | 7657.0073 A | Green Gold | ASSISTENCIA | 687,74 | 2 | #1148 (01/04) | #1149 |
| 1226 | 7590.0058 A | Shift Mobilidade (2º) | ASSISTENCIA | 1.012,20 | 3 | #1185 (14/04)* | #1186, #1187 |
| 1326 | 000.000.126 A | Vermont | ASSISTENCIA | 1.560,00 | 2 | #1291 (25/06) | #1306 |
| 1331 | 000.000.131 A | Olivais | ASSISTENCIA | 2.290,00 | 2 | #1296 (26/06) | #1307 |
| 1335 | 7773.0110 A | Sbios Investimentos | ASSISTENCIA | 595,22 | 2 | #1300 (22/06) | #1314 |
| 1336 | 7774.0112 A | Penthouse Campo Belo | ASSISTENCIA | 404,53 | 2 | #1301 (22/06) | #1315 |
| 1337 | 7648.0063 A | Chanceler | ASSISTENCIA | 501,53 | 2 | #1302 (15/06)* | #1303 |

\* Nota 1226 (Shift) e 1337 (Chanceler): os "serviços duplicados" têm a **mesma data**, não meses diferentes — nesses dois casos específicos vale checar manualmente antes de apagar, pode ser 3 cobranças distintas no mesmo dia que só coincidiram de usar o mesmo número de NF (não necessariamente parcela do mesmo trabalho). Todos os outros 44 casos têm datas em meses diferentes, batendo exatamente com o padrão de parcela mensal.

## Causa provável

Isso deve ter acontecido no processo de importação/reconciliação da planilha: pra cada linha da seção Assistência (uma por mês, uma por parcela paga), o script/processo criava um **boleto novo vinculado à nota certa** (correto) mas também um **serviço novo** (incorreto — deveria criar o serviço só na primeira vez que a nota aparece, as parcelas seguintes deveriam só adicionar o boleto).

## Recomendação

Mesmo padrão usado pro Edgar: manter o serviço mais antigo de cada nota (é o que primeiro registrou o trabalho) e excluir os demais via soft delete (com auditoria, motivo "duplicado — nota fiscal parcelada gerou serviço por mês"). Os boletos e a nota fiscal continuam intactos — só os 81 registros de serviço extras saem.

**Diferença importante em relação ao recibo:** aqui **não tem cascade a se preocupar** — excluir um serviço não afeta a nota fiscal nem os boletos (é o boleto/nota que "manda" na relação, não o serviço). Então a operação é mais simples: só `DELETE /servicos/{id}` pra cada um dos 81 ids da coluna "Serviços a remover".

## Não verificado ainda

- Não foi feita a mesma varredura pra `condominio_id NULL` ou outros tipos de nota fora do padrão `ASSISTENCIA`/`MANUTENCAO` avulsas.
- Os 2 casos marcados com "*" (mesma data) merecem checagem manual antes de decidir remover.
- Ainda não apliquei nenhuma correção — isto é só o relatório.
