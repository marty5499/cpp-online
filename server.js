const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 編譯和執行C++代碼的函數
async function compileCpp(code) {
    const id = uuidv4();
    const workDir = path.join('/tmp/cpp_runner', id);
    const sourceFile = path.join(workDir, 'main.cpp');

    try {
        // 創建工作目錄
        await fs.mkdir(workDir, { recursive: true });
        
        // 寫入源代碼
        await fs.writeFile(sourceFile, code);

        // 使用 Docker 編譯和運行
        const output = await new Promise((resolve, reject) => {
            const cmd = `docker run --rm -v "${workDir}:/tmp/cpp_runner" cpp-runner:latest /bin/bash -c "g++ /tmp/cpp_runner/main.cpp -o /tmp/cpp_runner/program && /tmp/cpp_runner/program"`;
            
            exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    if (error.signal === 'SIGTERM') {
                        reject(new Error('程序執行超時'));
                    } else {
                        reject(new Error(`運行錯誤: ${stderr || error.message}`));
                    }
                } else {
                    resolve(stdout);
                }
            });
        });

        return output;
    } catch (error) {
        throw error;
    } finally {
        // 清理工作目錄
        try {
            await fs.rm(workDir, { recursive: true, force: true });
        } catch (error) {
            console.error('清理臨時文件失敗:', error);
        }
    }
}

// 編譯路由
app.post('/compile', async (req, res) => {
    console.log('收到編譯請求:', req.body);
    try {
        const { code } = req.body;
        const output = await compileCpp(code);
        console.log('執行輸出:', output);
        res.json({ output });
    } catch (error) {
        console.error('錯誤:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服務器運行在端口 ${PORT}`);
});
