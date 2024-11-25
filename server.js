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

// 儲存WebSocket連接
const clients = new Map();

// 儲存子進程
const processes = new Map();

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(clientId, ws);
    console.log(`新的WebSocket連接已建立，clientId: ${clientId}`);

    ws.on('message', (message) => {
        console.log(`收到來自clientId ${clientId} 的消息: ${message}`);
        const data = JSON.parse(message);
        
        if (data.type === 'input') {
            const process = processes.get(data.processId);
            if (process && process.stdin) {
                console.log(`向clientId ${clientId} 的processId ${data.processId} 寫入輸入: ${data.input}`);
                process.stdin.write(data.input + '\n');
            } else {
                console.log(`未找到對應的processId ${data.processId} 或 process.stdin`);
            }
        } else if (data.type === 'eof') {
            // 處理 EOF 信號
            const process = processes.get(data.processId);
            if (process && process.stdin) {
                console.log(`收到 EOF 信號，關閉 processId ${data.processId} 的標準輸入`);
                process.stdin.end();
                processes.delete(data.processId);
            } else {
                console.log(`未找到對應的processId ${data.processId} 或 process.stdin`);
            }
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`WebSocket連接已關閉，clientId: ${clientId}`);
    });

    // 發送clientId給客戶端
    ws.send(JSON.stringify({ type: 'init', clientId }));
    console.log(`已發送init消息給clientId: ${clientId}`);
});

// 修改編譯和執行C++代碼的函數
async function compileCpp(code, clientId) {
    const id = uuidv4();
    const workDir = path.resolve(__dirname, 'tmp', id);
    const sourceFile = path.join(workDir, 'main.cpp');
    const ws = clients.get(clientId);

    try {
        // 創建工作目錄並設置權限
        await fs.mkdir(workDir, { recursive: true });
        await fs.chmod(workDir, 0o777);
        console.log(`已創建工作目錄: ${workDir} 並設置權限為777`);

        // 寫入源代碼文件並設置權限
        await fs.writeFile(sourceFile, code, 'utf8');
        await fs.chmod(sourceFile, 0o666);
        console.log(`已寫入源代碼到: ${sourceFile} 並設置權限為666`);

        if (debug) {
            console.log('工作目錄:', workDir);
            console.log('源文件:', sourceFile);
            console.log('源代碼:', code);
            
            // 檢查文件是否存在
            const files = await fs.readdir(workDir);
            console.log('目錄內容:', files);
        }

        return new Promise((resolve, reject) => {
            // 修改 Docker 命令，使用絕對路徑並添加調試信息
            const dockerCmd = debug 
                ? `docker run --rm -i \
                    -v "${workDir}:/workspace" \
                    -w /workspace \
                    -u root \
                    cpp-runner:latest \
                    bash -c "ls -la && pwd && g++ main.cpp -o program && ./program"`
                : `docker run --rm -i \
                    -v "${workDir}:/workspace" \
                    -w /workspace \
                    -u root \
                    cpp-runner:latest \
                    bash -c "g++ main.cpp -o program && ./program"`;
            
            if (debug) {
                console.log('Docker命令:', dockerCmd);
            }

            const process = spawn('/bin/bash', ['-c', dockerCmd], {
                cwd: workDir
            });
            console.log(`已啟動Docker進程，processId: ${id}`);

            let output = '';
            let errorOutput = '';

            process.stdin.on('end', () => {
                console.log(`processId ${id} 標準輸入已結束`);
            });

            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                ws.send(JSON.stringify({ type: 'output', data: text }));
                console.log(`processId ${id} 輸出: ${text}`);
            });

            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                ws.send(JSON.stringify({ type: 'error', data: text }));
                console.error(`processId ${id} 錯誤輸出: ${text}`);
            });

            process.on('error', (error) => {
                console.error(`processId ${id} 進程錯誤:`, error);
                reject(error);
            });

            process.on('close', (code) => {
                console.log(`processId ${id} 進程已關閉，退出碼: ${code}`);
                console.log(`processId ${id} 最終輸出: ${output}`);
                if (errorOutput) {
                    console.error(`processId ${id} 最終錯誤輸出: ${errorOutput}`);
                }
                ws.send(JSON.stringify({ type: 'processDone' }));
                processes.delete(id);
            });

            // 儲存process到processes映射
            processes.set(id, process);
            ws.send(JSON.stringify({ type: 'processReady', processId: id }));
            console.log(`processReady消息已發送，processId: ${id}`);
        });
    } catch (error) {
        console.error('編譯過程錯誤:', error);
        throw error;
    } finally {
        // 延遲清理臨時文件
        setTimeout(async () => {
            try {
                await fs.rm(workDir, { recursive: true, force: true });
                if (debug) {
                    console.log('清理工作目錄:', workDir);
                }
                console.log(`已清理工作目錄: ${workDir}`);
            } catch (error) {
                console.error('清理臨時文件失敗:', error);
            }
        }, 1000);
    }
}

const debug = false;  // 開啟調試模式

app.post('/compile', async (req, res) => {
    if (debug) {
        console.log('收到編譯請求:', req.body);
    }
    
    const { code, clientId } = req.body;
    if (!code || !clientId) {
        return res.status(400).json({ 
            success: false, 
            error: '缺少必要參數' 
        });
    }

    try {
        const output = await compileCpp(code, clientId);
        if (debug) {
            console.log('編譯執行成功:', output);
        }
        res.json({ success: true, output });
    } catch (error) {
        console.error('編譯或執行錯誤:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || '未知錯誤'
        });
    }
});

// 添加錯誤處理中間件
app.use((err, req, res, next) => {
    console.error('伺服器錯誤:', err);
    res.status(500).json({ 
        success: false, 
        error: '伺服器內部錯誤' 
    });
});

// 處理 404
app.use((req, res) => {
    console.log('404 請求:', req.method, req.url);
    res.status(404).json({ 
        success: false, 
        error: '請求的路徑不存在' 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`伺服器運行在端口 ${PORT}`);
    console.log(`WebSocket 伺服器已啟動`);
    console.log(`靜態文件目錄: ${path.join(__dirname, 'public')}`);
    console.log(`編譯路由: POST /compile`);
});

// 在伺服器啟動時創建臨時目錄並設置權限
const tmpDir = path.resolve(__dirname, 'tmp');
fs.mkdir(tmpDir, { recursive: true })
    .then(async () => {
        // 設置目錄權限為 777
        await fs.chmod(tmpDir, 0o777);
        console.log('臨時目錄已創建並設置權限:', tmpDir);
    })
    .catch(error => {
        console.error('創建臨時目錄失敗:', error);
    });
