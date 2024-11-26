docker ps -a | grep cpp-online | awk '{print $1}' | xargs -r docker stop

# 删除旧镜像
docker rmi cpp-online:latest -f

# 重新构建镜像
docker build -t cpp-online .

# 确保临时目录存在并有正确权限
mkdir -p tmp
chmod 777 tmp