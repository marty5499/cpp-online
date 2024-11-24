# 基礎映像
FROM node:16

# 安裝 C++ 編譯器
RUN apt-get update && \
    apt-get install -y g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 設置工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 安裝依賴
RUN npm install

# 複製源代碼
COPY . .

# 創建程式碼執行目錄
RUN mkdir -p /tmp/cpp_runner

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "server.js"]
