FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./

FROM base AS build
RUN npm install
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["node", "dist/server/entry.mjs"]
