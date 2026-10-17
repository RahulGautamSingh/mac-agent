import { BROWSERS } from "./context.js";
import { findApp, findTabs, isBrowser, norm } from "./resolve.js";
import type { Action, AppInfo, Context, TabInfo } from "./types.js";

/**
 * Deterministic matching for common phrasings. Anything it can't handle
 * confidently returns null and goes to the model.
 */

const LEAD_FILLER =
  /^(?:(?:hey|ok|okay|please|can you|could you|would you|will you|i want to|i want|i d like to|let s|lets|just|now)\s+)+/;
const TAIL_FILLER = /(?:\s+(?:please|now|for me|right now))+$/;

export function clean(text: string): string {
  return norm(text).replace(LEAD_FILLER, "").replace(TAIL_FILLER, "").trim();
}

const NUM_WORDS: Record<string, number> = {
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};
const toNum = (w: string) => (/^\d$/.test(w) ? Number(w) : NUM_WORDS[w]);

/** Rules that need no knowledge of what's open. Checked first, so they're instant. */
export function contextFreeMatch(raw: string): Action | null {
  const t = clean(raw);

  if (
    /^(?:screen selection|select (?:a )?screen|mission control|show everything|everything|all (?:screens|windows)|show (?:me )?(?:all )?(?:my )?(?:open )?(?:screens|windows|desktops|spaces|apps))$/.test(t)
  )
    return { type: "mission_control" };

  if (/^(?:app expose|app windows|show (?:this |the )?app(?:s)? windows|all windows of this app)$/.test(t))
    return { type: "app_expose" };

  let m = t.match(/^(?:(?:go|move|switch)(?: to)? )?(?:the )?(next|previous|prev|left|right) (?:desktop|screen|space)$/);
  if (m) return { type: "switch_desktop", direction: m[1] === "next" || m[1] === "right" ? "right" : "left" };

  m = t.match(/^(?:go|move|switch) (left|right)$/);
  if (m) return { type: "switch_desktop", direction: m[1] as "left" | "right" };

  m = t.match(/^(?:(?:go|move|switch)(?: to)? )?(?:desktop|space|screen)(?: number)? (\w+)$/);
  if (m) {
    const n = toNum(m[1]);
    if (n) return { type: "go_to_desktop", number: n };
  }

  m = t.match(/^(?:search|google|look up)(?: for)? (.+)$/);
  if (m) return { type: "web_search", query: m[1] };

  return null;
}

/** The tab "this tab" refers to: active tab of the front window of the front browser. */
function currentTab(ctx: Context): TabInfo | null {
  const browser: string | null | undefined = isBrowser(ctx.frontmost, BROWSERS)
    ? ctx.frontmost
    : ctx.tabs[0]?.browser;
  return ctx.tabs.find((t) => t.browser === browser && t.windowIndex === 0 && t.active) ?? null;
}

/** "Slack", "my gmail tab", "VS Code" → an app or a tab, if clearly one or the other. */
function resolveTarget(target: string, ctx: Context, installed: AppInfo[]): Action | null {
  const wantsTab = /\btabs?\b/.test(target);
  const app = wantsTab ? null : findApp(target, ctx, installed);

  if (app && app.score >= 0.8) return { type: "focus_app", app: app.app };

  const tabs = findTabs(target, ctx.tabs);
  if (tabs.length) return { type: "focus_tab", tab: tabs[0] };

  if (app && app.score >= 0.75) return { type: "focus_app", app: app.app };
  return null;
}

export function contextMatch(raw: string, ctx: Context, installed: AppInfo[]): Action | null {
  const t = clean(raw);

  if (/^close (?:this|the|current)? ?tab$/.test(t)) {
    const tab = currentTab(ctx);
    return tab ? { type: "close_tab", tab } : null;
  }

  let m = t.match(/^close (?:the |my )?(.+?) tab$/);
  if (m) {
    const tabs = findTabs(m[1], ctx.tabs);
    return tabs.length ? { type: "close_tab", tab: tabs[0] } : null;
  }

  m = t.match(/^(?:quit|exit|kill) (.+)$/);
  if (m) {
    const app = findApp(m[1], ctx, []);
    return app && app.score >= 0.8 ? { type: "quit_app", app: app.app } : null;
  }

  m = t.match(/^hide (.+)$/);
  if (m) {
    const app = findApp(m[1], ctx, []);
    return app && app.score >= 0.8 ? { type: "hide_app", app: app.app } : null;
  }

  m = t.match(/^(?:open|switch to|go to|go back to|show|launch|bring up|start|take me to|jump to|focus) (.+)$/);
  if (m) return resolveTarget(m[1], ctx, installed);

  // A bare name ("Slack") only counts if it's an exact app name.
  const bare = findApp(t, ctx, installed);
  if (bare && bare.score >= 1) return { type: "focus_app", app: bare.app };

  return null;
}
