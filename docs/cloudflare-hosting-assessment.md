# Cloudflare Hosting Assessment

Cloudflare can support selected **control-plane** elements of a lightweight product, such as a static dashboard, request-driven APIs, a small SQL database, and backup-object storage. It cannot replace the persistent, Docker-capable runner required to execute a Minecraft Java or Bedrock server.

| Service | Suitable VirgoCloud use | Relevant free-tier constraint | Why it cannot replace the runner |
| --- | --- | --- | --- |
| Workers / Pages | Static web UI, authentication edge routes, request-driven API facade | Workers Free permits 100,000 requests/day, 10 ms CPU per request, and 128 MB memory per isolate. | A Minecraft process needs a long-lived JVM or Bedrock runtime, game-port listener, files, CPU, and RAM—not request-scoped JavaScript. |
| D1 | Small control-plane metadata: accounts, server intent, node records, backups metadata | Free allocation is 500 MB per database and 5 GB per account. D1 has SQLite—not MySQL—SQL semantics. | It stores records; it does not run a game process. |
| R2 | World archives and backup objects | Free allocation is 10 GB-month storage, 1M Class A, and 10M Class B operations per month. | It stores backup bytes; it does not execute Minecraft. |

Cloudflare documents that an HTTP Worker can continue only while the client remains connected and may be terminated during runtime maintenance; even `waitUntil()` extends work only briefly after the response completes. Its Workers TCP-socket API creates **outbound** TCP connections and the documentation states that inbound TCP connections to a Worker are not currently possible. This makes Workers unsuitable for a permanent Minecraft process or a Minecraft game-port listener. The Workers Free plan's CPU and memory ceilings are also far below the needs of a Minecraft server.

## Practical no-cost architecture

The closest no-cost arrangement is to host only a **website/control panel** on Cloudflare and keep Minecraft off the platform. A real, always-on host is still required for the node agent and game container. If no PC, VPS, or other persistent Docker host exists, the user can use a managed Minecraft host instead—but that host will be responsible for game execution rather than VirgoCloud.

## Possible free runner: Oracle Cloud Always Free

Oracle documents an Always Free ARM VM allowance equivalent to **2 OCPUs and 12 GB memory**, plus 200 GB of block-volume capacity, in an account's home region. This could be a workable small runner for a lightweight Minecraft server if capacity is available and if the selected Minecraft image supports the chosen architecture.

It is not a guaranteed production 24/7 service: Oracle reports that free shapes can be temporarily unavailable, and it may reclaim an Always Free compute instance when CPU, network, and—on A1—memory utilization are all below 20% over a seven-day period. Oracle's Free Tier FAQ also says signup uses payment-card details for identity verification and that accounts idle for 30 days or more may be suspended or terminated. Treat this as a free learning or small private-server option, not a guaranteed no-cost commercial hosting commitment.

OCI's documented launch flow creates a public VCN/subnet, instance, and SSH key. For a public Minecraft deployment, its network security group or security list needs explicit ingress rules for only the required ports. On Ubuntu OCI images, Oracle documents that port access requires both the OCI virtual-firewall rule and an applicable host `iptables` rule; UFW is disabled by default and discouraged in that environment. Keep SSH open while adding any host firewall rule to avoid losing administration access.

## Sources

1. [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
2. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
3. [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
4. [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
5. [Cloudflare D1 overview](https://developers.cloudflare.com/d1/)
6. [Cloudflare Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
7. [Oracle Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
8. [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)
9. [Oracle: Launching your first Linux instance](https://docs.oracle.com/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm)
10. [Oracle: Security lists](https://docs.oracle.com/iaas/Content/Network/Concepts/securitylists.htm)
11. [Oracle: Enabling Ubuntu network traffic](https://blogs.oracle.com/developers/enabling-network-traffic-to-ubuntu-images-in-oracle-cloud-infrastructure)
