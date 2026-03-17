FROM node:20-bookworm AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install
RUN npm --prefix client install

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/data ./data
COPY --from=build /app/.env.example ./.env.example

EXPOSE 3000

CMD ["npm", "start"]
