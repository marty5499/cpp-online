FROM node:18-buster

# 安裝 C++ 編譯工具和 GPG
RUN apt-get update --allow-insecure-repositories && \
    apt-get install -y --allow-unauthenticated gnupg dirmngr g++ && \
    rm -rf /var/lib/apt/lists/*

# 創建工作目錄
WORKDIR /app

# 複製依賴描述檔並安裝依賴
COPY package*.json ./
RUN npm install

# 複製代碼
COPY . .

# 創建臨時目錄並設置權限
RUN mkdir -p /app/tmp && \
    mkdir -p /app/tmp/output && \
    chmod -R 777 /app/tmp && \
    chmod -R 777 /app && \
    chown -R node:node /app

# 設置環境變量
ENV COMPILE_OUTPUT_DIR=/app/tmp/output

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "server.js"]
