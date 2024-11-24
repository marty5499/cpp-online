const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 存储WebSocket连接
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(clientId, ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'input') {
            const process = clients.get(data.processId);
            if (process && process.stdin) {
                process.stdin.write(data.input + '\n');
            }
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
    });

    // 发送clientId给客户端
    ws.send(JSON.stringify({ type: 'init', clientId }));
});

// 修改编译和执行C++代码的函数
async function compileCpp(code, clientId) {
    const id = uuidv4();
    const workDir = path.resolve(__dirname, 'tmp', id);
    const sourceFile = path.join(workDir, 'main.cpp');
    const ws = clients.get(clientId);

    try {
        // 创建工作目录并设置权限
        await fs.mkdir(workDir, { recursive: true });
        await fs.chmod(workDir, 0o777);
        
        // 写入源代码文件并设置权限
        await fs.writeFile(sourceFile, code, 'utf8');
        await fs.chmod(sourceFile, 0o666);

        if (debug) {
            console.log('工作目录:', workDir);
            console.log('源文件:', sourceFile);
            console.log('源代码:', code);
            
            // 检查文件是否存在
            const files = await fs.readdir(workDir);
            console.log('目录内容:', files);
        }

        return new Promise((resolve, reject) => {
            // 修改 Docker 命令，使用绝对路径并添加调试信息
            const dockerCmd = `docker run --rm -i \
                -v "${workDir}:/workspace" \
                -w /workspace \
                -u root \
                cpp-runner:latest \
                bash -c "ls -la && pwd && g++ main.cpp -o program && ./program"`;
            
            if (debug) {
                console.log('Docker命令:', dockerCmd);
            }

            const process = spawn('/bin/bash', ['-c', dockerCmd], {
                cwd: workDir
            });

            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                ws.send(JSON.stringify({ type: 'output', data: text }));
                if (debug) {
                    console.log('程序输出:', text);
                }
            });

            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                ws.send(JSON.stringify({ type: 'error', data: text }));
                if (debug) {
                    console.error('错误输出:', text);
                }
            });

            process.on('error', (error) => {
                console.error('进程错误:', error);
                reject(error);
            });

            process.on('close', (code) => {
                if (debug) {
                    console.log('进程退出码:', code);
                    console.log('最终输出:', output);
                    if (errorOutput) {
                        console.log('错误输出:', errorOutput);
                    }
                }

                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`程序退出代码: ${code}\n${errorOutput}`));
                }
            });

            // 存储process以便后续输入使用
            clients.set(id, process);
            ws.send(JSON.stringify({ type: 'processReady', processId: id }));
        });
    } catch (error) {
        console.error('编译过程错误:', error);
        throw error;
    } finally {
        // 延迟清理临时文件
        setTimeout(async () => {
            try {
                await fs.rm(workDir, { recursive: true, force: true });
                if (debug) {
                    console.log('清理工作目录:', workDir);
                }
            } catch (error) {
                console.error('清理临时文件失败:', error);
            }
        }, 1000);
    }
}

const debug = true;  // 开启调试模式

app.post('/compile', async (req, res) => {
    if (debug) {
        console.log('收到编译请求:', req.body);
    }
    
    const { code, clientId } = req.body;
    if (!code || !clientId) {
        return res.status(400).json({ 
            success: false, 
            error: '缺少必要参数' 
        });
    }

    try {
        const output = await compileCpp(code, clientId);
        if (debug) {
            console.log('编译执行成功:', output);
        }
        res.json({ success: true, output });
    } catch (error) {
        console.error('编译或执行错误:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || '未知错误'
        });
    }
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ 
        success: false, 
        error: '服务器内部错误' 
    });
});

// 处理 404
app.use((req, res) => {
    console.log('404 请求:', req.method, req.url);
    res.status(404).json({ 
        success: false, 
        error: '请求的路径不存在' 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`WebSocket 服务器已启动`);
    console.log(`静态文件目录: ${path.join(__dirname, 'public')}`);
    console.log(`编译路由: POST /compile`);
});

// 在服务器启动时创建临时目录并设置权限
const tmpDir = path.resolve(__dirname, 'tmp');
fs.mkdir(tmpDir, { recursive: true })
    .then(async () => {
        // 设置目录权限为 777
        await fs.chmod(tmpDir, 0o777);
        console.log('临时目录已创建并设置权限:', tmpDir);
    })
    .catch(error => {
        console.error('创建临时目录失败:', error);
    });
