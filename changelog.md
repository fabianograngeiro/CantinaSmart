# Changelog do Projeto (Fabiano + Victor)

## Regras de colaboração
- Toda alteração de código deve ser registrada neste arquivo.
- Quando Fabiano informar que o Victor fez uma mudança, o agente deve primeiro localizar os arquivos alterados pelo Victor antes de aplicar novas alterações.
- As entradas devem conter: data/hora, autor (`Fabiano`, `Victor` ou `Codex`), arquivos afetados e resumo objetivo.
- Antes de qualquer nova ação, o agente deve ler este `changelog.md` para verificar mensagens/atualizações recentes.

## 2026-03-10

### 2026-03-10 12:00 - Autor: Codex
- Arquivos:
  - `pages/WhatsAppPage.tsx`
- Resumo:
  - Criada aba `CONFIGURAÇÃO` no módulo `ADMIN > WHATSAPP`.
  - Implementado cadastro de respostas rápidas (adicionar/remover) com persistência local.
  - Removidas respostas rápidas fixas do painel de conversa; agora o painel usa apenas respostas cadastradas.
