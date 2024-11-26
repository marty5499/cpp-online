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

const debug = true;  // 開啟調試模式用於排查問題

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    clients.set(clientId, ws);
    console.log(`新的WebSocket連接已建立，clientId: ${clientId}`);

    // 添加心跳檢測
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

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

// 添加 WebSocket 服務器的錯誤處理
wss.on('error', (error) => {
    console.error('WebSocket 服務器錯誤:', error);
});

// 添加心跳檢測間隔
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('關閉無響應的 WebSocket 連接');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// 修改編譯和執行C++代碼的函數
async function compileCpp(code, clientId) {
    const id = uuidv4();
    const workDir = path.resolve(__dirname, 'tmp', id);
    const sourceFile = path.join(workDir, 'main.cpp');
    const outputFile = path.join(workDir, 'program');
    const ws = clients.get(clientId);

    try {
        // 創建工作目錄
        await fs.mkdir(workDir, { recursive: true });
        await fs.chmod(workDir, 0o777);
        
        // 寫入源代碼文件
        await fs.writeFile(sourceFile, code, 'utf8');
        await fs.chmod(sourceFile, 0o777);  // 修改權限為 777

        if (debug) {
            console.log('工作目錄:', workDir);
            console.log('源文件:', sourceFile);
            console.log('輸出文件:', outputFile);
            console.log('源代碼:', code);
        }

        return new Promise((resolve, reject) => {
            // 編譯命令
            const compileCmd = spawn('bash', [
                '-c',
                `cd "${workDir}" && g++ main.cpp -o program -std=c++11`
            ]);

            let compileError = '';

            compileCmd.stderr.on('data', (data) => {
                compileError += data.toString();
                console.error('編譯錯誤輸出:', data.toString());
            });

            compileCmd.on('error', (error) => {
                console.error('編譯進程錯誤:', error);
                reject(error);
            });

            compileCmd.on('close', async (code) => {
                if (code !== 0) {
                    console.error('編譯失敗，退出碼:', code);
                    ws.send(JSON.stringify({ type: 'error', data: compileError }));
                    reject(new Error(compileError));
                    return;
                }

                // 確保輸出文件有執行權限
                try {
                    await fs.chmod(outputFile, 0o777);
                } catch (error) {
                    console.error('設置執行權限失敗:', error);
                    reject(error);
                    return;
                }

                console.log('編譯成功，開始執行程序');

                // 執行程序
                const runProcess = spawn(outputFile, [], {
                    cwd: workDir
                });

                // 保存進程引用
                processes.set(id, runProcess);
                
                console.log(`進程已啟動，processId: ${id}`);
                ws.send(JSON.stringify({ type: 'processReady', processId: id }));

                runProcess.stdout.on('data', (data) => {
                    const text = data.toString();
                    ws.send(JSON.stringify({ type: 'output', data: text }));
                    console.log(`進程輸出: ${text}`);
                });

                runProcess.stderr.on('data', (data) => {
                    const text = data.toString();
                    ws.send(JSON.stringify({ type: 'error', data: text }));
                    console.error(`進程錯誤輸出: ${text}`);
                });

                runProcess.on('error', (error) => {
                    console.error('執行錯誤:', error);
                    ws.send(JSON.stringify({ type: 'error', data: error.message }));
                    processes.delete(id);
                    reject(error);
                });

                runProcess.on('close', (code) => {
                    console.log(`進程結束，退出碼: ${code}`);
                    ws.send(JSON.stringify({ type: 'processDone' }));
                    processes.delete(id);
                    resolve();
                });
            });
        });
    } catch (error) {
        console.error('編譯過程錯誤:', error);
        throw error;
    }
}

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
