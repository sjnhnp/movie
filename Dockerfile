# 使用一个轻量级的 Node.js 镜像作为基础
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
COPY package.json ./

# 安装依赖
# 在复制全部代码之前安装依赖，可以利用 Docker 的层缓存机制
RUN npm install

# 复制所有项目文件到工作目录
COPY . .

# 暴露应用程序运行的端口
EXPOSE 8080

# 设置环境变量的默认值 (可以在 docker run 或 docker-compose 中覆盖)
ENV PORT=8080
ENV PASSWORD=""
ENV SETTINGS_PASSWORD=""

# 容器启动时运行的命令
CMD ["node", "server.js"]