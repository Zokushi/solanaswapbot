#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the path to tsx - use the .cmd extension for Windows
const tsxPath = join(process.cwd(), 'node_modules', '.bin', 'tsx.cmd');

// Get the correct path to cli.ts
const cliPath = join(process.cwd(), 'src', 'cli.ts');

// Spawn the CLI process with proper terminal control
const cli = spawn(tsxPath, [cliPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    FORCE_COLOR: '1'
  },
  shell: true // Add shell option for Windows compatibility
});

cli.on('error', (err) => {
  console.error('Failed to start CLI:', err);
  process.exit(1);
});

cli.on('exit', (code) => {
  process.exit(code);
}); 