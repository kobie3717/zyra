# Troubleshooting

[Home](Home) | [Produção](Produção) | [Backfill](Backfill)

## Diagnóstico rápido (ordem recomendada)

1. `npm run build`
2. `npm run db:verify`
3. `npm run pm2:logs`
4. checar `logs/erro-*.log` e `logs/aviso-*.log`

## Cenários comuns

### 1. Wiki ou features não aparecem no GitHub

- validar flag via API
- inicializar recurso manualmente no UI quando necessário

### 2. PM2 com aviso de versão em memória

Sintoma:

- “In-memory PM2 is out-of-date”

Ação:

```bash
pm2 update
```

### 3. Falha de schema ou tabela ausente

Ação:

```bash
npm run db:init
npm run db:verify
```

### 4. Lacunas em metadados de mídia

- habilitar `WA_MEDIA_AUTO_DOWNLOAD`
- rodar `npm run db:backfill`
- validar `message_media` após ciclo

### 5. Nulos altos em `users.display_name` / `chats.display_name`

Sintoma:

- `users.display_name` e `chats.display_name` acima do esperado no relatório de nulos.

Ações:

```bash
npm run db:backfill
npm run db:nulls
```

Verifique se os passos críticos reduziram:

- `users.display_name(contacts|chats|aliases)`
- `chats.display_name(groups|contacts|users|newsletters)`

Se os nulos voltarem a subir após ingestão online, valide se a versão em produção já contém a correção de `setChat` que preserva `display_name` quando update chega nulo.

### 6. Sessão desconectando / não estabiliza

- revisar credenciais e autenticação
- validar Redis/MySQL conectividade
- verificar políticas anti-ban agressivas

### 7. Comando não responde

- conferir prefixo (`WA_COMMAND_PREFIX`)
- validar evento `messages.upsert` tipo `notify`
- revisar erro no processor/runtime

## Consultas úteis de suporte

- pendências de mídia: `file_length`/`file_name` nulos
- contagem de mensagens por conexão
- inconsistências de `sender_user_id`

## Boas práticas preventivas

- manter build/lint no deploy
- observar logs após restart
- registrar mudanças de config por ambiente
- executar backfill de forma controlada

---

**Zyra Wiki** • Última atualização: 15/05/2026
