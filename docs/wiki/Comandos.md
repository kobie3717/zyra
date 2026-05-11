# Comandos

[Home](Home) | [Eventos](Eventos) | [Persistência](Persistência)

## Arquitetura de comandos

## Referência prática

- [Referência de Comandos](Comandos-Referencia)


O Zyra usa runtime modular de comandos em `src/core/command-runtime` com contrato tipado em `src/commands/types.ts`.

Fluxo:

1. Evento `messages.upsert` chega.
2. Router/processor identifica prefixo e comando.
3. Runtime cria `CommandContext` com helpers.
4. Comando executa sem acoplamento direto no socket.

## Estrutura de arquivos

- `src/commands/*.ts`: implementações dos comandos.
- `src/commands/index.ts`: registro/índice de comandos.
- `src/core/command-runtime/context.ts`: construção do contexto.
- `src/core/command-runtime/processor.ts`: ciclo de execução e proteção de erro.
- `src/core/command-runtime/admin.ts`: helpers administrativos de grupo.

## Contrato do comando

Campos usuais:

- `name`
- `description`
- `execute(ctx)`

O `ctx` expõe helpers como `send/reply/react`, dados de mensagem/chat e utilitários admin.

## Capacidades do contexto

- dados: `chatId`, `sender`, `isGroup`, `text`, `args`
- envio: resposta, reação, mensagens sem quoted
- admin: promote/demote/remove
- mídia: resolução de fonte de sticker e utilidades relacionadas

## Boas práticas de implementação

- validar premissas cedo (`isGroup`, `isAdmin`)
- retornar feedback curto e claro ao usuário
- evitar side-effects fora do comando
- delegar operações transversais ao runtime/store

## Tratamento de erro

- Erros são capturados no processor.
- Logs estruturados preservam contexto do comando.
- Falhas devem ser observáveis sem quebrar o loop principal.

## Exemplo de novo comando (fluxo)

1. Criar arquivo em `src/commands`.
2. Exportar no índice.
3. Adicionar testes de comportamento.
4. Validar via `npm test`.

## Comandos administrativos e segurança

Comandos de moderação devem:

- verificar papel do executor
- auditar ação em evento/log
- lidar com limitações do Baileys em grupos grandes

---

**Zyra Wiki** • Última atualização: 11/05/2026
