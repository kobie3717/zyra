# Referência de Comandos

[Home](Home) | [Comandos](Comandos) | [Eventos](Eventos)

## Convenções

- Prefixo padrão: `!` (configurável em `WA_COMMAND_PREFIX`).
- Em grupos, comandos administrativos exigem:
  - executante admin
  - bot com permissões compatíveis no grupo
- Identificadores de usuário aceitos em comandos admin:
  - número (`5511999999999`)
  - menção (`@usuario`)
  - resposta a mensagem (quoted)

## Comandos de utilidade

### `!ping`

- Finalidade: verificar disponibilidade do bot.
- Resposta esperada: `pong! sistema ativo e operando sem problemas.`

Exemplo:

```text
!ping
```

### `!menu`

- Finalidade: listar comandos disponíveis dinamicamente do registry.

Exemplo:

```text
!menu
```

## Comandos de sticker e mídia

### `!sticker`, `!s`, `!st`

- Finalidade: converter mídia em figurinha.
- Fonte de mídia: legenda da mídia, resposta a mídia ou fallback recente do chat.
- Ajuda embutida: `-h`, `-help`, `--help`.

Exemplos:

```text
!s
!s -h
!s Zyra
!s Pack do #grupo/#nome
```

Observações técnicas:

- limite de sticker gerado: `< 1.5MB`
- placeholders suportados no template:
  - `#data`, `#hora`, `#nome`, `#grupo`, `#numero`
- template por usuário é persistido e reutilizado.

### `!toimg`

- Finalidade: converter figurinha (WebP) para PNG.
- Requer: responder uma figurinha.

Exemplo:

```text
!toimg
```

### `!togif`

- Finalidade: converter figurinha (WebP) para GIF.
- Requer: responder uma figurinha.

Exemplo:

```text
!togif
```

## Comandos de moderação de grupo

### `!antilink`

- Finalidade: controle anti-link por grupo.

Uso:

```text
!antilink
!antilink on
!antilink off
!antilink invite on
!antilink invite off
!antilink allow list
!antilink allow add exemplo.com
!antilink allow remove exemplo.com
```

Comportamento:

- sem argumentos: retorna status + whitelist + instruções.
- `invite on/off`: controla exceção para link do próprio grupo.
- `allow`: gerencia whitelist de domínios permitidos.

### `!add`

- Finalidade: adicionar participante(s).

Exemplos:

```text
!add 5511999999999
!add @usuario
```

### `!kick`

- Finalidade: remover participante(s).

Exemplos:

```text
!kick 5511999999999
!kick @usuario
```

### `!ban`

- Finalidade: banir/remover participante(s) (alias semântico de remoção).

Exemplo:

```text
!ban @usuario
```

### `!promote`

- Finalidade: promover participante(s) a admin.

Exemplo:

```text
!promote @usuario
```

### `!demote`

- Finalidade: remover admin de participante(s).

Exemplo:

```text
!demote @usuario
```

### `!grupo on|off`

- Finalidade: abrir/fechar envio de mensagens no grupo.

Exemplos:

```text
!grupo on
!grupo off
```

### `!lock on|off`

- Finalidade: travar/destravar edição de infos do grupo.

Exemplos:

```text
!lock on
!lock off
```

### `!assunto <texto>`

- Finalidade: atualizar nome/assunto do grupo.

Exemplo:

```text
!assunto Equipe Projeto X
```

### `!descricao <texto|limpar>`

- Finalidade: atualizar ou limpar descrição do grupo.

Exemplos:

```text
!descricao Regras do grupo...
!descricao limpar
```

### `!linkgrupo`

- Finalidade: mostrar link de convite atual.

Exemplo:

```text
!linkgrupo
```

### `!revogarlink`

- Finalidade: revogar link atual e gerar novo.

Exemplo:

```text
!revogarlink
```

### `!ephemeral off|24h|7d|90d|<segundos>`

- Finalidade: controlar mensagens temporárias.

Exemplos:

```text
!ephemeral off
!ephemeral 24h
!ephemeral 604800
```

## Erros comuns e resposta esperada

- Contexto inválido (não é grupo): `❌ Este comando só funciona em grupos.`
- Permissão insuficiente: `❌ Apenas administradores podem usar este comando.`
- Mídia ausente para conversão: mensagem de instrução para responder a sticker/mídia.

## Observação de manutenção

A lista acima reflete os comandos registrados em `src/commands/index.ts`.
Ao adicionar/remover comandos no código, atualize esta página.

---

**Zyra Wiki** • Última atualização: 11/05/2026
