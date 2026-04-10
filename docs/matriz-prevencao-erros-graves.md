# Matriz De Prevencao De Erros Graves

## Escopo
Operacoes com maior impacto em:
- financeiro/saldo
- cadastro de pessoas
- exclusao/restauracao de dados
- disparos e automacoes

## Prioridade P0 (critico imediato)

| Fluxo | Pontos de codigo | Risco grave | Protecao atual | Gap principal | Acao recomendada |
|---|---|---|---|---|---|
| Cadastro de cliente/aluno/responsavel | `pages/ClientsPage.tsx`, `services/api.ts`, `backend/routes/clients.ts` | duplicacao de cadastro por reenvio/click duplo | trava UI + idempotencia backend + chave idempotente no cliente | mensagem e comportamento divergentes entre telas | padronizar resposta para replay (`201`/`200`) e telemetria de deduplicacao |
| Lancamento de transacao (credito/debito/consumo) | `pages/POSPage.tsx`, `pages/ClientsPage.tsx`, `backend/routes/transactions.ts` | duplicacao financeira | validacoes de integridade (enterprise/client/plano) | sem idempotencia em `POST /transactions` | adicionar idempotencia + fingerprint transacional + bloqueio anti replay |
| Operacoes destrutivas globais | `backend/routes/system.ts` (`/reset`, `/restore`, `/clear-enterprise-data`), `backend/routes/transactions.ts` (`/clear-all`) | perda massiva de dados | controle por perfil | sem confirmacao forte de segunda etapa e sem janela de seguranca | exigir `confirmationToken` curto + `reason` obrigatoria + auditoria estruturada |

## Prioridade P1 (alto)

| Fluxo | Pontos de codigo | Risco | Protecao atual | Gap principal | Acao recomendada |
|---|---|---|---|---|---|
| Pedidos | `backend/routes/orders.ts`, `pages/OrdersPage.tsx` | pedido duplicado ou status inconsistente | validacao de acesso por empresa | sem idempotencia no create/update sensivel | idempotencia em `POST /orders` e regra de transicao de status |
| Atualizacao de saldo do cliente | `pages/POSPage.tsx`, `pages/ClientsPage.tsx`, `backend/routes/clients.ts` | saldo incorreto por corrida entre chamadas | `balanceAdjustment` no update | sem controle de versao concorrente | adicionar `version/updatedAt` otimista no update de saldo |
| Importacao em massa de contatos | `pages/WhatsAppPage.tsx` | criacao duplicada em lote e parcial inconsistente | tentativa individual com captura de erro | sem batch idempotente e sem relatorio tecnico detalhado | endpoint de importacao transacional com dry-run e relatorio por linha |

## Prioridade P2 (medio)

| Fluxo | Pontos de codigo | Risco | Gap principal | Acao recomendada |
|---|---|---|---|---|
| Disparos WhatsApp | `backend/routes/whatsapp.ts`, `pages/WhatsAppPage.tsx` | reenvio acidental | sem chave idempotente em envios | idempotencia por mensagem/destinatario/janela de tempo |
| Ajustes administrativos de configuracao | `backend/routes/system.ts`, `pages/SystemSettingsPage.tsx` | mudanca sensivel sem rastreio claro | auditoria parcial | trilha obrigatoria com `who/when/before/after/reason` |

## Padrao de engenharia a aplicar em todos os fluxos criticos
1. idempotencia no backend para comandos (`POST` sensiveis).
2. trava de concorrencia no frontend para a mesma acao.
3. confirmacao em duas etapas para operacoes destrutivas.
4. auditoria estruturada obrigatoria com motivo.
5. codigo de erro padronizado para acao do frontend.
6. testes de regressao para click duplo, timeout e retry.

## Sequencia sugerida de execucao
1. `POST /transactions` com idempotencia (P0).
2. hardening de operacoes destrutivas (`/reset`, `/restore`, `/clear-all`, `/clear-enterprise-data`) (P0).
3. controle de concorrencia para update de saldo (P1).
4. pedidos (`POST /orders`) com idempotencia e transicao de status (P1).
