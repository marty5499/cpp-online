#!/bin/bash

# 停止並移除已存在的容器（如果有的話）
docker rm -f cpp-online 2>/dev/null || true

# 運行新的容器
docker run \
  --name cpp-online \
  -p 3000:3000 \
  -v $(pwd):/app \
  --restart unless-stopped \
  cpp-online:latest

echo "容器已啟動，可以通過 http://localhost:3000 訪問應用"
