# Configuração

[Home](Home) | [Instalação](Instalação) | [Comandos](Comandos)

## Objetivo

Documentar variáveis de ambiente, padrões operacionais e decisões de configuração que afetam runtime, banco, cache, mídia e anti-ban.

## Camada de configuração

A configuração central fica em `src/config/index.ts`, com leitura lazy das variáveis e defaults seguros.

## Variáveis essenciais

### Conexão e identidade

- `WA_CONNECTION_ID`: identificador lógico da instância para particionamento multi-tenant em SQL/Redis.
- `WA_COMMAND_PREFIX`: prefixo global de comandos (default `!`).
- `WA_PRINT_QR`: controla exibição de QR no terminal (`true` por default).

### Persistência

- `MYSQL_URL` ou `WA_DB_URL`: DSN de persistência principal.
- `WA_REDIS_URL`: endpoint de cache distribuído.
- `WA_REDIS_PREFIX`: prefixo de chaves Redis (default `zyra:conexao`).

### Logs e execução

- `LOG_LEVEL`: nível de log (`info`, `debug`, etc.).
- `WA_ACCEPT_OWN_MESSAGES`: aceita mensagens do próprio bot para processamento.
- `WA_IGNORE_STATUS_BROADCAST`: ignora `status@broadcast`.

### Mídia

- `WA_MEDIA_AUTO_DOWNLOAD`: habilita download automático.
- `WA_MEDIA_DOWNLOAD_DIR`: diretório de armazenamento local.
- `WA_MEDIA_MAX_BYTES`: cota máxima local de mídia.
- `WA_MEDIA_RETENTION_DAYS`: retenção em dias.

### Anti-ban e segurança operacional

- `WA_ANTIBAN_ENABLED`
- `WA_ANTIBAN_LOGGING`
- `WA_ANTIBAN_MAX_PER_MINUTE` / `HOUR` / `DAY`
- `WA_ANTIBAN_MIN_DELAY_MS` / `MAX_DELAY_MS`
- `WA_ANTIBAN_DEAF_SESSION_*`
- `WA_ANTIBAN_METRICS_*`

## Padrões recomendados por ambiente

### Desenvolvimento

- `LOG_LEVEL=debug`
- `WA_PRINT_QR=true`
- `WA_MEDIA_AUTO_DOWNLOAD=false` (se quiser reduzir IO)

### Produção

- `LOG_LEVEL=info`
- `WA_PRINT_QR=false` (quando sessão já pareada)
- `WA_MEDIA_AUTO_DOWNLOAD=true` com monitoração de disco
- métricas de anti-ban habilitadas quando houver observabilidade externa

## Exemplo mínimo de `.env`

```env
WA_CONNECTION_ID=default
WA_COMMAND_PREFIX=!
MYSQL_URL=mysql://user:pass@127.0.0.1:3306/zyra
WA_REDIS_URL=redis://127.0.0.1:6379
LOG_LEVEL=info
WA_MEDIA_AUTO_DOWNLOAD=true
WA_MEDIA_DOWNLOAD_DIR=data/media
```

## Estratégia multi-instância

- Utilize `WA_CONNECTION_ID` único por bot/tenant.
- Compartilhe o mesmo cluster MySQL mantendo segregação por `connection_id`.
- Opcionalmente segregue Redis por prefixo adicional.

## Verificação de configuração em runtime

- `npm run db:verify`
- revisão de logs de bootstrap e conexão
- validação de criação de sessão PM2

---

**Zyra Wiki** • Última atualização: 11/05/2026
