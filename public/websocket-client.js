class CppWebSocketClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.callbacks = {
            onOutput: () => {},
            onError: () => {},
            onProcessReady: () => {},
            onProcessDone: () => {}
        };
    }

    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host || 'localhost:3000';
                const wsUrl = `${protocol}//${host}`;
                
                console.log('嘗試連接到 WebSocket 服務器:', wsUrl);
                
                this.ws = new WebSocket(wsUrl);

                // 等待接收 clientId
                const initTimeout = setTimeout(() => {
                    if (!this.clientId) {
                        console.error('等待接收 clientId 超時');
                        this.ws.close();
                        reject(new Error('等待接收 clientId 超時'));
                    }
                }, 5000);

                this.ws.onopen = () => {
                    console.log('WebSocket 連接已建立，等待接收 clientId...');
                };

                this.ws.onerror = (error) => {
                    clearTimeout(initTimeout);
                    console.error('WebSocket 錯誤:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    clearTimeout(initTimeout);
                    console.log('WebSocket 連接已關閉');
                    this.ws = null;
                    this.clientId = null;
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('收到消息:', message);
                        
                        switch (message.type) {
                            case 'init':
                                this.clientId = message.clientId;
                                console.log('收到 clientId:', this.clientId);
                                clearTimeout(initTimeout);
                                resolve(); // 只有在收到 clientId 後才解析 Promise
                                break;
                            case 'output':
                                this.callbacks.onOutput(message.data);
                                break;
                            case 'error':
                                this.callbacks.onError(message.data);
                                break;
                            case 'processReady':
                                this.processId = message.processId;
                                this.callbacks.onProcessReady();
                                break;
                            case 'processDone':
                                this.callbacks.onProcessDone();
                                break;
                        }
                    } catch (error) {
                        console.error('處理消息時發生錯誤:', error);
                        this.callbacks.onError('處理消息時發生錯誤: ' + error.message);
                    }
                };
            } catch (error) {
                console.error('建立 WebSocket 連接時發生錯誤:', error);
                reject(error);
            }
        });
    }

    async compile(code) {
        try {
            if (!this.clientId) {
                throw new Error('WebSocket 未連接或未收到 clientId');
            }

            console.log('發送編譯請求，clientId:', this.clientId);
            
            const response = await fetch('/compile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code,
                    clientId: this.clientId
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '編譯失敗');
            }

            const result = await response.json();
            console.log('編譯請求響應:', result);
            return result;
        } catch (error) {
            console.error('編譯請求失敗:', error);
            throw error;
        }
    }

    sendInput(input) {
        if (this.ws && this.processId) {
            this.ws.send(JSON.stringify({
                type: 'input',
                processId: this.processId,
                input: input
            }));
        }
    }

    sendEOF() {
        if (this.ws && this.processId) {
            this.ws.send(JSON.stringify({
                type: 'eof',
                processId: this.processId
            }));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
} 