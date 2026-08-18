# Oracle Always Free: Small VirgoCloud Runner

This guide uses one Ubuntu VM as both the VirgoCloud control plane and the Docker runner. It is intended for a small private server. The VM, Docker services, node agent, and Minecraft containers can remain online after the phone browser and Termux session are closed.

> Oracle documents an Always Free equivalent of **2 OCPUs and 12 GB memory** for Ampere A1 Flex instances, together with **200 GB** of total Always Free block-volume storage in the home region. Availability is not guaranteed, and Oracle may reclaim a VM that stays below its published 7-day CPU, network, and memory-utilization thresholds. Treat this as an eligible free-tier opportunity rather than a service-level guarantee. [1]

## Create the VM and allow only required traffic

In the Oracle console, create an **Always Free eligible Ubuntu** instance in the home region. Select the `VM.Standard.A1.Flex` Arm shape only when the Console labels it Always Free eligible, then allocate a small configuration such as **1 OCPU and 6 GB memory** for one light Java server plus the control plane. Generate and download an SSH key during the instance launch flow. Oracle documents the Linux-instance launch process and recommends network security groups as a virtual-firewall option. [1] [2] [3]

For a small **Java** server, create ingress rules for SSH `TCP 22`, the web panel `TCP 3000`, the API `TCP 4000`, and Minecraft `TCP 25565`. For **Bedrock**, use `UDP 19132` instead of the Java game-port rule. Do not open `5432`, `6379`, `8080`, `9000`, or `9001`; the supplied Compose files bind the internal database, queue, object storage, and node-agent ports away from the public network.

Additional Java servers on the same node use `25566`, `25567`, and so on. Additional Bedrock servers use `19133`, `19134`, and so on. Add an Oracle ingress rule only for a game port that you actually use.

## Install the control plane

From Termux, connect using the private key that Oracle created for the VM:

```bash
chmod 600 ~/oracle_vm.key
ssh -i ~/oracle_vm.key ubuntu@YOUR_ORACLE_PUBLIC_IP
```

On the VM, install Docker and Git, clone the repository, and create the environment file:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo mkdir -p /opt
sudo chown "$USER":"$USER" /opt
cd /opt
git clone https://github.com/darkvirgoyt-beep/VirgoCloud.git
cd VirgoCloud
cp .env.example .env
```

Generate the application secrets without printing them:

```bash
JWT_SECRET_VALUE="$(openssl rand -base64 48 | tr -d '\n')"
ENCRYPTION_KEY_VALUE="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_VALUE}|" .env
sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY_VALUE}|" .env
sed -i 's|^WEB_ORIGIN=.*|WEB_ORIGIN=http://YOUR_ORACLE_PUBLIC_IP:3000|' .env
sed -i 's|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://YOUR_ORACLE_PUBLIC_IP:4000|' .env
unset JWT_SECRET_VALUE ENCRYPTION_KEY_VALUE
```

Replace `YOUR_ORACLE_PUBLIC_IP` locally in the two `sed` commands. Do not send it with secret values to anyone.

Start the control plane and create the database schema:

```bash
docker compose up -d postgres redis minio
docker compose run --rm api pnpm --filter @virgocloud/api prisma:push
docker compose up -d --build
docker compose ps
```

Open `http://YOUR_ORACLE_PUBLIC_IP:3000` on the phone to create the first account. Promote that account to `ADMIN` in PostgreSQL before enrolling the node.

## Enroll the runner on the same VM

Create an admin node through the dashboard using **exactly** this agent URL:

```text
http://node-agent:8080
```

The first creation request returns a node ID and one-time enrollment secret. Save both in `/opt/VirgoCloud/.env.node-agent`:

```dotenv
AGENT_HOST=0.0.0.0
AGENT_PORT=8080
AGENT_NODE_ID=PASTE_NODE_ID
AGENT_SHARED_SECRET=PASTE_ONE_TIME_SECRET
CONTROL_PLANE_URL=http://api:4000
AGENT_PUBLIC_HOST=YOUR_ORACLE_PUBLIC_IP
DOCKER_SOCKET=/var/run/docker.sock
SERVER_DATA_ROOT=/srv/virgocloud/servers
```

Start the internal node agent. It joins the same private Docker network as MinIO, allowing signed backup URLs containing the internal `minio` hostname to work without making MinIO public.

```bash
docker compose -f deploy/node-agent.compose.yml up -d --build
docker compose -f deploy/node-agent.compose.yml ps
```

The runner reports its health every 30 seconds. Once the dashboard shows the node as online, create a Minecraft server and leave its desired state set to **Keep online**.

## Backups and recovery

The worker stores backup metadata in PostgreSQL and uses MinIO for archive data. The node agent builds a `.tar.gz` archive under the server’s scoped data root, uploads it through a short-lived signed URL, and restores it through a short-lived download URL. Configure a six-hour interval and a retention count from the Backups view. Backups, recovery, and restart reconciliation are worker jobs; they do not rely on an open browser.

For a production public server, place a TLS reverse proxy in front of the panel and API before allowing outside users to sign in. Keep the shown development ports restricted to your own network while you learn the setup.

## References

[1] [Oracle Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

[2] [Oracle: launch your first Linux instance](https://docs.oracle.com/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm)

[3] [Oracle security lists](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm)
