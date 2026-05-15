# Backfill

[Home](Home) | [Banco-de-Dados](Banco-de-Dados) | [Produção](Produção)

## Objetivo

O backfill corrige dados incompletos/inconsistentes em background sem interromper o processamento online.

## Execução

```bash
npm run db:backfill
```

## Motor

Arquivo principal: `src/core/db/backfill.ts`.

Características:

- execução em ciclos
- checkpoints por etapa (`backfill_checkpoints`)
- lote configurável por ambiente
- logs de progresso por passo

## Etapas típicas

- normalização de usuários/identificadores
- preenchimento de `sender_user_id`
- reconciliação de `message_events`/`events_log`
- complemento de metadados de mídia
- preenchimento de dados derivados de grupos/contatos

## Prioridade crítica (alvo <1%)

O ciclo atual prioriza redução de nulos em campos críticos de identidade e nome:

1. `wa_contacts_cache.user_id`
2. `lid_mappings.user_id`
3. `users.display_name`
4. `wa_contacts_cache.display_name`
5. `chats.display_name`

Isso melhora rapidamente integridade para trilhas de comando, eventos e auditoria.

## Causa raiz corrigida (degradação de display_name)

Foi corrigido no runtime SQL um comportamento que podia degradar dados:

- `setChat` não sobrescreve mais `display_name` com `NULL` em updates parciais.
- `last_message_ts` e `unread_count` também preservam valor existente quando update chega nulo.
- `setContact` agora preenche chat com `display_name` quando estiver `NULL` **ou vazio**.

Resultado esperado: queda contínua de nulos em `users.display_name` e `chats.display_name`, com menor regressão entre ciclos.

## Backfill de mídia local

Com `WA_MEDIA_AUTO_DOWNLOAD=true`, o worker pode completar:

- `message_media.file_length` via `stat` do arquivo local
- `message_media.file_name` via basename de `local_path`

## Operação segura

- execute com banco íntegro e backup recente
- monitore tempo por ciclo
- ajuste batch para evitar pressão excessiva no banco

## Métricas e diagnóstico

- logs de `affectedRows` por etapa
- comparação de pendências antes/depois do ciclo
- uso de `db:nulls` para validar redução de lacunas

---

**Zyra Wiki** • Última atualização: 15/05/2026
