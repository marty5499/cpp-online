# C++ 程式碼執行器 WebSocket 客戶端

這個專案提供了一個 WebSocket 客戶端類別，可以輕鬆地將 C++ 程式碼編譯和執行功能整合到既有的網頁編輯器中。

## 功能特點

- 即時編譯和執行 C++ 程式碼
- 支援標準輸入輸出
- 終端機模式的互動界面
- 錯誤處理和回饋
- 支援 Ctrl+D 結束輸入

## 快速開始

### 1. 引入必要文件
<!-- 在 HTML 中引入 WebSocket 客戶端 -->
<script src="websocket-client.js"></script>

### 2. 初始化客戶端

```javascript
const client = new CppWebSocketClient();
```

### 3. 設置回調函數
```javascript
client.setCallbacks({
    // 處理程式輸出
    onOutput: (text) => {
        console.log('程式輸出:', text);
        // 在這裡更新您的輸出顯示區域
    },
    // 處理錯誤訊息
    onError: (error) => {
        console.error('錯誤:', error);
        // 在這裡顯示錯誤訊息
    },
    // 程式準備接受輸入時的回調
    onProcessReady: () => {
        console.log('程式準備就緒，可以開始輸入');
        // 在這裡顯示輸入提示或啟用輸入框
    },
    // 程式執行完畢的回調
    onProcessDone: () => {
        console.log('程式執行完畢');
        // 在這裡處理程式結束後的清理工作
    }
});
```


### 4. 執行程式碼
```javascript
async function runCode(code) {
    try {
        // 連接到 WebSocket 伺服器
        await client.connect();
        // 編譯並執行程式碼
        await client.compile(code);
    } catch (error) {
        console.error('執行錯誤:', error);
    }
}
```

### 5. 處理輸入
```javascript
// 發送輸入到程式
client.sendInput('使用者輸入的文字');
// 發送 EOF (Ctrl+D)
client.sendEOF();
```


### 6. 關閉連接
```javascript
// 在程式執行完畢後關閉連接
client.disconnect();
```


## 完整整合範例

以下是一個完整的整合範例，展示如何在既有的程式碼編輯器中使用這個客戶端：
```javascript
// 假設您已經有一個程式碼編輯器和輸出顯示區域
const editor = / 您的程式碼編輯器實例 /;
const outputDiv = document.getElementById('output');
let isWaitingForInput = false;
// 初始化 WebSocket 客戶端
const client = new CppWebSocketClient();
// 設置回調函數
client.setCallbacks({
    onOutput: (text) => {
        if (isWaitingForInput) {
            outputDiv.lastChild.remove();
        }
        outputDiv.appendChild(document.createTextNode(text));
        if (isWaitingForInput) {
            createInputLine();
        }
        outputDiv.scrollTop = outputDiv.scrollHeight;
    },
    onError: (error) => {
        outputDiv.appendChild(document.createTextNode(錯誤: $ {
                error
            }\
            n));
    },
    onProcessReady: () => {
        isWaitingForInput = true;
        createInputLine();
    },
    onProcessDone: () => {
        isWaitingForInput = false;
        if (outputDiv.lastChild.className === 'input-line') {
            outputDiv.lastChild.remove();
        }
        outputDiv.appendChild(document.createTextNode('\n程式執行完畢\n'));
    }
});
// 運行按鈕點擊事件
document.getElementById('runButton').addEventListener('click', async () => {
    outputDiv.textContent = '';
    try {
        await client.connect();
        await client.compile(editor.getValue());
    } catch (error) {
        outputDiv.textContent = 錯誤: $ {
            error.message
        }\
        n;
    }
});
// 創建輸入行
function createInputLine() {
    const inputLine = document.createElement('div');
    inputLine.className = 'input-line';
    const input = document.createElement('input');
    input.className = 'inline-input';
    input.placeholder = '按 Enter 發送，Ctrl+D 結束輸入...';
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            client.sendInput(value);
            // 更新顯示...
        } else if (e.key === 'd' && e.ctrlKey) {
            e.preventDefault();
            client.sendEOF();
            // 處理輸入結束...
        }
    });
    inputLine.appendChild(input);
    outputDiv.appendChild(inputLine);
    input.focus();
}
```

# 注意事項

1. 確保伺服器端已正確設置並運行
2. WebSocket 連接需要在使用者觸發事件（如按鈕點擊）時建立
3. 記得在程式執行完畢後關閉 WebSocket 連接
4. 處理可能的錯誤情況，提供適當的使用者回饋

## 相依性

- 需要現代瀏覽器支援（支援 WebSocket）
- 需要對應的後端伺服器支援
