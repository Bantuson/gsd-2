/**
 * Kill any process holding a given TCP port before we try to bind it.
 * Prevents "EADDRINUSE" crashes when a previous server process wasn't cleanly shut down.
 *
 * Security hardening (T-EXEC-01 B22): Uses execFile with array arguments instead of
 * execSync with string-interpolated template literals to prevent command injection.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function getPidsOnPort(port: number): Promise<number[]> {
  try {
    if (process.platform === "win32") {
      // netstat with array args — no string interpolation
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"]);
      const pids = new Set<number>();
      const portStr = String(port);
      for (const line of stdout.split("\n")) {
        // Only match lines with the exact port in LISTENING state
        if (
          line.includes(`:${portStr} `) ||
          line.includes(`:${portStr}\t`)
        ) {
          if (line.includes("LISTENING")) {
            const parts = line.trim().split(/\s+/);
            // Format: Proto  LocalAddr  ForeignAddr  State  PID
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid && !isNaN(pid) && pid !== process.pid) {
              pids.add(pid);
            }
          }
        }
      }
      return [...pids];
    } else {
      // lsof with array args — port passed as separate argument token
      const portStr = String(port);
      const { stdout } = await execFileAsync("lsof", ["-t", `-i:${portStr}`]);
      return stdout
        .split("\n")
        .map((l) => parseInt(l.trim(), 10))
        .filter((p) => !isNaN(p) && p !== process.pid);
    }
  } catch {
    return [];
  }
}

async function killPid(pid: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      // taskkill with array args — no string interpolation
      await execFileAsync("taskkill", ["/PID", String(pid), "/F"]);
    } else {
      // Use process.kill for POSIX — no shell involved
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Process may have already exited
  }
}

/**
 * Free a port by killing whatever process is holding it.
 * Waits briefly after killing to let the OS reclaim the port.
 */
export async function freePort(port: number): Promise<void> {
  // Validate port is in valid range
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  const pids = await getPidsOnPort(port);
  if (pids.length === 0) return;

  console.log(
    `[kill-port] Port ${port} held by PID(s) ${pids.join(", ")} — killing...`
  );
  for (const pid of pids) {
    await killPid(pid);
  }

  // Wait for OS to reclaim the port (up to 2s)
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(100);
    if ((await getPidsOnPort(port)).length === 0) break;
  }
}
