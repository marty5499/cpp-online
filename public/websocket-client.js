class CppWebSocketClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.currentProcessId = null;
        this.callbacks = {
            onOutput: null,
            onError: null,
            onProcessReady: null,
            onProcessDone: null
        };
    }

    // 設置回調函數
    setCallbacks({
        onOutput = (text) => {},
        onError = (error) => {},
        onProcessReady = () => {},
        onProcessDone = () => {}
    } = {}) {
        this.callbacks.onOutput = onOutput;
        this.callbacks.onError = onError;
        this.callbacks.onProcessReady = onProcessReady;
        this.callbacks.onProcessDone = onProcessDone;
    }

    // 連接到伺服器
    async connect() {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                this.ws.close();
            }

            this.ws = new WebSocket(`ws://${window.location.host}`);
            
            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                switch (message.type) {
                    case 'init':
                        this.clientId = message.clientId;
                        resolve();
                        break;
                    case 'output':
                        this.callbacks.onOutput(message.data);
                        break;
                    case 'error':
                        this.callbacks.onError(message.data);
                        break;
                    case 'processReady':
                        this.currentProcessId = message.processId;
                        this.callbacks.onProcessReady();
                        break;
                    case 'processDone':
                        this.callbacks.onProcessDone();
                        this.currentProcessId = null;
                        break;
                }
            };

            this.ws.onerror = (error) => {
                reject(error);
            };

            this.ws.onclose = () => {
                this.clientId = null;
                this.currentProcessId = null;
            };
        });
    }

    // 編譯並運行程式碼
    async compile(code) {
        if (!this.clientId) {
            throw new Error('WebSocket 未連接');
        }

        const response = await fetch('/compile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, clientId: this.clientId })
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error);
        }
        return result;
    }

    // 發送輸入到程序
    sendInput(input) {
        if (!this.currentProcessId) {
            throw new Error('沒有正在運行的程序');
        }

        this.ws.send(JSON.stringify({
            type: 'input',
            processId: this.currentProcessId,
            input: input
        }));
    }

    // 發送 EOF 信號
    sendEOF() {
        if (!this.currentProcessId) {
            throw new Error('沒有正在運行的程序');
        }

        this.ws.send(JSON.stringify({
            type: 'eof',
            processId: this.currentProcessId
        }));
    }

    // 關閉連接
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
} 