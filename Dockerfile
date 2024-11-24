FROM gcc:latest

# 创建工作目录
WORKDIR /workspace

# 安装必要的工具
RUN apt-get update && \
    apt-get install -y g++ && \
    rm -rf /var/lib/apt/lists/*

# 设置工作目录权限
RUN chmod 777 /workspace

# 保持 root 用户以便使用动态 UID
USER root

CMD ["bash"]
