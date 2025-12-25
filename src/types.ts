/**
 * Common types and interfaces used across the library
 */

export interface WSLDistro {
    name: string;
    version: number; // 1 or 2
    state: 'Running' | 'Stopped';
    isDefault: boolean;
}

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface FileStat {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    mtime: number;
    ctime: number;
}

export interface WSLConnection {
    /** WSL distribution name */
    readonly distro: string;

    /** Server process ID */
    readonly serverPid: number;

    /** File system API */
    readonly fs: RemoteFileSystem;

    /** Execute command in WSL */
    exec(command: string, cwd?: string): Promise<ExecResult>;

    /** Spawn a process and get pid for streaming */
    spawn(command: string, args?: string[], cwd?: string): Promise<number>;

    /** Kill a spawned process */
    kill(pid: number): Promise<boolean>;

    /** System info */
    getSystemInfo(): Promise<SystemInfo>;

    /** Disconnect */
    disconnect(): Promise<void>;

    /** Event handlers */
    onProcessOutput(handler: (pid: number, data: string, stream: 'stdout' | 'stderr') => void): void;
    onProcessExit(handler: (pid: number, code: number) => void): void;
}

export interface RemoteFileSystem {
    readFile(path: string, encoding?: BufferEncoding): Promise<string>;
    writeFile(path: string, content: string, encoding?: BufferEncoding): Promise<void>;
    readDir(path: string): Promise<FileStat[]>;
    stat(path: string): Promise<FileStat>;
    mkdir(path: string, recursive?: boolean): Promise<void>;
    delete(path: string, recursive?: boolean): Promise<void>;
    exists(path: string): Promise<boolean>;
    copy(src: string, dest: string): Promise<void>;
    move(src: string, dest: string): Promise<void>;
}

export interface SystemInfo {
    platform: string;
    arch: string;
    nodeVersion: string;
    cwd: string;
    home: string;
    user: string;
    pid: number;
}

export interface WSLConnectorOptions {


    /** Custom Node.js path in WSL (default: node) */
    nodePath?: string;

    /** Server script path (default: bundled) */
    serverPath?: string;

    /** Use TCP instead of stdio (default: false) */
    useTcp?: boolean;

    /** Port to use for TCP (default: random or specified) */
    tcpPort?: number;
}
