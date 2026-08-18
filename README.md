# VirgoCloud

**VirgoCloud** is a standalone Minecraft hosting control plane. It provides a dark, responsive web dashboard for user accounts, Java and Bedrock provisioning, server lifecycle actions, live console interaction, scoped terminal and file operations, S3-compatible world backups, resource visibility, runner enrollment, and role-gated administration.

The repository intentionally runs independently of Manus hosting. You can run the control plane with Docker Compose and deploy one or more Docker-capable node agents on infrastructure you operate.

## Architecture

```text
Browser (Next.js control room)
          │ JWT / WebSocket
          ▼
Fastify control-plane API ── PostgreSQL + Redis + S3/MinIO
          │ HMAC-signed request per enrolled node
          ▼
Docker node agent ── isolated Minecraft containers and per-server data roots
```

| Component | Responsibility | Scaling boundary |
| --- | --- | --- |
| `apps/web` | Mobile-first dashboard, server wizard, console, file manager, backup and admin interfaces. | Stateless; deploy behind any Node-compatible web runtime. |
| `apps/api` | JWT/API authorization, RBAC, ownership checks, node registry, worker orchestration, audit records, and presigned backup URLs. | Horizontally scalable with shared PostgreSQL and Redis. |
| `apps/node-agent` | Docker container lifecycle, container-scoped logs and safe terminal commands, local server-file access, backup/restore handoff, and host metrics. | Deploy one instance per runner host. |
| PostgreSQL | Durable users, servers, limits, nodes, metrics, schedules, backup metadata, and audit trail. | Managed PostgreSQL is recommended in production. |
| Redis | Durable BullMQ provisioning, backup, and retention jobs. | Use a managed, password-protected Redis service in production. |
| S3/MinIO | World archive bytes. The control plane stores only the object key and metadata. | Use versioning/lifecycle rules in production. |

## What is implemented

The control plane implements email/password accounts with bcrypt-hashed passwords and JWT sessions, Google ID-token sign-in support when a verified client ID is configured, two roles (`USER`, `ADMIN`), resource limits, server ownership enforcement, a server creation workflow for Java and Bedrock editions, lifecycle actions, a WebSocket console, a container-scoped safe terminal, editable server files, binary file upload, backup scheduling, restore handoff, retention cleanup, node health reporting, node enrollment, audit logs, and administrator views.

> **Important:** The control plane can run locally without game hardware, but server creation requires at least one separately deployed Docker node agent. This separation allows you to add local machines, cloud VMs, Docker hosts, or future provider adapters without coupling game execution to the dashboard.

## Quick start

### 1. Prepare the control plane

```bash
git clone https://github.com/darkvirgoyt-beep/VirgoCloud.git
cd VirgoCloud
cp .env.example .env
```

Set production-grade `JWT_SECRET` and `ENCRYPTION_KEY` values in `.env`. For local development, the included compose stack starts PostgreSQL, Redis, and MinIO. Install dependencies and apply the database schema:

```bash
corepack enable
pnpm install
pnpm db:push
./scripts/start.sh
```

Open `http://localhost:3000`, create your first account, and promote it to admin with your database administration tool:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
```

### 2. Enroll a runner

From **Runner nodes** in the admin center, add the HTTPS URL of your node agent. VirgoCloud displays an enrollment secret once. Copy the generated node ID and secret into a runner-local `.env.node-agent` file:

```dotenv
AGENT_HOST=0.0.0.0
AGENT_PORT=8080
AGENT_SHARED_SECRET=<shown-once-in-the-dashboard>
AGENT_NODE_ID=<node-id-from-api-response-or-database>
CONTROL_PLANE_URL=https://control.example.com
AGENT_PUBLIC_HOST=games.example.com
DOCKER_SOCKET=/var/run/docker.sock
SERVER_DATA_ROOT=/srv/virgocloud/servers
```

On the runner, clone this repository and run:

```bash
docker compose -f deploy/node-agent.compose.yml up -d --build
```

The agent reports its capacity every 30 seconds. Once its status becomes `ONLINE`, users with sufficient limits can create a server. The runner requires Docker access and a durable data volume; do not run it in the same untrusted environment as arbitrary customer workloads.

## Backup model

Each server can have an interval and retention count. The API saves this policy and creates a durable repeat job in Redis. The worker requests the runner to create a compressed archive, then hands the runner a short-lived S3-compatible upload URL. Restore follows the reverse flow: the worker issues a short-lived download URL and the runner stops the target container briefly before extracting within that server’s data root. The stack ships with MinIO for local testing but works with S3-compatible services by changing `S3_*` values.

Manual backup can be called from the dashboard or with:

```bash
./scripts/backup.sh <server-id> <jwt-token>
```

## Autonomous 24/7 operation

Creating a server sets its desired state to **RUNNING**. The provisioning worker automatically starts the container; the browser terminal is only an on-demand interface for viewing logs and sending approved commands. It is not a process that must stay open.

The runner creates every Minecraft container with Docker's `unless-stopped` restart policy. A game process that crashes is restarted by Docker, and a runner host reboot restores every server that was not explicitly stopped. In addition, the control-plane worker performs a signed reconciliation pass each minute: it asks online runners to start containers whose persisted desired state is `RUNNING`.

| Dashboard action | Durable intent | Effect after a crash or runner reboot |
| --- | --- | --- |
| **Start / Keep online** | `RUNNING` | The runner starts it now and continuously attempts to keep it online. |
| **Restart** | `RUNNING` | The runner restarts it and preserves automatic recovery. |
| **Kill** | `RUNNING` | Docker's restart policy and the worker reconciliation restore it. |
| **Stop / disable** | `STOPPED` | The runner stops it and it remains stopped until Start is selected again. |

For this to work continuously, run the control-plane Compose stack and the separate runner Compose stack with Docker restart policies enabled on machines that stay powered on. The browser can be closed at any time.

If you are upgrading an existing installation, apply the new durable desired-state column before restarting the worker:

```bash
pnpm db:push
```

## Development

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the web interface and API in development mode. |
| `pnpm dev:agent` | Run a node agent locally after configuring runner variables. |
| `pnpm db:push` | Create or synchronize a fresh development database from the schema. |
| `pnpm db:migrate` | Create and apply a named Prisma migration after making a schema change. |
| `pnpm test` | Run contract and security-oriented unit tests. |
| `pnpm typecheck` | Check all workspace TypeScript projects. |
| `pnpm build` | Build the web, API, agent, and shared contracts. |

## Deployment notes

Run the API worker as a separate long-lived service alongside the API; it owns asynchronous provisioning, backups, and retention cleanup. Use a reverse proxy for TLS and set `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` to their public values. In production, run Postgres, Redis, and S3/MinIO with persistent encrypted storage and access controls. The node agent should be reachable only from the control plane network and must not be exposed to browsers.

Review [SECURITY.md](./SECURITY.md) before allowing public sign-ups or running third-party plugins/mods.
