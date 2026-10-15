# 1. Build-Stufe (Installiert auch die Build-Tools für native Node-Module)
FROM node:lts-alpine AS build

WORKDIR /app

# Notwendige Build-Tools für Alpine-basierte C++-Erweiterungen (z.B. für knx / modbus)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

# 2. Ausführungs-Stufe (Das finale Image)
FROM node:lts-alpine

WORKDIR /app

# Kopiere die installierten Node-Module aus der Build-Stufe
COPY --from=build /app/node_modules ./node_modules
COPY . .

CMD ["node", "index.js"]