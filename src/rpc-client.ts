import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as net from 'net';
import { EventEmitter } from 'events';
import debug from 'debug';
const log = debug('wsl-remote:rpc');

/**
 * JSON-RPC Client for communicating with WSL Remote Server
 */
export class RpcClient extends EventEmitter {
    private process: ChildProcess | null = null;
    private socket: net.Socket | null = null;
    private requestId = 0;
    private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
    private rl: readline.Interface | null = null;

    constructor() {
        super();
    }

    /**
     * Start the server process and establish connection via stdio
     * @param wslExe - Path to wsl.exe
     * @param distro - WSL distribution name
     * @param shellCommand - Complete shell command to execute
     */
    async connect(wslExe: string, distro: string | undefined, shellCommand: string): Promise<number> {
        const args: string[] = [];

        if (distro) {
            args.push('-d', distro);
        }

        args.push('--', 'bash', '-c', shellCommand);

        log(`Starting server via stdio: ${wslExe} ${args.join(' ')}`);

        this.process = spawn(wslExe, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.rl = readline.createInterface({
            input: this.process.stdout!,
            terminal: false
        });

        this.rl.on('line', (line) => {
            this.handleMessage(line);
        });

        this.process.stderr?.on('data', (data) => {
            log(`Server stderr: ${data}`);
        });

        this.process.on('close', (code) => {
            log(`Server exited with code ${code}`);
            this.emit('close', code);
            this.cleanup();
        });

        this.process.on('error', (err) => {
            log(`Server error: ${err}`);
            this.emit('error', err);
        });

        return this.waitForReady();
    }

    /**
     * Connect to an existing server via TCP
     * @param port - TCP port
     * @param host - TCP host (default 127.0.0.1)
     */
    async connectTcp(port: number, host: string = '127.0.0.1'): Promise<number> {
        log(`Connecting to server via TCP: ${host}:${port}`);

        const maxRetries = 20;
        let lastError: Error | null = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await new Promise((resolve, reject) => {
                    const socket = net.connect(port, host);
                    let connected = false;

                    socket.on('connect', () => {
                        connected = true;
                        this.socket = socket;
                        this.rl = readline.createInterface({
                            input: socket,
                            terminal: false
                        });

                        this.rl.on('line', (line) => {
                            this.handleMessage(line);
                        });

                        log('Connected to TCP server');
                        this.waitForReady().then(resolve).catch(reject);
                    });

                    socket.on('error', (err) => {
                        if (!connected) {
                            reject(err);
                        } else {
                            log(`TCP error after connection: ${err}`);
                            this.emit('error', err);
                        }
                    });

                    socket.on('close', () => {
                        if (connected) {
                            log('TCP connection closed');
                            this.emit('close');
                            this.cleanup();
                        }
                    });
                });
            } catch (err: any) {
                lastError = err;
                log(`Connection attempt ${i + 1} failed: ${err.message}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        throw new Error(`Failed to connect to TCP server after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    private waitForReady(): Promise<number> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 10000);

            const readyHandler = (method: string, params: any) => {
                if (method === 'server/ready') {
                    clearTimeout(timeout);
                    this.off('notification', readyHandler);
                    resolve(params.pid);
                }
            };

            this.on('notification', readyHandler);
        });
    }

    /**
     * Send a request and wait for response
     */
    async request<T>(method: string, params?: any): Promise<T> {
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            const message = JSON.stringify(request) + '\n';
            log(`-> ${message.trim()}`);

            if (this.socket) {
                this.socket.write(message);
            } else if (this.process && this.process.stdin) {
                this.process.stdin.write(message);
            } else {
                reject(new Error('Not connected to server'));
            }
        });
    }

    /**
     * Disconnect from server
     */
    disconnect(): void {
        if (this.process) {
            this.process.kill();
        }
        if (this.socket) {
            this.socket.destroy();
        }
        this.cleanup();
    }

    private handleMessage(line: string): void {
        log(`<- ${line}`);

        try {
            const message = JSON.parse(line);

            // Response to a request
            if (message.id !== undefined) {
                const pending = this.pendingRequests.get(message.id);
                if (pending) {
                    this.pendingRequests.delete(message.id);
                    if (message.error) {
                        pending.reject(new Error(message.error.message));
                    } else {
                        pending.resolve(message.result);
                    }
                }
            }
            // Notification
            else if (message.method) {
                this.emit('notification', message.method, message.params);

                // Specific events
                if (message.method === 'process/stdout') {
                    this.emit('process:stdout', message.params.pid, message.params.data);
                } else if (message.method === 'process/stderr') {
                    this.emit('process:stderr', message.params.pid, message.params.data);
                } else if (message.method === 'process:exit') {
                    this.emit('process:exit', message.params.pid, message.params.code);
                }
            }
        } catch (err) {
            log(`Failed to parse message: ${line}`);
        }
    }

    private cleanup(): void {
        this.process = null;
        this.socket = null;
        this.rl = null;

        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests) {
            reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
    }
}
