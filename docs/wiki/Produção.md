# Produção

[Home](Home) | [Instalação](Instalação) | [Troubleshooting](Troubleshooting)

## Modelo de execução

O ambiente produtivo recomendado usa PM2 com dois processos do ecossistema:

- `zyra`: processo principal
- `zyra-backfill`: worker contínuo de reconciliação de dados

## Fluxo de deploy

```bash
git pull
npm install
npm run pm2:restart
```

`pm2:restart` já recompila (`npm run build`) e reinicia os serviços.

## Comandos operacionais

- `npm run pm2:start`
- `npm run pm2:restart`
- `npm run pm2:logs`
- `npm run pm2:stop`
- `npm run pm2:delete`
- `npm run pm2:save`
- `npm run pm2:startup`

## Health checklist

- processos `online` no PM2
- build TypeScript sem erro
- conexão MySQL ativa
- latência Redis aceitável (se habilitado)
- logs sem burst de exceção

## Rotinas recomendadas

- backup diário do MySQL
- retenção e rotação de logs
- auditoria de restart count no PM2
- revisão periódica de uso de disco (`data/media`)

## Atualização do daemon PM2

Quando houver aviso de versão em memória desatualizada:

```bash
pm2 update
```

## Hardening mínimo

- executar atrás de firewall
- usar usuário não-root quando possível
- restringir permissões do `.env`
- monitorar porta/host de métricas

---

**Zyra Wiki** • Última atualização: 11/05/2026
