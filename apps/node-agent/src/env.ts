import { z } from "zod";

const schema = z.object({
  AGENT_HOST: z.string().default("0.0.0.0"),
  AGENT_PORT: z.coerce.number().int().positive().default(8080),
  AGENT_SHARED_SECRET: z.string().min(32),
  AGENT_NODE_ID: z.string().cuid(),
  CONTROL_PLANE_URL: z.string().url(),
  AGENT_PUBLIC_HOST: z.string().min(1),
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  SERVER_DATA_ROOT: z.string().default("/srv/virgocloud/servers")
});

export const env = schema.parse(process.env);
