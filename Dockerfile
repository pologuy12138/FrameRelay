FROM node:20-alpine

WORKDIR /app

# 只复制依赖配置文件，利用 Docker 缓存层
COPY package.json package-lock.json* ./
RUN npm install --production

# 复制源码
COPY server.js .
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
