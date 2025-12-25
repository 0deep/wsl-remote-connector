# Test Documentation

## Overview

This document describes the testing strategy and test coverage for the wsl-remote-connector project.

## Test Framework

- **Framework**: Jest
- **Language**: TypeScript (ts-jest)
- **Test Location**: `tests/` directory

## Test Categories

### 1. Unit Tests

#### Type Tests (`tests/types.test.ts`)
Tests all TypeScript interfaces and type definitions:
- ✅ WSLDistro structure and states
- ✅ ExecResult structure
- ✅ FileStat for files and directories
- ✅ SystemInfo structure

**Coverage**: 4 test suites, all passing

#### WSL Execution Tests (`tests/wsl-exec.test.ts`)
Tests the WSL execution layer:
- ✅ WSL installation detection
- ✅ WSL executable path retrieval
- ✅ Distribution list retrieval
- ✅ Default distribution detection
- ✅ Node.js path finding in WSL
- ✅ Shell command generation with nvm support

**Coverage**: 7 test suites, all passing

### 2. Integration Tests

#### CLI Tests (`tests/cli.test.ts`)
Comprehensive tests for all CLI commands:

**Help Command**
- ✅ Display help when no arguments provided
- ✅ Display help for unknown commands

**List Command**
- ✅ List all WSL distributions

**Exec Command**
- ✅ Execute simple commands
- ✅ Execute commands with pipes
- ✅ Show usage when no command provided
- ✅ Handle command errors gracefully
- ✅ Execute commands with specific distribution (-d flag)

**File System Commands**
- ✅ `fs ls` - List directory contents
- ✅ `fs ls` - List current directory (default)
- ✅ `fs cat` - Read file contents
- ✅ `fs cat` - Show usage when no file provided
- ✅ `fs cat` - Handle non-existent files
- ✅ `fs stat` - Get file statistics
- ✅ `fs stat` - Get directory statistics
- ✅ `fs stat` - Show usage when no path provided
- ✅ Unknown fs subcommands - Show available commands

**Coverage**: 17 test suites, all passing

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

## Test Results

### Latest Test Run
- **Total Tests**: 31
- **Passed**: 31 ✅
- **Failed**: 0
- **Test Suites**: 3
- **Duration**: ~9 seconds

### Coverage Summary
The test suite provides comprehensive coverage of:
- All CLI commands and their variations
- Error handling and edge cases
- WSL distribution management
- File system operations
- Type definitions and interfaces

## Continuous Integration

Tests are designed to run in CI/CD environments:
- Fast execution (~9 seconds total)
- No external dependencies required (except WSL on Windows)
- Clear pass/fail indicators
- Detailed error messages for debugging

## Adding New Tests

### For Unit Tests
1. Create a new file in `tests/` with `.test.ts` extension
2. Import the module to test
3. Write test suites using Jest's `describe` and `test` functions
4. Run `npm run test:unit` to verify

### For Integration Tests
1. Add test cases to `tests/cli.test.ts`
2. Use the `runCLI` helper function
3. Set appropriate timeouts for WSL operations (typically 10000ms)
4. Run `npm run test:integration` to verify

## Best Practices

1. **Isolation**: Each test should be independent
2. **Timeouts**: WSL operations need longer timeouts (10000ms)
3. **Error Handling**: Test both success and failure cases
4. **Descriptive Names**: Test names should clearly describe what they test
5. **Assertions**: Use specific assertions (e.g., `toContain`, `toBe`)

## Known Limitations

- Tests require WSL to be installed on Windows
- Some tests may skip if WSL is not available
- Integration tests are slower due to actual WSL execution
- Coverage excludes `cli.ts` as it's tested through integration tests
