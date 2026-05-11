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

**Zyra Wiki** • Última atualização: 11/05/2026
