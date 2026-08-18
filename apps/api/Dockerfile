FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --no-frozen-lockfile
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @virgocloud/api build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app
EXPOSE 4000
CMD ["pnpm", "--filter", "@virgocloud/api", "start"]
