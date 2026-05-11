# Banco de Dados

[Home](Home) | [Persistência](Persistência) | [Backfill](Backfill)

## Visão geral

O Zyra usa MySQL 8 como fonte de verdade para histórico, auditoria e dados operacionais. O schema canônico está em `docs/exemplodbmodel.md`.

## Modelo lógico (macro)

### Núcleo de conexão

- `connections`
- `auth_creds`
- `signal_keys`

### Entidades de domínio

- `users`
- `user_identifiers`
- `user_aliases`
- `user_devices`

### Conversas e mensagens

- `chats`
- `messages`
- `message_media`
- `message_events`
- `message_text_index`
- `message_users`

### Grupos

- `groups`
- `group_participants`
- `group_events`
- `group_join_requests`
- `group_config`

### Governança e suporte

- `labels`
- `label_associations`
- `commands_log`
- `events_log`
- `events_log_archive`
- `blocklist`

## Padrões de modelagem

- particionamento lógico por `connection_id`
- chaves compostas para isolamento multi-tenant
- uso de `JSON` para payload original e campos semi-estruturados
- índices focados em leitura por chat, mensagem e usuário

## Tabelas críticas para throughput

### `messages`

- chave única por `(connection_id, chat_jid, message_id, from_me)`
- índices para feed e lookup rápido

### `message_media`

- metadados de mídia + `local_path`
- apoio a backfill de `file_length` e `file_name`

### `user_identifiers`

- mapeia PN/LID/JID/username para um único `user_id`
- essencial para deduplicação de identidade

## Inicialização e manutenção

- `npm run db:init`: cria tabelas ausentes
- `npm run db:verify`: checagem de integridade
- `npm run db:nulls`: diagnóstico de lacunas
- `npm run db:backfill`: normalização histórica

## Estratégia de evolução de schema

- mudanças não destrutivas no init
- migrações aplicadas no código para cenários específicos
- preferir compatibilidade retroativa em produção

---

**Zyra Wiki** • Última atualização: 11/05/2026
