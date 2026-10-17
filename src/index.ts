#!/usr/bin/env node
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { execute } from "./actions.js";
import { gatherContext, listInstalledApps } from "./context.js";
import { contextFreeMatch, contextMatch } from "./fastpath.js";
import { askModel, MODEL } from "./llm.js";
import { sh } from "./osa.js";
import { describe, type Action, type Context } from "./types.js";

const args = process.argv.slice(2);
const flag = (f: string) => {
  const i = args.indexOf(f);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const option = (f: string) => {
  const i = args.indexOf(f);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

const DRY = flag("--dry-run");
const SPEAK = flag("--speak");
const VERBOSE = flag("--verbose");
const CONTEXT_FILE = option("--context"); // JSON fixture instead of reading the real Mac
const LOG_DIR = join(homedir(), ".mac-agent");

async function loadContext(): Promise<Context> {
  if (CONTEXT_FILE) return JSON.parse(await readFile(CONTEXT_FILE, "utf8"));
  try {
    return await gatherContext();
  } catch (e) {
    if (VERBOSE) console.error("Couldn't read open apps/tabs:", (e as Error).message);
    return { frontmost: null, apps: [], tabs: [] };
  }
}

async function log(entry: object): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(join(LOG_DIR, "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

async function handle(text: string): Promise<boolean> {
  const started = Date.now();
  let source = "fast";
  let action: Action | null = contextFreeMatch(text);

  if (!action) {
    const [ctx, installed] = await Promise.all([loadContext(), listInstalledApps()]);
    if (VERBOSE) console.error(`context: ${ctx.apps.length} apps, ${ctx.tabs.length} tabs, front=${ctx.frontmost}`);
    action = contextMatch(text, ctx, installed);
    if (!action) {
      source = MODEL;
      try {
        action = await askModel(text, ctx, installed);
      } catch (e) {
        action = { type: "none", reason: `model error: ${(e as Error).message}. Is Ollama running?` };
      }
    }
  }

  const ms = Date.now() - started;
  const summary = describe(action);
  console.log(`[${source}, ${ms}ms] "${text}" -> ${summary}`);

  let error: string | undefined;
  if (!DRY) {
    try {
      await execute(action);
    } catch (e) {
      error = (e as Error).message;
      console.error(`Failed: ${error}`);
    }
  }
  if (SPEAK) {
    const msg = error ? "That didn't work" : action.type === "none" ? "Sorry, I didn't get that" : "";
    if (msg) await sh("say", [msg]).catch(() => {});
  }
  await log({ text, source, action: summary, ms, dry: DRY, error });
  return action.type !== "none" && !error;
}

async function repl(): Promise<void> {
  console.log(`mac-agent (model: ${MODEL}${DRY ? ", dry run" : ""}). Dictate or type a command, Ctrl+C to quit.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (line) await handle(line);
  }
}

const text = args.join(" ").trim();
if (text) {
  const ok = await handle(text);
  process.exit(ok ? 0 : 1);
} else {
  await repl();
}
