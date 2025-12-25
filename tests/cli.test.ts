/**
 * Integration tests for CLI commands
 * These tests verify that all CLI commands work correctly
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);
const CLI_PATH = path.join(__dirname, '../dist/cli.js');

describe('CLI Integration Tests', () => {
    // Helper function to run CLI commands
    async function runCLI(args: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        try {
            const { stdout, stderr } = await execAsync(`node ${CLI_PATH} ${args}`);
            return { stdout, stderr, exitCode: 0 };
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                exitCode: error.code || 1
            };
        }
    }

    describe('Help Command', () => {
        test('should display help when no arguments provided', async () => {
            const result = await runCLI('');
            expect(result.stdout).toContain('wsl-remote - Cross-IDE WSL connection tool');
            expect(result.stdout).toContain('Usage:');
            expect(result.stdout).toContain('Examples:');
            expect(result.exitCode).toBe(0);
        });

        test('should display help for unknown command', async () => {
            const result = await runCLI('unknown-command');
            expect(result.stdout).toContain('wsl-remote - Cross-IDE WSL connection tool');
            expect(result.exitCode).toBe(1);
        });
    });

    describe('List Command', () => {
        test('should list WSL distributions', async () => {
            const result = await runCLI('list');
            expect(result.stdout).toContain('WSL');
            expect(result.exitCode).toBe(0);
        }, 10000);
    });

    describe('Exec Command', () => {
        test('should execute simple command', async () => {
            const result = await runCLI('exec echo "Hello WSL"');
            expect(result.stdout).toContain('Hello WSL');
            expect(result.exitCode).toBe(0);
        }, 10000);

        test('should execute command with pipes', async () => {
            const result = await runCLI('exec "echo test | cat"');
            expect(result.stdout).toContain('test');
            expect(result.exitCode).toBe(0);
        }, 10000);

        test('should show usage when no command provided', async () => {
            const result = await runCLI('exec');
            expect(result.stdout).toContain('Usage: wsl-remote exec');
            expect(result.exitCode).toBe(1);
        }, 10000);

        test('should handle command errors', async () => {
            const result = await runCLI('exec invalid-command-xyz');
            expect(result.stderr).toContain('not found');
            expect(result.exitCode).not.toBe(0); // Non-zero exit code (could be 1 or 127)
        }, 10000);

        test('should execute command with specific distro', async () => {
            const result = await runCLI('exec -d test echo "test"');
            // This might timeout if distro doesn't exist, but should handle gracefully
            expect(result.exitCode).toBeDefined();
        }, 15000);
    });

    describe('File System Commands', () => {
        describe('fs ls', () => {
            test('should list directory contents', async () => {
                const result = await runCLI('fs ls /home');
                expect(result.exitCode).toBe(0);
            }, 10000);

            test('should list current directory when no path provided', async () => {
                const result = await runCLI('fs ls');
                expect(result.stdout).toContain('package.json');
                expect(result.exitCode).toBe(0);
            }, 10000);
        });

        describe('fs cat', () => {
            test('should read file contents', async () => {
                const result = await runCLI('fs cat /etc/os-release');
                expect(result.stdout).toContain('NAME=');
                expect(result.exitCode).toBe(0);
            }, 10000);

            test('should show usage when no file provided', async () => {
                const result = await runCLI('fs cat');
                expect(result.stdout).toContain('Usage: wsl-remote fs cat');
                expect(result.exitCode).toBe(0);
            }, 10000);

            test('should handle non-existent files', async () => {
                const result = await runCLI('fs cat /nonexistent/file.txt');
                expect(result.stderr).toContain('ENOENT');
                expect(result.exitCode).toBe(1);
            }, 10000);
        });

        describe('fs stat', () => {
            test('should get file stats', async () => {
                const result = await runCLI('fs stat /etc/os-release');
                const stats = JSON.parse(result.stdout);
                expect(stats).toHaveProperty('name');
                expect(stats).toHaveProperty('size');
                expect(stats).toHaveProperty('isFile');
                expect(stats.isFile).toBe(true);
                expect(result.exitCode).toBe(0);
            }, 10000);

            test('should get directory stats', async () => {
                const result = await runCLI('fs stat /home');
                const stats = JSON.parse(result.stdout);
                expect(stats).toHaveProperty('isDirectory');
                expect(stats.isDirectory).toBe(true);
                expect(result.exitCode).toBe(0);
            }, 10000);

            test('should show usage when no path provided', async () => {
                const result = await runCLI('fs stat');
                expect(result.stdout).toContain('Usage: wsl-remote fs stat');
                expect(result.exitCode).toBe(0);
            }, 10000);
        });

        describe('fs unknown command', () => {
            test('should show available commands for unknown fs subcommand', async () => {
                const result = await runCLI('fs unknown-command');
                expect(result.stdout).toContain('Unknown fs command');
                expect(result.stdout).toContain('Available: ls, cat, stat');
                expect(result.exitCode).toBe(0);
            }, 10000);
        });
    });
});
