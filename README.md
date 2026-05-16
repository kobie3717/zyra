# 🌌 Zyra System

**Zyra System** is a high-performance WhatsApp bot engine built on Node.js using the [Baileys](https://github.com/WhiskeySockets/Baileys) library. It is designed to be **scalable, resilient, and multi-instance**, with native support for MySQL persistence and Redis caching.

---

## 🚀 Key Features

- **Native Multi-Instance:** Use the same database for hundreds of isolated connections via `connection_id`.
- **Hybrid Persistence:** Smart authentication system that switches between **MySQL**, **Redis**, and **Disk** (FileSystem) for maximum resilience.
- **Unified Identity:** Intelligent user mapping (PN, LID, JID, Username) to a single internal ID.
- **High-Performance Store:** Contacts, chats, and message cache optimized for low latency.
- **Modular Command Architecture:** Commands decoupled from the core with their own context and ready-to-use core functions (see [README-COMMANDS.md](docs/README-COMMANDS.md)).
- **Full Observability:** Structured logs and event tracking for auditing and troubleshooting.

---

## 📋 Prerequisites

- **Node.js:** v20.x (LTS) or higher.
- **Package Manager:** `npm` or `yarn`.
- **Database:** MySQL 8.0+ (required for long-term persistence).
- **Cache:** Redis 6.0+ (highly recommended for performance).

---

## 🛠️ Dependency Installation

### 1. MySQL Server
Zyra uses modern MySQL 8 features (such as JSON types and Full-text indexes).

**On Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server -y
# Access MySQL and create the database
sudo mysql -u root
# CREATE DATABASE zyra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Redis Server
Redis is used as a "hot cache" for authentication sessions and temporary socket states.

**On Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable redis-server
```

---

## ⚙️ Project Configuration

1. **Clone and Install:**
   ```bash
   git clone <repo-url>
   cd zyra
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. **Initialize the Database:**
   Zyra includes an automatic script that creates all required tables:
   ```bash
   npm run db:init
   ```

---

## 🚦 Running the Bot

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run start:prod
```

### Production with PM2
```bash
npm run pm2:start
```

When started via PM2, the system launches two processes:
- `zyra`: main bot.
- `zyra-backfill`: continuous database backfill worker.

Useful commands:

- `npm run pm2:restart`: recompiles and restarts the ecosystem processes (`zyra` and `zyra-backfill`).
- `npm run pm2:logs`: streams logs from `zyra` and `zyra-backfill`.
- `npm run pm2:stop`: stops `zyra` and `zyra-backfill` without removing them.
- `npm run pm2:delete`: removes `zyra` and `zyra-backfill` from PM2.
- `npm run pm2:save`: saves the current process list for automatic restoration.
- `npm run pm2:startup`: generates the PM2 auto-start command for server boot.

Recommended flow to keep the bot running across reboots:

```bash
npm run pm2:start
npm run pm2:save
npm run pm2:startup
```

---

## 🧠 System Architecture

### Authentication Flow (Multi-Layer)
Credentials are resolved in the following priority order:
1. **Redis:** Ultra-fast access for active sessions.
2. **MySQL:** Durable, shared persistence.
3. **Disk:** Local fallback in case of network failure.

### Memory Management and History
The history-sync policy (`history-sync.ts`) is optimized to allow a full sync only on new logins, avoiding excessive memory and CPU usage during fast reconnections.

---

## 🛠️ Maintenance Tools

The project includes utility scripts for advanced operations:

- **`npm run db:verify`**: Verifies table integrity and counts records per connection.
- **`npm run db:delete-session`**: Clears all data for a specific session (MySQL and Redis).
- **`npm run db:backfill`**: Processes old or pending messages in the database.
- **`npm run db:nulls`**: Generates reports of inconsistent fields for cleanup.

---

## 🤝 Contributors

- **@kaikybrofc** — project maintainer.
- **@kobie3717** — [`baileys-antiban`](https://github.com/kobie3717/baileys-antiban) integration.

---

## 📘 Code of Conduct

This project follows a code of conduct for responsible collaboration and platform use:
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 kaikybrofc
