FROM gcc:12

# 創建工作目錄
WORKDIR /workspace

# 添加鏡像源並安裝必要工具
RUN echo "deb http://deb.debian.org/debian bookworm main" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security bookworm-security main" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main" >> /etc/apt/sources.list && \
    apt-get update --allow-insecure-repositories && \
    apt-get install -y --allow-unauthenticated --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

# 設置工作目錄權限
RUN chmod 777 /workspace

# 保持 root 用戶以便使用動態 UID
USER root

CMD ["bash"]
