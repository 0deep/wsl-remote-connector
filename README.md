# wsl-remote-connector

Cross-IDE WSL connection library with a lightweight JSON-RPC server.

## Features

- 🚀 **Lightweight** - Minimal footprint, no heavy dependencies
- 🔌 **JSON-RPC** - Standard protocol over stdin/stdout or TCP
- 📁 **File System** - Read, write, list, stat, mkdir, delete, copy, move
- ⚡ **Process Execution** - Run commands and spawn processes
- 🔄 **Streaming** - Real-time stdout/stderr from spawned processes
- 🎯 **Cross-IDE** - Works with any IDE that can spawn processes or connect via TCP

## Installation (Library)

```bash
npm install wsl-remote-connector
```

## CLI Usage

```bash
# List WSL distributions
wsl-remote list

# Connect to WSL (interactive mode)
wsl-remote connect [distro]

# Execute command
wsl-remote exec [-d distro] <command>

# File system operations
wsl-remote fs ls /home
wsl-remote fs cat /etc/passwd
wsl-remote fs stat /home/user
```

## API Usage

### Standard Connection (stdio)

```typescript
import { WSLConnector } from 'wsl-remote-connector';

async function main() {
  const connector = new WSLConnector();
  const connection = await connector.connect('Ubuntu');

  // Get system info
  const info = await connection.getSystemInfo();
  console.log(`Connected to ${info.platform} (${info.arch})`);

  // Execute commands
  const result = await connection.exec('ls -la');
  console.log(result.stdout);

  // Cleanup
  await connector.disconnect();
}
```

### TCP Connection

```typescript
const connector = new WSLConnector({
  useTcp: true,
  tcpPort: 50001
});

const connection = await connector.connect('Ubuntu');
```

## Testing

This project uses Jest for testing with comprehensive test coverage.

### Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests (CLI tests)
npm run test:integration
```

## Architecture

```
Windows Host                          WSL (Linux)
┌─────────────────┐                  ┌─────────────────┐
│   Your IDE      │                  │  wsl-remote     │
│   (any IDE)     │                  │  server         │
│                 │                  │                 │
│  ┌────────────┐ │  stdin/stdout    │  ┌───────────┐  │
│  │WSLConnector│ │ ◄─────────────►  │  │JSON-RPC   │  │
│  │            │ │       OR         │  │Server     │  │
│  └────────────┘ │      TCP         │  └───────────┘  │
└─────────────────┘                  └─────────────────┘
```

## Server Protocol

The server uses JSON-RPC 2.0 over stdin/stdout or TCP.

### File System Methods

| Method | Parameters | Returns |
|--------|------------|---------|
| `fs/readFile` | `{ path, encoding? }` | `string` |
| `fs/writeFile` | `{ path, content, encoding? }` | `boolean` |
| `fs/readDir` | `{ path }` | `FileStat[]` |
| `fs/stat` | `{ path }` | `FileStat` |
| `fs/mkdir` | `{ path, recursive? }` | `boolean` |
| `fs/delete` | `{ path, recursive? }` | `boolean` |
| `fs/exists` | `{ path }` | `boolean` |
| `fs/copy` | `{ src, dest }` | `boolean` |
| `fs/move` | `{ src, dest }` | `boolean` |

### Process Methods

| Method | Parameters | Returns |
|--------|------------|---------|
| `process/exec` | `{ command, cwd?, env? }` | `{ stdout, stderr, exitCode }` |
| `process/spawn` | `{ command, args?, cwd?, env? }` | `pid` |
| `process/kill` | `{ pid }` | `boolean` |
| `process/write` | `{ pid, data }` | `boolean` |

### System Methods

| Method | Parameters | Returns |
|--------|------------|---------|
| `system/info` | - | `SystemInfo` |
| `system/env` | - | `Record<string, string>` |

### Notifications (Server → Client)

| Method | Parameters |
|--------|------------|
| `server/ready` | `{ version, pid, transport }` |
| `process/stdout` | `{ pid, data }` |
| `process/stderr` | `{ pid, data }` |
| `process/exit` | `{ pid, code }` |

## License

MIT
