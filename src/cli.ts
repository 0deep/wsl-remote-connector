#!/usr/bin/env node

import { WSLConnector } from './connector';
import { WSLExecServer } from './wsl-exec';

/**
 * CLI tool for wsl-remote-connector
 */

const args = process.argv.slice(2);

const cmdArgs = args;

const command = cmdArgs[0];

async function main() {
    try {
        switch (command) {
            case 'list':
                await listDistros();
                break;

            case 'connect':
                // The first argument after 'connect' is the distro
                await connect(cmdArgs[1]);
                break;

            case 'exec':
                await executeCommand(cmdArgs.slice(1));
                break;

            case 'fs':
                await fileSystemCommand(cmdArgs.slice(1));
                break;

            default:
                showHelp();
                process.exit(command ? 1 : 0);
        }
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

async function listDistros() {
    const wslExec = new WSLExecServer();

    const installed = await wslExec.isWSLInstalled();
    if (!installed) {
        console.log('WSL is not installed');
        return;
    }

    const distros = await wslExec.getDistroList();

    if (distros.length === 0) {
        console.log('No WSL distributions found');
        return;
    }

    console.log('Available WSL distributions:\n');
    for (const distro of distros) {
        const defaultMarker = distro.isDefault ? '* ' : '  ';
        const stateColor = distro.state === 'Running' ? '🟢' : '⚫';
        console.log(`${defaultMarker}${distro.name} (WSL ${distro.version}) ${stateColor} ${distro.state}`);
    }
}

async function connect(distro?: string) {
    console.log(`Connecting to ${distro || 'default distribution'}...`);

    const connector = new WSLConnector();
    const connection = await connector.connect(distro);

    console.log('\n✓ Connected successfully!\n');
    console.log(`Distro:     ${connection.distro}`);
    console.log(`Server PID: ${connection.serverPid}`);

    // Get system info
    const sysInfo = await connection.getSystemInfo();
    console.log(`\nSystem Info:`);
    console.log(`  Platform: ${sysInfo.platform}`);
    console.log(`  Arch:     ${sysInfo.arch}`);
    console.log(`  Node:     ${sysInfo.nodeVersion}`);
    console.log(`  Home:     ${sysInfo.home}`);
    console.log(`  User:     ${sysInfo.user}`);

    // Interactive mode
    console.log('\n--- Interactive Mode (type "exit" to quit) ---\n');

    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => {
        rl.question(`${connection.distro}$ `, async (cmd) => {
            if (cmd === 'exit' || cmd === 'quit') {
                await connector.disconnect();
                rl.close();
                process.exit(0);
            }

            try {
                const result = await connection.exec(cmd);
                if (result.stdout) console.log(result.stdout);
                if (result.stderr) console.error(result.stderr);
            } catch (err: any) {
                console.error('Error:', err.message);
            }

            prompt();
        });
    };

    prompt();
}

async function executeCommand(cmdArgs: string[]) {
    if (cmdArgs.length === 0) {
        console.log('Usage: wsl-remote exec <command>');
        process.exit(1);
    }

    const distroIndex = cmdArgs.indexOf('-d');
    let distro: string | undefined;
    let command: string;

    if (distroIndex !== -1 && cmdArgs[distroIndex + 1]) {
        distro = cmdArgs[distroIndex + 1];
        cmdArgs.splice(distroIndex, 2);
    }

    command = cmdArgs.join(' ');

    const connector = new WSLConnector();
    const connection = await connector.connect(distro);

    const result = await connection.exec(command);

    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);

    await connector.disconnect();
    process.exit(result.exitCode);
}

async function fileSystemCommand(fsArgs: string[]) {
    const subCommand = fsArgs[0];
    const distroIndex = fsArgs.indexOf('-d');
    let distro: string | undefined;

    if (distroIndex !== -1 && fsArgs[distroIndex + 1]) {
        distro = fsArgs[distroIndex + 1];
        fsArgs.splice(distroIndex, 2);
    }

    const connector = new WSLConnector();
    const connection = await connector.connect(distro);

    try {
        switch (subCommand) {
            case 'ls':
                const entries = await connection.fs.readDir(fsArgs[1] || '.');
                for (const entry of entries) {
                    const type = entry.isDirectory ? 'd' : '-';
                    const size = entry.isDirectory ? '-' : entry.size.toString();
                    console.log(`${type} ${size.padStart(10)}  ${entry.name}`);
                }
                break;

            case 'cat':
                if (!fsArgs[1]) {
                    console.log('Usage: wsl-remote fs cat <file>');
                    break;
                }
                const content = await connection.fs.readFile(fsArgs[1]);
                console.log(content);
                break;

            case 'stat':
                if (!fsArgs[1]) {
                    console.log('Usage: wsl-remote fs stat <path>');
                    break;
                }
                const stat = await connection.fs.stat(fsArgs[1]);
                console.log(JSON.stringify(stat, null, 2));
                break;

            default:
                console.log('Unknown fs command. Available: ls, cat, stat');
        }
    } finally {
        await connector.disconnect();
    }
}

function showHelp() {
    console.log(`
wsl-remote - Cross-IDE WSL connection tool (Lightweight Server)

Usage:
  wsl-remote list                     List WSL distributions
  wsl-remote connect [distro]         Connect to WSL (interactive mode)
  wsl-remote exec [-d distro] <cmd>   Execute command in WSL
  wsl-remote fs ls [path]             List directory contents
  wsl-remote fs cat <file>            Read file contents
  wsl-remote fs stat <path>           Get file/directory stats



Examples:
  wsl-remote list
  wsl-remote connect Ubuntu
  wsl-remote exec ls -la
  wsl-remote exec -d Ubuntu "cat /etc/os-release"
  wsl-remote fs ls /home
  wsl-remote fs cat /etc/passwd
  `);
}

main();
