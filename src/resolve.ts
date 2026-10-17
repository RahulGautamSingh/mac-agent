import type { AppInfo, Context, TabInfo } from "./types.js";

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const squash = (s: string) => norm(s).replace(/ /g, "");

/** Spoken names that don't match the real app name. Extend freely. */
const SYNONYMS: Record<string, string> = {
  chrome: "Google Chrome",
  "google chrome": "Google Chrome",
  vscode: "Visual Studio Code",
  "vs code": "Visual Studio Code",
  "visual studio": "Visual Studio Code",
  settings: "System Settings",
  "system preferences": "System Settings",
  preferences: "System Settings",
  word: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpoint: "Microsoft PowerPoint",
  "power point": "Microsoft PowerPoint",
  teams: "Microsoft Teams",
  outlook: "Microsoft Outlook",
  edge: "Microsoft Edge",
  brave: "Brave Browser",
  files: "Finder",
  "file manager": "Finder",
  "whats app": "WhatsApp",
  iterm: "iTerm",
  "i term": "iTerm",
  "app store": "App Store",
};

/** Words that mean nothing when naming a target ("open the Slack app"). */
const TARGET_FILLER = new Set(["the", "my", "a", "app", "application", "window", "please", "up", "for", "me"]);

export function cleanTarget(s: string): string {
  return norm(s)
    .split(" ")
    .filter((w) => !TARGET_FILLER.has(w))
    .join(" ");
}

function nameScore(query: string, candidate: string): number {
  const q = squash(query);
  const c = squash(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q) && q.length >= 3) return 0.9;
  if (c.includes(q) && q.length >= 4) return 0.8;
  const qt = norm(query).split(" ");
  const ct = new Set(norm(candidate).split(" "));
  if (qt.every((t) => ct.has(t))) return 0.75;
  return 0;
}

export interface AppMatch {
  app: AppInfo;
  score: number;
}

/** Best app for a spoken name. Running apps win ties over merely installed ones. */
export function findApp(spoken: string, ctx: Context, installed: AppInfo[]): AppMatch | null {
  const target = cleanTarget(spoken);
  if (!target) return null;
  const query = SYNONYMS[target] ?? target;

  let best: AppMatch | null = null;
  const consider = (app: AppInfo, bonus: number) => {
    const s = nameScore(query, app.name);
    if (s === 0) return;
    const score = s + bonus;
    if (!best || score > best.score) best = { app, score };
  };
  for (const a of ctx.apps) consider(a, 0.05);
  for (const a of installed) consider(a, 0);
  if (!best) return null;
  const b = best as AppMatch;
  return { app: b.app, score: Math.min(b.score, 1) };
}

/** Look up a model-supplied app name, falling back to trusting it as given. */
export function appByName(name: string, ctx: Context, installed: AppInfo[]): AppInfo {
  const m = findApp(name, ctx, installed);
  if (m && m.score >= 0.75) return m.app;
  return { name, bundleId: null, running: false };
}

const TAB_STOP = new Set(["the", "my", "a", "tab", "tabs", "page", "website", "site", "in", "on", "chrome", "safari", "browser", "open", "with"]);

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Tabs whose title or domain contain every meaningful spoken word.
 * Ordered so the active tab of the frontmost window comes first.
 */
export function findTabs(spoken: string, tabs: TabInfo[]): TabInfo[] {
  const words = norm(spoken)
    .split(" ")
    .filter((w) => w && !TAB_STOP.has(w));
  if (!words.length) return [];
  const hits = tabs.filter((t) => {
    const hay = norm(`${t.title} ${host(t.url).replace(/\./g, " ")}`);
    const hayTokens = new Set(hay.split(" "));
    return words.every((w) => hayTokens.has(w) || (w.length >= 4 && hay.includes(w)));
  });
  return hits.sort((a, b) => Number(b.active) - Number(a.active) || a.windowIndex - b.windowIndex);
}

export function isBrowser(app: string | null, browsers: string[]): boolean {
  return !!app && browsers.includes(app);
}
