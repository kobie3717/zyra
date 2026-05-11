# Persistência

[Home](Home) | [Banco-de-Dados](Banco-de-Dados) | [Eventos](Eventos)

## Objetivo

Garantir durabilidade, consistência operacional e recuperação de estado com baixa latência.

## Estratégia em camadas

1. **Memória (store runtime)**: acesso imediato para fluxo online.
2. **Redis (opcional)**: cache distribuído para reduzir round-trips SQL.
3. **MySQL**: persistência durável e auditável.
4. **Disco**: fallback local de credenciais e mídia.

## Componentes principais

- `src/store/sql-store.ts`
- `src/store/redis-store.ts`
- `src/store/baileys-store.ts`
- `src/core/auth/*`

## Persistência de mensagens

- upsert de mensagem normalizada
- indexação de texto para busca/análise
- associações de usuários (sender/quoted/mentioned)

## Persistência de mídia

- grava metadados em `message_media`
- download opcional local (`WA_MEDIA_AUTO_DOWNLOAD`)
- backfill para completar campos faltantes

## Persistência de dispositivos

- `user_devices` alimentada por decodificação de JID (`jidDecode`)
- atualização incremental em eventos de mensagem

## Configurações de grupo

- `group_config` com `config_json`
- permite evolução de flags sem churn de schema

## Falhas e resiliência

- falhas de Redis não impedem operação SQL
- falhas de SQL têm logs e fallback parcial em memória/disco
- reconciliação por backfill contínuo

## Garantias práticas

- consistência eventual entre camadas
- rastreabilidade por `events_log` e `commands_log`
- isolamento por `connection_id`

---

**Zyra Wiki** • Última atualização: 11/05/2026
