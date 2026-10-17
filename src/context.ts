import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { jxa } from "./osa.js";
import type { AppInfo, Context, TabInfo } from "./types.js";

/** Browsers whose tabs we can read and switch via AppleScript. */
export const BROWSERS = ["Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium", "Safari"];

// Only browsers that are already running are queried. Talking to a browser
// that isn't running would launch it, which we never want just to read state.
const CONTEXT_SCRIPT = `
function run(argv) {
  const browsers = JSON.parse(argv[0]);
  const se = Application("System Events");
  const procs = se.applicationProcesses.whose({ backgroundOnly: false });
  const names = procs.name();
  const ids = procs.bundleIdentifier();
  const fronts = procs.frontmost();
  // Process names can differ from app names (VS Code runs as "Code"),
  // so read each process's .app file name too.
  const plist = procs();
  const apps = names.map((n, i) => {
    let file = "";
    try { file = plist[i].applicationFile().name(); } catch (e) {}
    return { name: file.replace(/\.app$/, "") || n, processName: n, bundleId: ids[i] || null };
  });
  const fi = fronts.indexOf(true);
  const tabs = [];
  for (const b of browsers) {
    if (names.indexOf(b) === -1) continue;
    let app, wins = [];
    try { app = Application(b); wins = app.windows(); } catch (e) { continue; }
    const isSafari = b === "Safari";
    wins.forEach((w, wi) => {
      try {
        const wid = w.id();
        const titles = isSafari ? w.tabs.name() : w.tabs.title();
        const urls = w.tabs.url();
        const active = isSafari ? w.currentTab.index() : w.activeTabIndex();
        titles.forEach((t, ti) => tabs.push({
          browser: b, windowId: wid, windowIndex: wi, tabIndex: ti,
          title: t || "", url: urls[ti] || "", active: ti + 1 === active
        }));
      } catch (e) { /* windows without tabs, e.g. settings */ }
    });
  }
  return JSON.stringify({ frontmost: fi >= 0 ? names[fi] : null, apps, tabs });
}`;

export async function gatherContext(): Promise<Context> {
  const raw = JSON.parse(await jxa(CONTEXT_SCRIPT, [JSON.stringify(BROWSERS)]));
  return {
    frontmost: raw.frontmost,
    apps: raw.apps.map((a: Omit<AppInfo, "running">) => ({ ...a, running: true })),
    tabs: raw.tabs.map((t: Omit<TabInfo, "id">, i: number) => ({ ...t, id: i + 1 })),
  };
}

const APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  join(homedir(), "Applications"),
];

let installedCache: AppInfo[] | null = null;

/** Installed .app bundles, so "open Notion" works even when it isn't running. */
export async function listInstalledApps(): Promise<AppInfo[]> {
  if (installedCache) return installedCache;
  const out: AppInfo[] = [];
  for (const dir of APP_DIRS) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.endsWith(".app")) {
        out.push({ name: e.slice(0, -4), bundleId: null, running: false, path: join(dir, e) });
      }
    }
  }
  installedCache = out;
  return out;
}
