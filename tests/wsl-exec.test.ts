/**
 * Unit tests for WSLExecServer
 */

import { WSLExecServer } from '../src/wsl-exec';

describe('WSLExecServer', () => {
    let wslExec: WSLExecServer;

    beforeEach(() => {
        wslExec = new WSLExecServer();
    });

    describe('isWSLInstalled', () => {
        test('should return boolean indicating WSL installation status', async () => {
            const result = await wslExec.isWSLInstalled();
            expect(typeof result).toBe('boolean');
        });
    });

    describe('getWSLExecutablePath', () => {
        test('should return wsl.exe path', () => {
            const path = wslExec.getWSLExecutablePath();
            expect(path).toBe('wsl.exe');
        });
    });

    describe('getDistroList', () => {
        test('should return array of distros', async () => {
            const installed = await wslExec.isWSLInstalled();
            if (!installed) {
                console.log('WSL not installed, skipping test');
                return;
            }

            const distros = await wslExec.getDistroList();
            expect(Array.isArray(distros)).toBe(true);

            if (distros.length > 0) {
                const distro = distros[0];
                expect(distro).toHaveProperty('name');
                expect(distro).toHaveProperty('state');
                expect(distro).toHaveProperty('version');
                expect(distro).toHaveProperty('isDefault');
                expect(['Running', 'Stopped']).toContain(distro.state);
            }
        }, 10000);
    });

    describe('getDefaultDistro', () => {
        test('should return default distro name or undefined', async () => {
            const installed = await wslExec.isWSLInstalled();
            if (!installed) {
                console.log('WSL not installed, skipping test');
                return;
            }

            const defaultDistro = await wslExec.getDefaultDistro();
            if (defaultDistro !== undefined) {
                expect(typeof defaultDistro).toBe('string');
                expect(defaultDistro.length).toBeGreaterThan(0);
            }
        }, 10000);
    });

    describe('findNodePath', () => {
        test('should find node path in WSL', async () => {
            const installed = await wslExec.isWSLInstalled();
            if (!installed) {
                console.log('WSL not installed, skipping test');
                return;
            }

            const nodePath = await wslExec.findNodePath(undefined);
            if (nodePath !== undefined) {
                expect(nodePath).toMatch(/^\//); // Should start with /
                expect(nodePath).toContain('node');
            }
        }, 10000);
    });

    describe('getShellCommand', () => {
        test('should return command with absolute node path', () => {
            const cmd = wslExec.getShellCommand('/usr/bin/node', '/path/to/script.js');
            expect(cmd).toContain('/usr/bin/node');
            expect(cmd).toContain('/path/to/script.js');
        });

        test('should return command with nvm support for relative paths', () => {
            const cmd = wslExec.getShellCommand('node', '/path/to/script.js');
            expect(cmd).toContain('nvm.sh');
            expect(cmd).toContain('node');
            expect(cmd).toContain('/path/to/script.js');
        });
    });
});
