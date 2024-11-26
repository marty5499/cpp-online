#!/bin/bash

# Registry URL 設定
registry_url="nest.webduino.tw/cpp-online:latest"

while true; do
    # 顯示選單
    echo "請選擇操作："
    echo "1. 建構映像檔 (AMD64)"
    echo "2. 推送到 ($registry_url)"
    echo "3. 執行容器"
    echo "4. 退出"
    read -p "請輸入選項 (1-4): " choice

    # 停止所有相關容器
    docker ps -a | grep cpp-online | awk '{print $1}' | xargs -r docker stop

    case $choice in
        1)
            # 刪除舊映像檔
            docker rmi cpp-online:latest -f

            # 重新建構映像檔，指定 AMD64 平台
            DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t cpp-online .

            # 確保臨時目錄存在並有正確權限
            mkdir -p tmp/output
            chmod -R 777 tmp
            
            echo "AMD64 架構映像檔建構完成"
            ;;
        2)
            docker tag cpp-online:latest $registry_url
            docker push $registry_url
            echo "映像檔已推送到 $registry_url"
            ;;
        3)
            echo "執行容器..."
            # 停止並移除已存在的容器（如果有的話）
            docker rm -f cpp-online 2>/dev/null || true

            # 運行新的容器
            docker run \
              --name cpp-online \
              -p 3000:3000 \
              -v $(pwd):/app:rw \
              --restart unless-stopped \
              --user root \
              --cap-add=SYS_ADMIN \
              cpp-online:latest

            echo "容器已啟動，可以通過 http://localhost:3000 訪問應用"
            ;;
        4)
            echo "退出程序"
            exit 0
            ;;
        *)
            echo "無效的選項"
            ;;
    esac
    
    echo -e "\n按 Enter 鍵繼續..."
    read
    clear
done