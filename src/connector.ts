import * as path from 'path';
import { spawn } from 'child_process';
import debug from 'debug';
const log = debug('wsl-remote:connector');
import { WSLExecServer } from './wsl-exec';
import { RpcClient } from './rpc-client';
import {
    WSLConnection,
    WSLConnectorOptions,
    ExecResult,
    FileStat,
    RemoteFileSystem,
    SystemInfo
} from './types';

/**
 * Main WSL Connector class
 */
export class WSLConnector {
    private wslExec: WSLExecServer;
    private currentConnection?: ConnectionImpl;
    private nodePath: string;
    private serverPath: string;

    constructor(private options: WSLConnectorOptions = {}) {
        this.wslExec = new WSLExecServer();
        this.nodePath = options.nodePath || 'node';
        this.serverPath = options.serverPath || path.join(__dirname, 'server', 'index.js');
    }

    /**
     * Connect to WSL and start the lightweight server
     */
    async connect(distro?: string): Promise<WSLConnection> {
        // Use default distro if not specified
        if (!distro) {
            distro = await this.wslExec.getDefaultDistro();
            if (!distro) {
                throw new Error('No default WSL distribution found');
            }
        }

        // Get WSL executable path
        const wslExe = this.wslExec.getWSLExecutablePath();
        if (!wslExe) {
            throw new Error('wsl.exe not found');
        }

        // Convert Windows path to WSL path if needed
        let serverPath = this.serverPath;
        if (process.platform === 'win32' && !serverPath.startsWith('/')) {
            try {
                // Optimization: If it's a WSL UNC path, we can convert it locally
                const wslUncPrefix = `\\\\wsl.localhost\\${distro}`;
                const wslUncPrefix2 = `\\\\wsl$\\${distro}`; // Older versions

                if (serverPath.toLowerCase().startsWith(wslUncPrefix.toLowerCase())) {
                    serverPath = serverPath.substring(wslUncPrefix.length).replace(/\\/g, '/');
                } else if (serverPath.toLowerCase().startsWith(wslUncPrefix2.toLowerCase())) {
                    serverPath = serverPath.substring(wslUncPrefix2.length).replace(/\\/g, '/');
                } else {
                    serverPath = await this.wslExec.wslpath(distro, this.serverPath, true);
                }

                log(`Resolved path: ${this.serverPath} -> ${serverPath}`);
            } catch (err) {
                log(`Failed to convert path, using original: ${err}`);
            }
        }

        // Try to find node in WSL if not specified with a full path
        let nodePath = this.nodePath;
        if (nodePath === 'node') {
            try {
                const detectedNode = await this.wslExec.findNodePath(distro);
                if (detectedNode) {
                    nodePath = detectedNode;
                    log(`Detected node path in WSL: ${nodePath}`);
                }
            } catch (err) {
                log(`Failed to detect node path: ${err}`);
            }
        }

        log(`Starting server: ${nodePath} ${serverPath}`);

        // Generate shell command with nvm support
        let shellCommand = this.wslExec.getShellCommand(nodePath, serverPath);

        // Start RPC client
        const rpcClient = new RpcClient();
        let serverPid: number;

        if (this.options.useTcp) {
            const port = this.options.tcpPort || 50001; // Default port
            shellCommand += ` --port ${port}`;

            log(`Connecting via TCP to port ${port}`);

            // We still need to start the process to actually run the server
            // But we ignore its stdout for RPC
            const args: string[] = [];
            if (distro) args.push('-d', distro);
            args.push('--', 'bash', '-c', shellCommand);

            const serverProcess = spawn(wslExe, args, { detached: false, stdio: ['ignore', 'ignore', 'pipe'] });

            serverProcess.stderr?.on('data', (data) => {
                log(`Server log: ${data}`);
            });

            serverPid = await rpcClient.connectTcp(port);
        } else {
            serverPid = await rpcClient.connect(wslExe, distro, shellCommand);
        }

        log(`Connected to WSL server (PID: ${serverPid})`);

        this.currentConnection = new ConnectionImpl(distro, serverPid, rpcClient);
        return this.currentConnection;
    }

    /**
     * Disconnect from current connection
     */
    async disconnect(): Promise<void> {
        if (this.currentConnection) {
            await this.currentConnection.disconnect();
            this.currentConnection = undefined;
        }
    }

    /**
     * Get current connection
     */
    get connection(): WSLConnection | undefined {
        return this.currentConnection;
    }

    /**
     * Check if connected
     */
    get isConnected(): boolean {
        return !!this.currentConnection;
    }
}

/**
 * Internal connection implementation
 */
class ConnectionImpl implements WSLConnection {
    private processOutputHandler?: (pid: number, data: string, stream: 'stdout' | 'stderr') => void;
    private processExitHandler?: (pid: number, code: number) => void;

    readonly fs: RemoteFileSystem;

    constructor(
        public readonly distro: string,
        public readonly serverPid: number,
        private rpcClient: RpcClient
    ) {
        this.fs = new RemoteFileSystemImpl(rpcClient);
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.rpcClient.on('process:stdout', (pid: number, data: string) => {
            this.processOutputHandler?.(pid, data, 'stdout');
        });

        this.rpcClient.on('process:stderr', (pid: number, data: string) => {
            this.processOutputHandler?.(pid, data, 'stderr');
        });

        this.rpcClient.on('process:exit', (pid: number, code: number) => {
            this.processExitHandler?.(pid, code);
        });
    }

    async exec(command: string, cwd?: string): Promise<ExecResult> {
        return this.rpcClient.request('process/exec', { command, cwd });
    }

    async spawn(command: string, args: string[] = [], cwd?: string): Promise<number> {
        return this.rpcClient.request('process/spawn', { command, args, cwd });
    }

    async kill(pid: number): Promise<boolean> {
        return this.rpcClient.request('process/kill', { pid });
    }

    async getSystemInfo(): Promise<SystemInfo> {
        return this.rpcClient.request('system/info');
    }

    async disconnect(): Promise<void> {
        this.rpcClient.disconnect();
    }

    onProcessOutput(handler: (pid: number, data: string, stream: 'stdout' | 'stderr') => void): void {
        this.processOutputHandler = handler;
    }

    onProcessExit(handler: (pid: number, code: number) => void): void {
        this.processExitHandler = handler;
    }
}

/**
 * Remote file system implementation
 */
class RemoteFileSystemImpl implements RemoteFileSystem {
    constructor(private rpcClient: RpcClient) { }

    async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        return this.rpcClient.request('fs/readFile', { path, encoding });
    }

    async writeFile(path: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
        await this.rpcClient.request('fs/writeFile', { path, content, encoding });
    }

    async readDir(path: string): Promise<FileStat[]> {
        return this.rpcClient.request('fs/readDir', { path });
    }

    async stat(path: string): Promise<FileStat> {
        return this.rpcClient.request('fs/stat', { path });
    }

    async mkdir(path: string, recursive: boolean = true): Promise<void> {
        await this.rpcClient.request('fs/mkdir', { path, recursive });
    }

    async delete(path: string, recursive: boolean = false): Promise<void> {
        await this.rpcClient.request('fs/delete', { path, recursive });
    }

    async exists(path: string): Promise<boolean> {
        return this.rpcClient.request('fs/exists', { path });
    }

    async copy(src: string, dest: string): Promise<void> {
        await this.rpcClient.request('fs/copy', { src, dest });
    }

    async move(src: string, dest: string): Promise<void> {
        await this.rpcClient.request('fs/move', { src, dest });
    }
}
