#!/usr/bin/env node
/**
 * Frees local dev ports before `npm run dev` so restarts don't hit EADDRINUSE.
 */
const { execSync } = require('child_process');

const DEV_PORTS = [3001];

function killPort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const pids = [
        ...new Set(
          out
            .split('\n')
            .map((line) => line.trim().split(/\s+/).pop())
            .filter((pid) => pid && /^\d+$/.test(pid))
        ),
      ];
      for (const pid of pids) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      }
      if (pids.length) {
        console.log(`Freed port ${port}`);
      }
    } catch {
      // nothing listening
    }
    return;
  }

  try {
    const out = execSync(`lsof -ti:${port}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const pids = out.trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // process already exited
      }
    }
    if (pids.length) {
      console.log(`Freed port ${port}`);
    }
  } catch {
    // nothing listening
  }
}

for (const port of DEV_PORTS) {
  killPort(port);
}
