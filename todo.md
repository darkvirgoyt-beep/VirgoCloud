# Project TODO

- [x] Create the standalone monorepo structure and development configuration.
- [x] Implement the API control plane with role-aware authentication and validation.
- [x] Model server, node, file, backup, schedule, audit, metrics, and limit records through Prisma.
- [x] Implement server lifecycle, terminal, file-management, node, backup, and administration APIs.
- [x] Implement a Docker-capable node agent with signed requests and strict per-server container scope.
- [x] Implement configurable backups, S3-compatible archive storage, retention cleanup, and restore handoff.
- [x] Create the responsive dark-glass web dashboard, server wizard, control panel, terminal, file manager, backup manager, node monitor, and admin panel.
- [x] Add standalone Docker Compose, environment templates, setup scripts, CI workflow, and deployment documentation.
- [x] Write and run automated unit tests, type checks, linting, and production builds.
- [x] Commit all source files and provide the completed GitHub repository link.
- [x] Add desired server-state persistence, automatic container restarts, host-reboot recovery, and a browser-terminal-only-on-demand model.
- [x] Test, document, commit, and publish the autonomous 24/7 operation update.
- [x] Add restart policies to all control-plane services so the web UI, API, worker, database, queue, and storage restart after a host reboot.
- [x] Change the GitHub repository visibility to public and verify anonymous read access.
- [x] Confirm the required always-on hosting boundary for browser-independent Minecraft operation and identify any remaining deployment automation work; existing automatic restart and recovery features already cover the application side.
- [x] Evaluate free control-plane, database, and storage options while documenting why they cannot replace persistent Minecraft compute.
