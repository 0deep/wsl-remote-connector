#!/usr/bin/env node
/**
 * WSL Remote Server - Lightweight JSON-RPC server
 * 
 * Protocol: JSON-RPC 2.0 over stdin/stdout or TCP
 * 
 * Provides:
 * - File system operations (read, write, list, stat)
 * - Process execution
 * - Terminal PTY support (optional)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';

// ============================================================================
// Types
// ============================================================================

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: any;
}

interface FileStat {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    mtime: number;
    ctime: number;
}

// ============================================================================
// Server Implementation
// ============================================================================

class WSLRemoteServer {
    private processes: Map<number, ChildProcess> = new Map();
    private nextPid = 1;

    constructor() {
        // Parse arguments
        const args = process.argv.slice(2);
        const portIdx = args.indexOf('--port');
        const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : undefined;

        if (port) {
            this.setupTcpHandler(port);
        } else {
            this.setupStdinHandler();
        }
    }

    private setupTcpHandler(port: number): void {
        const server = net.createServer((socket) => {
            console.error(`Client connected: ${socket.remoteAddress}`);

            const rl = readline.createInterface({
                input: socket,
                terminal: false
            });

            rl.on('line', async (line) => {
                const response = await this.handleLine(line);
                if (response) {
                    socket.write(JSON.stringify(response) + '\n');
                }
            });

            socket.on('error', (err) => {
                console.error(`Socket error: ${err.message}`);
            });

            socket.on('close', () => {
                console.error('Client disconnected');
            });

            // Send ready notification to this client
            const readyNotification: JsonRpcNotification = {
                jsonrpc: '2.0',
                method: 'server/ready',
                params: { version: '1.0.0', pid: process.pid, transport: 'tcp' }
            };
            socket.write(JSON.stringify(readyNotification) + '\n');

            // Overwrite sendNotification and sendResponse to use this socket
            // Note: This only supports one concurrent client properly with current architecture
            this.sendResponse = (response: JsonRpcResponse) => {
                socket.write(JSON.stringify(response) + '\n');
            };
            this.sendNotification = (method: string, params?: any) => {
                socket.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
            };
        });

        server.listen(port, '0.0.0.0', () => {
            console.error(`WSL Remote Server listening on port ${port}`);
        });

        server.on('error', (err) => {
            console.error(`Server error: ${err.message}`);
            process.exit(1);
        });
    }

    private setupStdinHandler(): void {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on('line', async (line) => {
            const response = await this.handleLine(line);
            if (response) {
                this.sendResponse(response);
            }
        });

        rl.on('close', () => {
            this.cleanup();
            process.exit(0);
        });

        this.sendNotification('server/ready', { version: '1.0.0', pid: process.pid, transport: 'stdio' });
    }

    private async handleLine(line: string): Promise<JsonRpcResponse | null> {
        try {
            if (!line.trim()) return null;
            const request: JsonRpcRequest = JSON.parse(line);
            return await this.handleRequest(request);
        } catch (err) {
            return {
                jsonrpc: '2.0',
                id: 0,
                error: {
                    code: -32700,
                    message: 'Parse error',
                    data: String(err)
                }
            };
        }
    }

    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { id, method, params } = request;

        try {
            let result: any;

            switch (method) {
                // File System Operations
                case 'fs/readFile':
                    result = await this.readFile(params.path, params.encoding);
                    break;
                case 'fs/writeFile':
                    result = await this.writeFile(params.path, params.content, params.encoding);
                    break;
                case 'fs/readDir':
                    result = await this.readDir(params.path);
                    break;
                case 'fs/stat':
                    result = await this.stat(params.path);
                    break;
                case 'fs/mkdir':
                    result = await this.mkdir(params.path, params.recursive);
                    break;
                case 'fs/delete':
                    result = await this.deleteFile(params.path, params.recursive);
                    break;
                case 'fs/exists':
                    result = await this.exists(params.path);
                    break;
                case 'fs/copy':
                    result = await this.copy(params.src, params.dest);
                    break;
                case 'fs/move':
                    result = await this.move(params.src, params.dest);
                    break;

                // Process Operations
                case 'process/exec':
                    result = await this.exec(params.command, params.cwd, params.env);
                    break;
                case 'process/spawn':
                    result = this.spawnProcess(params.command, params.args, params.cwd, params.env);
                    break;
                case 'process/kill':
                    result = this.killProcess(params.pid);
                    break;
                case 'process/write':
                    result = this.writeToProcess(params.pid, params.data);
                    break;

                // System Operations
                case 'system/info':
                    result = this.getSystemInfo();
                    break;
                case 'system/env':
                    result = process.env;
                    break;

                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`
                        }
                    };
            }

            return { jsonrpc: '2.0', id, result };
        } catch (err: any) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32000,
                    message: err.message || String(err),
                    data: err.code
                }
            };
        }
    }

    // =========================================================================
    // File System Methods
    // =========================================================================

    private async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        return fs.promises.readFile(filePath, { encoding });
    }

    private async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<boolean> {
        await fs.promises.writeFile(filePath, content, { encoding });
        return true;
    }

    private async readDir(dirPath: string): Promise<FileStat[]> {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const stats: FileStat[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                const stat = await fs.promises.stat(fullPath);
                stats.push({
                    name: entry.name,
                    path: fullPath,
                    size: stat.size,
                    isDirectory: entry.isDirectory(),
                    isFile: entry.isFile(),
                    mtime: stat.mtimeMs,
                    ctime: stat.ctimeMs
                });
            } catch {
                // Skip files we can't stat
            }
        }

        return stats;
    }

    private async stat(filePath: string): Promise<FileStat> {
        const stat = await fs.promises.stat(filePath);
        return {
            name: path.basename(filePath),
            path: filePath,
            size: stat.size,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            mtime: stat.mtimeMs,
            ctime: stat.ctimeMs
        };
    }

    private async mkdir(dirPath: string, recursive: boolean = true): Promise<boolean> {
        await fs.promises.mkdir(dirPath, { recursive });
        return true;
    }

    private async deleteFile(filePath: string, recursive: boolean = false): Promise<boolean> {
        await fs.promises.rm(filePath, { recursive, force: true });
        return true;
    }

    private async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async copy(src: string, dest: string): Promise<boolean> {
        await fs.promises.copyFile(src, dest);
        return true;
    }

    private async move(src: string, dest: string): Promise<boolean> {
        await fs.promises.rename(src, dest);
        return true;
    }

    // =========================================================================
    // Process Methods
    // =========================================================================

    private exec(command: string, cwd?: string, env?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve) => {
            const proc = spawn('sh', ['-c', command], {
                cwd: cwd || process.cwd(),
                env: { ...process.env, ...env }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                resolve({ stdout, stderr, exitCode: code || 0 });
            });

            proc.on('error', (err) => {
                resolve({ stdout, stderr: err.message, exitCode: 1 });
            });
        });
    }

    private spawnProcess(command: string, args: string[] = [], cwd?: string, env?: Record<string, string>): number {
        const pid = this.nextPid++;

        const proc = spawn(command, args, {
            cwd: cwd || process.cwd(),
            env: { ...process.env, ...env }
        });

        this.processes.set(pid, proc);

        proc.stdout.on('data', (data) => {
            this.sendNotification('process/stdout', { pid, data: data.toString() });
        });

        proc.stderr.on('data', (data) => {
            this.sendNotification('process/stderr', { pid, data: data.toString() });
        });

        proc.on('close', (code) => {
            this.sendNotification('process/exit', { pid, code: code || 0 });
            this.processes.delete(pid);
        });

        proc.on('error', (err) => {
            this.sendNotification('process/error', { pid, error: err.message });
            this.processes.delete(pid);
        });

        return pid;
    }

    private killProcess(pid: number): boolean {
        const proc = this.processes.get(pid);
        if (proc) {
            proc.kill();
            this.processes.delete(pid);
            return true;
        }
        return false;
    }

    private writeToProcess(pid: number, data: string): boolean {
        const proc = this.processes.get(pid);
        if (proc && proc.stdin) {
            proc.stdin.write(data);
            return true;
        }
        return false;
    }

    // =========================================================================
    // System Methods
    // =========================================================================

    private getSystemInfo(): any {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cwd: process.cwd(),
            home: process.env.HOME || process.env.USERPROFILE,
            user: process.env.USER || process.env.USERNAME,
            pid: process.pid
        };
    }

    // =========================================================================
    // Communication
    // =========================================================================

    private sendResponse(response: JsonRpcResponse): void {
        console.log(JSON.stringify(response));
    }

    private sendNotification(method: string, params?: any): void {
        const notification: JsonRpcNotification = {
            jsonrpc: '2.0',
            method,
            params
        };
        console.log(JSON.stringify(notification));
    }

    private cleanup(): void {
        // Kill all spawned processes
        for (const [pid, proc] of this.processes) {
            proc.kill();
        }
        this.processes.clear();
    }
}

// Start server
new WSLRemoteServer();
