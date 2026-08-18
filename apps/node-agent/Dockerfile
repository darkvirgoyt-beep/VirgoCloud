FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tar
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/node-agent/package.json apps/node-agent/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/node-agent apps/node-agent
RUN pnpm --filter @virgocloud/node-agent build
EXPOSE 8080
CMD ["pnpm", "--filter", "@virgocloud/node-agent", "start"]
