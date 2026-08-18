# Security Model

VirgoCloud separates the **control plane** from the **runner plane**. The web/API stack stores ownership, policy, metadata, and audit events; a separately deployed node agent is the only process granted Docker-socket access. The control plane never grants a browser direct access to Docker, the host filesystem, or an S3 credential.

| Boundary | Enforcement |
| --- | --- |
| User → API | JWT verification, user/admin role checks, ownership queries on every server resource, and Zod request validation. |
| API → node agent | Per-node secret encrypted at rest, HMAC-signed requests with a 60-second replay window, and HTTPS-required agent URLs except localhost development. |
| Agent → Docker | Strict managed-container name pattern, `virgocloud.serverId` label match, resource limits, dropped Linux capabilities, `no-new-privileges`, PID limits, and per-server bind mounts. |
| File access | User-controlled paths must be relative, cannot contain `..` or backslashes, and resolve only inside `/srv/virgocloud/servers/<server-id>`. |
| Backups | Node agent uploads or downloads through short-lived object-storage URLs. Archive metadata, not the object bytes, is stored in PostgreSQL. |

## Production requirements

Use TLS in front of both the control plane and each node agent, set a unique 32-byte-or-larger `JWT_SECRET`, generate `ENCRYPTION_KEY` with `openssl rand -hex 32`, and store `.env` only in your deployment secret manager. Restrict the runner agent ingress to the control-plane network where possible. The generated node enrollment secret is intentionally shown once; rotate a node by replacing its encrypted secret and restarting that agent.

The included terminal is deliberately **not a general host shell**. It permits selected read-only commands inside the Minecraft container and directs configuration edits through the scoped file manager. Treat plugin and mod uploads as untrusted executable content: review them, scan them, and apply your own moderation policy before enabling them for public customers.
