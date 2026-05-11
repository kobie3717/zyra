# Zyra Wiki

[Home](Home) | [Instalação](Instalação) | [Configuração](Configuração) | [Comandos](Comandos) | [Banco-de-Dados](Banco-de-Dados) | [Produção](Produção) | [Troubleshooting](Troubleshooting)

Bem-vindo à Wiki do **Zyra**.

O Zyra é um bot para WhatsApp focado em **automação, moderação, observabilidade e persistência de dados**.
Ele usa Baileys como base de conexão e oferece uma arquitetura pronta para crescer com comandos, eventos e integrações.

## Índice Técnico (TOC)

- [O que é o projeto](#o-que-e-o-projeto)
- [Para que pode ser usado](#para-que-pode-ser-usado)
- [Mapa por perfil](#mapa-por-perfil)
- [Arquitetura (visão rápida)](#arquitetura-visao-rapida)
- [Requisitos](#requisitos)
- [Quickstart](#quickstart)
- [Mapa de documentação](#mapa-de-documentacao)

## O que é o projeto

O Zyra é uma aplicação Node.js/TypeScript que:

- conecta sessões WhatsApp com suporte a multi-dispositivo
- processa eventos em tempo real (mensagens, grupos, reações, mídia e sistema)
- persiste dados em MySQL e Redis (com fallback local)
- disponibiliza estrutura de comandos para funcionalidades de bot
- inclui mecanismos de estabilidade operacional (logs, reconexão, backfill, PM2)

## Para que pode ser usado

Você pode usar o Zyra para:

- **Atendimento e automação**: respostas automáticas, comandos utilitários e fluxos internos
- **Moderação de grupos**: anti-link, controle de participantes e ações administrativas
- **Observabilidade e auditoria**: trilha de eventos, histórico de mensagens e diagnóstico
- **Inteligência operacional**: base de dados para métricas, relatórios e análise de uso
- **Plataforma de extensão**: criação de novos comandos e integrações customizadas

## Mapa por perfil

### Trilha Dev

- Comece por: [Instalação](Instalação)
- Em seguida: [Configuração](Configuração)
- Depois: [Comandos](Comandos) e [Eventos](Eventos)

Objetivo da trilha: onboarding de desenvolvimento, criação de comandos e entendimento do pipeline de eventos.

### Trilha SRE / Infra

- Comece por: [Produção](Produção)
- Em seguida: [Banco-de-Dados](Banco-de-Dados)
- Depois: [Backfill](Backfill) e [Troubleshooting](Troubleshooting)

Objetivo da trilha: operação estável, deploy seguro, monitoramento, recuperação e manutenção contínua.

### Trilha Operação / Suporte

- Comece por: [Troubleshooting](Troubleshooting)
- Em seguida: [Backfill](Backfill)
- Depois: [Persistência](Persistência)

Objetivo da trilha: diagnóstico rápido de incidentes, reconciliação de dados e correções operacionais.

## Arquitetura (visão rápida)

- `src/events` -> assinatura e tratamento dos eventos do WhatsApp
- `src/router` e `src/commands` -> roteamento e execução de comandos
- `src/store` -> persistência (SQL/Redis/cache)
- `src/core` -> runtime, conexão, banco e infraestrutura
- `docs` -> modelo de banco e documentação auxiliar

## Requisitos

- Node.js (LTS)
- MySQL 8+
- Redis (opcional, recomendado)
- PM2 (opcional, recomendado para produção)

## Quickstart

1. Configurar variáveis de ambiente no `.env`
2. Inicializar schema: `npm run db:init`
3. Rodar em dev: `npm run dev`
4. Produção com PM2: `npm run pm2:start`

## Mapa de documentação

- Setup: [Instalação](Instalação), [Configuração](Configuração)
- Runtime: [Comandos](Comandos), [Eventos](Eventos)
- Dados: [Banco-de-Dados](Banco-de-Dados), [Persistência](Persistência)
- Operação: [Produção](Produção), [Backfill](Backfill), [Troubleshooting](Troubleshooting)

---

**Zyra Wiki** • Última atualização: 11/05/2026

[Home](Home) | [Instalação](Instalação) | [Configuração](Configuração) | [Comandos](Comandos) | [Banco-de-Dados](Banco-de-Dados) | [Produção](Produção) | [Troubleshooting](Troubleshooting)
