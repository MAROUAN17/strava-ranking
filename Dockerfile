FROM node:20-bookworm AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install --include=dev
RUN npm --prefix client install --include=dev

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/.env.example ./.env.example

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
