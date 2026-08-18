import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(12).max(128), name: z.string().trim().min(2).max(80).optional() });
const loginSchema = signupSchema.pick({ email: true, password: true });
const googleSchema = z.object({ idToken: z.string().min(32) });

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists) return reply.code(409).send({ message: "An account with that email already exists." });
    const user = await prisma.user.create({
      data: { email: input.email.toLowerCase(), name: input.name, passwordHash: await bcrypt.hash(input.password, 12), limit: { create: {} } }
    });
    const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: "8h" });
    return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) return reply.code(401).send({ message: "Invalid email or password." });
    const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: "8h" });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  app.post("/v1/auth/google", async (request, reply) => {
    const { idToken } = googleSchema.parse(request.body);
    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!infoResponse.ok) return reply.code(401).send({ message: "Google token is invalid." });
    const info = await infoResponse.json() as { aud?: string; sub?: string; email?: string; name?: string; email_verified?: string };
    if (!process.env.GOOGLE_CLIENT_ID || info.aud !== process.env.GOOGLE_CLIENT_ID || !info.sub || !info.email || info.email_verified !== "true") return reply.code(401).send({ message: "Google account could not be verified." });
    const user = await prisma.user.upsert({
      where: { email: info.email.toLowerCase() },
      create: { email: info.email.toLowerCase(), name: info.name, googleSub: info.sub, limit: { create: {} } },
      update: { googleSub: info.sub, name: info.name ?? undefined }
    });
    const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: "8h" });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });
}
