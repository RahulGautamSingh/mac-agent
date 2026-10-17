export interface AppInfo {
  /** App name as in /Applications, e.g. "Visual Studio Code" */
  name: string;
  /** Process name when running, e.g. "Code". Used for System Events calls. */
  processName?: string;
  bundleId: string | null;
  running: boolean;
  path?: string;
}

export interface TabInfo {
  /** 1-based id shown to the model, stable within one command */
  id: number;
  browser: string;
  windowId: number;
  /** 0 = frontmost window of that browser */
  windowIndex: number;
  /** 0-based position of the tab in its window */
  tabIndex: number;
  title: string;
  url: string;
  active: boolean;
}

export interface Context {
  frontmost: string | null;
  apps: AppInfo[]; // running, user-facing apps
  tabs: TabInfo[];
}

export type Action =
  | { type: "mission_control" }
  | { type: "app_expose" }
  | { type: "switch_desktop"; direction: "left" | "right" }
  | { type: "go_to_desktop"; number: number }
  | { type: "focus_app"; app: AppInfo }
  | { type: "hide_app"; app: AppInfo }
  | { type: "quit_app"; app: AppInfo }
  | { type: "focus_tab"; tab: TabInfo }
  | { type: "close_tab"; tab: TabInfo }
  | { type: "open_url"; url: string }
  | { type: "web_search"; query: string }
  | { type: "none"; reason: string };

export function describe(a: Action): string {
  switch (a.type) {
    case "focus_app":
    case "hide_app":
    case "quit_app":
      return `${a.type} ${a.app.name}${a.app.running ? "" : " (not running, will launch)"}`;
    case "focus_tab":
    case "close_tab":
      return `${a.type} [${a.tab.browser}] ${a.tab.title}`;
    case "switch_desktop":
      return `switch_desktop ${a.direction}`;
    case "go_to_desktop":
      return `go_to_desktop ${a.number}`;
    case "open_url":
      return `open_url ${a.url}`;
    case "web_search":
      return `web_search "${a.query}"`;
    case "none":
      return `none: ${a.reason}`;
    default:
      return a.type;
  }
}
