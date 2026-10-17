import { jxa, sh } from "./osa.js";
import type { Action, TabInfo } from "./types.js";

// macOS virtual key codes
const KEY = { left: 123, right: 124, down: 125, up: 126 } as const;
const DIGIT_KEY: Record<number, number> = { 1: 18, 2: 19, 3: 20, 4: 21, 5: 23, 6: 22, 7: 26, 8: 28, 9: 25 };

async function ctrlKey(code: number): Promise<void> {
  // Needs Accessibility permission for whatever launched this process.
  await jxa(
    `function run(argv) { Application("System Events").keyCode(Number(argv[0]), { using: "control down" }); }`,
    [code],
  );
}

const TAB_SCRIPT = `
function run(argv) {
  const b = argv[0], wid = Number(argv[1]), ti = Number(argv[2]), op = argv[3];
  const app = Application(b);
  const w = app.windows.byId(wid);
  if (op === "close") { w.tabs[ti].close(); return "closed"; }
  if (b === "Safari") w.currentTab = w.tabs[ti]; else w.activeTabIndex = ti + 1;
  w.index = 1;
  app.activate();
  return "focused";
}`;

async function tabOp(tab: TabInfo, op: "focus" | "close"): Promise<void> {
  await jxa(TAB_SCRIPT, [tab.browser, tab.windowId, tab.tabIndex, op]);
}

function withScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

export async function execute(a: Action): Promise<void> {
  switch (a.type) {
    case "mission_control":
      return sh("open", ["-a", "Mission Control"]);
    case "app_expose":
      return ctrlKey(KEY.down);
    case "switch_desktop":
      return ctrlKey(a.direction === "left" ? KEY.left : KEY.right);
    case "go_to_desktop":
      // Needs System Settings > Keyboard > Keyboard Shortcuts > Mission Control
      // > "Switch to Desktop N" turned on.
      return ctrlKey(DIGIT_KEY[a.number]);
    case "focus_app":
      // `open` launches the app if needed, or brings it forward and jumps to
      // the desktop its window is on. Like a Dock click, it also reopens a
      // window if the app was running with none.
      if (a.app.bundleId) return sh("open", ["-b", a.app.bundleId]);
      return sh("open", ["-a", a.app.path ?? a.app.name]);
    case "hide_app":
      await jxa(
        `function run(argv) { Application("System Events").applicationProcesses.byName(argv[0]).visible = false; }`,
        [a.app.processName ?? a.app.name],
      );
      return;
    case "quit_app":
      await jxa(`function run(argv) { Application(argv[0]).quit(); }`, [a.app.bundleId ?? a.app.name]);
      return;
    case "focus_tab":
      return tabOp(a.tab, "focus");
    case "close_tab":
      return tabOp(a.tab, "close");
    case "open_url":
      return sh("open", [withScheme(a.url)]);
    case "web_search":
      return sh("open", [`https://www.google.com/search?q=${encodeURIComponent(a.query)}`]);
    case "none":
      return;
  }
}
