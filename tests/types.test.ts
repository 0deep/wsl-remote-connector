/**
 * Unit tests for type definitions and interfaces
 */

import { WSLDistro, ExecResult, FileStat, SystemInfo } from '../src/types';

describe('Type Definitions', () => {
    describe('WSLDistro', () => {
        test('should have correct structure', () => {
            const distro: WSLDistro = {
                name: 'Ubuntu',
                version: 2,
                state: 'Running',
                isDefault: true
            };

            expect(distro.name).toBe('Ubuntu');
            expect(distro.version).toBe(2);
            expect(distro.state).toBe('Running');
            expect(distro.isDefault).toBe(true);
        });

        test('should accept Stopped state', () => {
            const distro: WSLDistro = {
                name: 'Debian',
                version: 1,
                state: 'Stopped',
                isDefault: false
            };

            expect(distro.state).toBe('Stopped');
        });
    });

    describe('ExecResult', () => {
        test('should have correct structure', () => {
            const result: ExecResult = {
                stdout: 'output',
                stderr: '',
                exitCode: 0
            };

            expect(result.stdout).toBe('output');
            expect(result.stderr).toBe('');
            expect(result.exitCode).toBe(0);
        });

        test('should handle error case', () => {
            const result: ExecResult = {
                stdout: '',
                stderr: 'error message',
                exitCode: 1
            };

            expect(result.stderr).toBe('error message');
            expect(result.exitCode).toBe(1);
        });
    });

    describe('FileStat', () => {
        test('should represent file correctly', () => {
            const fileStat: FileStat = {
                name: 'test.txt',
                path: '/home/user/test.txt',
                size: 1024,
                isDirectory: false,
                isFile: true,
                mtime: Date.now(),
                ctime: Date.now()
            };

            expect(fileStat.isFile).toBe(true);
            expect(fileStat.isDirectory).toBe(false);
            expect(fileStat.size).toBeGreaterThan(0);
        });

        test('should represent directory correctly', () => {
            const dirStat: FileStat = {
                name: 'mydir',
                path: '/home/user/mydir',
                size: 4096,
                isDirectory: true,
                isFile: false,
                mtime: Date.now(),
                ctime: Date.now()
            };

            expect(dirStat.isDirectory).toBe(true);
            expect(dirStat.isFile).toBe(false);
        });
    });

    describe('SystemInfo', () => {
        test('should have correct structure', () => {
            const sysInfo: SystemInfo = {
                platform: 'linux',
                arch: 'x64',
                nodeVersion: 'v18.0.0',
                cwd: '/home/user',
                home: '/home/user',
                user: 'user',
                pid: 12345
            };

            expect(sysInfo.platform).toBe('linux');
            expect(sysInfo.arch).toBe('x64');
            expect(sysInfo.nodeVersion).toMatch(/^v\d+/);
            expect(sysInfo.pid).toBeGreaterThan(0);
        });
    });
});
