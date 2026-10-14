# Build from the repository root so the shared planner is included:
#   docker build -f backend/Dockerfile .
FROM node:24-slim AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY shared /app/shared
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
EXPOSE 8080
CMD ["node", "dist/backend/src/server.js"]
