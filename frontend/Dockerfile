# Build context is the repo root (see compose.yaml).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist/client /usr/share/nginx/html
