# Eventos

[Home](Home) | [Comandos](Comandos) | [Persistência](Persistência)

## Camada de eventos

A borda de entrada do sistema é o stream de eventos da Baileys, consumido principalmente por `src/events/register.ts`.

## Eventos críticos

### Mensageria

- `messages.upsert`
- `messages.update`
- `messages.media-update`
- `messages.reaction`
- `message-receipt.update`

### Grupos

- `groups.upsert`
- `groups.update`
- `group-participants.update`
- `group.join-request`

### Contatos e presença

- `contacts.upsert`
- `contacts.update`
- `presence.update`

### Governança/labels

- `labels.edit`
- `labels.association`

## Pipeline de processamento

1. Normalização do payload.
2. Persistência em store/cache/SQL.
3. Roteamento de comandos (quando aplicável).
4. Emissão de eventos de auditoria.

## Regras operacionais relevantes

- Comandos normalmente processados em `messages.upsert` tipo `notify`.
- Eventos de mídia podem disparar refresh de metadados.
- Atualizações de grupo alimentam `group_participants` e `chat_users`.

## Observabilidade de eventos

- logs estruturados por tipo e volume
- gravação em `events_log`
- correlação por `chat_jid`, `message_id` e `connection_id`

## Extensão segura

Para adicionar novo manipulador:

1. incluir no mapa de handlers
2. garantir idempotência
3. registrar erro sem derrubar fluxo global
4. adicionar teste de integração

---

**Zyra Wiki** • Última atualização: 11/05/2026
