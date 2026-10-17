import { appByName } from "./resolve.js";
import type { Action, AppInfo, Context } from "./types.js";

export const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";
const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

const ACTIONS = [
  "mission_control", "app_expose", "switch_desktop", "go_to_desktop",
  "focus_app", "hide_app", "quit_app", "focus_tab", "close_tab",
  "open_url", "web_search", "none",
] as const;

// Ollama's structured outputs: the model is forced to produce this shape.
const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ACTIONS },
    app: { type: "string" },
    tab: { type: "integer" },
    direction: { type: "string", enum: ["left", "right"] },
    desktop: { type: "integer" },
    url: { type: "string" },
    query: { type: "string" },
    reason: { type: "string" },
  },
  required: ["action"],
};

const INSTRUCTIONS = `You control a Mac. Turn the user's spoken command into exactly ONE action. Reply with JSON only.

Actions:
- mission_control: show all open windows and desktops (e.g. "screen selection", "show me everything")
- app_expose: show all windows of the current app
- switch_desktop: move one desktop over. Needs "direction": "left" or "right"
- go_to_desktop: needs "desktop": a number
- focus_app: open or switch to an app. Needs "app": the app name. Works whether or not the app is already open, macOS jumps to whichever desktop it is on.
- hide_app, quit_app: needs "app"
- focus_tab: switch to a browser tab that is already open. Needs "tab": the number in [brackets] from the tab list
- close_tab: needs "tab"
- open_url: open a website that is NOT already open. Needs "url"
- web_search: search the web. Needs "query"
- none: the command is unclear, unsafe or impossible. Give a short "reason"

Rules:
- If a matching tab is already open, use focus_tab, never open_url.
- Things that are desktop apps (Slack, Notes, VS Code, Spotify) use focus_app, even if not in the running list.
- "this tab" / "current tab" means the tab marked ACTIVE in the frontmost window of the frontmost browser.
- Dictation can mishear words. Pick the closest sensible match from the lists.
- If two choices are equally likely, prefer the one already open.

Examples:
"take me to my email" with a Gmail tab [3] open -> {"action":"focus_tab","tab":3}
"open youtube" with no YouTube tab -> {"action":"open_url","url":"https://www.youtube.com"}
"I need to message the team" with Slack running -> {"action":"focus_app","app":"Slack"}
"shut down spotify" -> {"action":"quit_app","app":"Spotify"}
"what's the weather" -> {"action":"none","reason":"not a Mac control command"}`;

function describeContext(ctx: Context): string {
  const lines: string[] = [];
  lines.push(`Frontmost app: ${ctx.frontmost ?? "unknown"}`);
  lines.push(`Running apps: ${ctx.apps.map((a) => a.name).join(", ") || "none"}`);
  if (ctx.tabs.length) {
    lines.push("Open browser tabs:");
    for (const t of ctx.tabs.slice(0, 80)) {
      let host = "";
      try {
        host = new URL(t.url).hostname.replace(/^www\./, "");
      } catch {}
      const title = t.title.length > 80 ? t.title.slice(0, 77) + "..." : t.title;
      lines.push(
        `[${t.id}] ${t.browser}, window ${t.windowIndex + 1}${t.active ? " ACTIVE" : ""}: ${title} (${host})`,
      );
    }
  } else {
    lines.push("Open browser tabs: none");
  }
  return lines.join("\n");
}

interface ModelReply {
  action: (typeof ACTIONS)[number];
  app?: string;
  tab?: number;
  direction?: "left" | "right";
  desktop?: number;
  url?: string;
  query?: string;
  reason?: string;
}

export async function askModel(command: string, ctx: Context, installed: AppInfo[]): Promise<Action> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: SCHEMA,
      keep_alive: "30m", // keep the model loaded so later commands are fast
      options: { temperature: 0 },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: `${describeContext(ctx)}\n\nCommand: "${command}"` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { message?: { content?: string } };
  let reply: ModelReply;
  try {
    reply = JSON.parse(body.message?.content ?? "");
  } catch {
    return { type: "none", reason: "model did not return valid JSON" };
  }
  return toAction(reply, ctx, installed);
}

/** Validate the model's choice against what's actually open. */
export function toAction(r: ModelReply, ctx: Context, installed: AppInfo[]): Action {
  const tabById = (id?: number) => ctx.tabs.find((t) => t.id === id);
  switch (r.action) {
    case "mission_control":
    case "app_expose":
      return { type: r.action };
    case "switch_desktop":
      return r.direction
        ? { type: "switch_desktop", direction: r.direction }
        : { type: "none", reason: "no direction given" };
    case "go_to_desktop":
      return r.desktop && r.desktop >= 1 && r.desktop <= 9
        ? { type: "go_to_desktop", number: r.desktop }
        : { type: "none", reason: "desktop number must be 1-9" };
    case "focus_app":
    case "hide_app":
    case "quit_app": {
      if (!r.app) return { type: "none", reason: "no app named" };
      const app = appByName(r.app, ctx, installed);
      if (r.action !== "focus_app" && !app.running)
        return { type: "none", reason: `${r.app} isn't running` };
      return { type: r.action, app };
    }
    case "focus_tab":
    case "close_tab": {
      const tab = tabById(r.tab);
      return tab ? { type: r.action, tab } : { type: "none", reason: `no tab ${r.tab}` };
    }
    case "open_url":
      return r.url ? { type: "open_url", url: r.url } : { type: "none", reason: "no url" };
    case "web_search":
      return r.query ? { type: "web_search", query: r.query } : { type: "none", reason: "no query" };
    default:
      return { type: "none", reason: r.reason ?? "unclear command" };
  }
}
