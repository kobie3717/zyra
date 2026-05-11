# Instalação

[Home](Home) | [Configuração](Configuração) | [Produção](Produção)

## Objetivo

Este guia cobre a instalação do Zyra em ambiente Linux com foco em previsibilidade, repetibilidade e validação técnica do setup.

## Requisitos de runtime

- Node.js 20+ (LTS recomendado)
- npm 10+
- MySQL 8.0+
- Redis 6.0+ (opcional, porém recomendado)
- Git

## Dependências do projeto

- Base de execução: TypeScript + TSX
- Engine WhatsApp: `@whiskeysockets/baileys`
- Persistência SQL: `mysql2`
- Cache distribuído: `redis`
- Gerência de processo: `pm2`

## Provisionamento do host (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

### Node.js

```bash
# Exemplo com nvm
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v
npm -v
```

### MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql -e "CREATE DATABASE IF NOT EXISTS zyra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
```

## Instalação do projeto

```bash
git clone https://github.com/kaikybrofc/zyra.git
cd zyra
npm install
```

## Configuração inicial

```bash
cp .env.example .env
# editar .env
```

Variáveis mínimas para primeira subida:

- `MYSQL_URL`
- `WA_CONNECTION_ID`
- `WA_COMMAND_PREFIX` (opcional)
- `WA_REDIS_URL` (opcional)

## Inicialização de schema

```bash
npm run db:init
```

O init cria tabelas ausentes com base no modelo (`docs/exemplodbmodel.md`) e garante índices críticos usados pelas rotas de leitura/escrita.

## Validação técnica pós-instalação

```bash
npm run lint
npm run build
npm test
```

## Primeira execução

```bash
npm run dev
```

Com o processo ativo, acompanhe logs e faça o pareamento da sessão WhatsApp via QR code.

## Checklist de aceite

- App inicia sem erro de import/compilação
- Conexão com MySQL validada
- Tabelas criadas com sucesso
- Processo consegue receber evento `messages.upsert`
- Logs são gravados em `logs/`

---

**Zyra Wiki** • Última atualização: 11/05/2026
