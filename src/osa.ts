import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

/**
 * Run a JXA (JavaScript for Automation) script. The script must define
 * `function run(argv) { ... }`. Values are passed as argv, never spliced
 * into the script text, so app names and titles can't break or inject code.
 */
export async function jxa(script: string, args: (string | number)[] = []): Promise<string> {
  const { stdout } = await pexec(
    "osascript",
    ["-l", "JavaScript", "-e", script, ...args.map(String)],
    { timeout: 10_000 },
  );
  return stdout.trim();
}

export async function sh(cmd: string, args: string[]): Promise<void> {
  await pexec(cmd, args, { timeout: 10_000 });
}
