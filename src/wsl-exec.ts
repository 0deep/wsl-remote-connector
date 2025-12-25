import { execFile } from 'child_process';
import { promisify } from 'util';
import { WSLDistro } from './types';

const execFileAsync = promisify(execFile);

/**
 * WSL Execution Layer
 * Provides compact interface to interact with wsl.exe
 */
export class WSLExecServer {
    private wslPath: string = 'wsl.exe';

    async isWSLInstalled(): Promise<boolean> {
        try {
            await execFileAsync(this.wslPath, ['--version']);
            return true;
        } catch {
            return false;
        }
    }

    getWSLExecutablePath(): string {
        return this.wslPath;
    }

    async getDistroList(): Promise<WSLDistro[]> {
        try {
            const { stdout } = await execFileAsync(this.wslPath, ['--list', '--verbose']);
            const lines = stdout.replace(/\0/g, '').split('\n').slice(1);
            const distros: WSLDistro[] = [];

            for (const line of lines) {
                const match = line.trim().match(/^(\*)?\s*([^\s]+)\s+(Running|Stopped)\s+(\d+)/);
                if (match) {
                    distros.push({
                        name: match[2],
                        state: match[3] as 'Running' | 'Stopped',
                        version: parseInt(match[4]),
                        isDefault: !!match[1]
                    });
                }
            }
            return distros;
        } catch (error) {
            throw new Error(`Failed to get WSL distributions: ${error}`);
        }
    }

    async getDefaultDistro(): Promise<string | undefined> {
        const distros = await this.getDistroList();
        return distros.find(d => d.isDefault)?.name;
    }

    async wslpath(distro: string | undefined, path: string, toWsl: boolean): Promise<string> {
        const args = (distro ? ['-d', distro] : []).concat(['-e', 'wslpath', toWsl ? '-u' : '-w', path]);
        try {
            const { stdout } = await execFileAsync(this.wslPath, args);
            return stdout.replace(/\0/g, '').trim();
        } catch (error: any) {
            throw new Error(`Failed to convert path: ${error.stderr || error.message}`);
        }
    }

    /**
     * Generates a shell command that sources nvm if available.
     * This ensures node is found even in non-interactive shells.
     * Works safely in both nvm and non-nvm environments.
     */
    private getNvmSourceCommand(cmd: string): string {
        // Source nvm.sh only if it exists (handles nvm installations)
        // In non-nvm environments, this will skip the source and run the command directly
        return `[ -s ~/.nvm/nvm.sh ] && source ~/.nvm/nvm.sh; ${cmd}`;
    }

    /**
     * Finds node absolute path using login shell to support nvm.
     */
    async findNodePath(distro: string | undefined): Promise<string | undefined> {
        // Use bash -c with explicit nvm sourcing for non-interactive shell support
        const findCmd = this.getNvmSourceCommand('which node || which nodejs');
        const args = (distro ? ['-d', distro] : []).concat(['--', 'bash', '-c', findCmd]);
        try {
            const { stdout } = await execFileAsync(this.wslPath, args);
            const path = stdout.replace(/\0/g, '').trim().split('\n').pop()?.trim();
            return (path && path.startsWith('/')) ? path : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Gets a shell command wrapped with nvm support.
     */
    getShellCommand(nodePath: string, scriptPath: string): string {
        // If nodePath is absolute, use it directly
        if (nodePath.startsWith('/')) {
            return `${nodePath} "${scriptPath}"`;
        }
        // Otherwise, source nvm and use the command
        return this.getNvmSourceCommand(`${nodePath} "${scriptPath}"`);
    }
}
