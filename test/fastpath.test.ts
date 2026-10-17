import { readFileSync } from "node:fs";
import { contextFreeMatch, contextMatch } from "../src/fastpath.js";
import { toAction } from "../src/llm.js";
import { describe } from "../src/types.js";
import type { AppInfo, Context } from "../src/types.js";

const ctx: Context = JSON.parse(readFileSync(new URL("./fixture-context.json", import.meta.url), "utf8"));
const installed: AppInfo[] = [
  { name: "Slack", bundleId: null, running: false, path: "/Applications/Slack.app" },
  { name: "Visual Studio Code", bundleId: null, running: false, path: "/Applications/Visual Studio Code.app" },
  { name: "Notion", bundleId: null, running: false, path: "/Applications/Notion.app" },
  { name: "Spotify", bundleId: null, running: false, path: "/Applications/Spotify.app" },
  { name: "System Settings", bundleId: null, running: false, path: "/System/Applications/System Settings.app" },
];

// [spoken text, expected describe() output, or null = should fall through to the model]
const cases: [string, string | null][] = [
  ["Screen selection.", "mission_control"],
  ["show me all my windows", "mission_control"],
  ["Please show everything", "mission_control"],
  ["next desktop", "switch_desktop right"],
  ["go to the previous screen", "switch_desktop left"],
  ["desktop two", "go_to_desktop 2"],
  ["go to desktop 3", "go_to_desktop 3"],
  ["Open Slack.", "focus_app Slack"],
  ["slack", "focus_app Slack"],
  ["switch to VS Code", "focus_app Visual Studio Code"],
  ["open Notion", "focus_app Notion (not running, will launch)"],
  ["open the settings app", "focus_app System Settings (not running, will launch)"],
  ["go to Gmail", "focus_tab [Google Chrome] Inbox (4) - rahul@example.com - Gmail"],
  ["open my YouTube tab", "focus_tab [Google Chrome] lofi hip hop radio - YouTube"],
  ["switch to the google docs tab", "focus_tab [Google Chrome] Draft - Google Docs"],
  ["close this tab", "close_tab [Google Chrome] renovatebot/renovate: Home of the Renovate CLI"],
  ["close the youtube tab", "close_tab [Google Chrome] lofi hip hop radio - YouTube"],
  ["quit Notes", "quit_app Notes"],
  ["hide slack", "hide_app Slack"],
  ["search for ollama gemma tool calling", 'web_search "ollama gemma tool calling"'],
  // These need judgement, so the model should get them:
  ["take me to my email", null],
  ["I want to code", null],
  ["open twitter", null],
  ["quit spotify", null], // not running, nothing to quit
];

let failed = 0;
for (const [text, expected] of cases) {
  const a = contextFreeMatch(text) ?? contextMatch(text, ctx, installed);
  const got = a ? describe(a) : null;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(text)} -> ${got}${ok ? "" : `   (expected ${expected})`}`);
}

// Model output validation
const modelCases: [Parameters<typeof toAction>[0], string][] = [
  [{ action: "focus_tab", tab: 1 }, "focus_tab [Google Chrome] Inbox (4) - rahul@example.com - Gmail"],
  [{ action: "focus_tab", tab: 99 }, "none: no tab 99"],
  [{ action: "focus_app", app: "vs code" }, "focus_app Visual Studio Code"],
  [{ action: "quit_app", app: "Spotify" }, "none: Spotify isn't running"],
  [{ action: "go_to_desktop", desktop: 12 }, "none: desktop number must be 1-9"],
];
for (const [reply, expected] of modelCases) {
  const got = describe(toAction(reply, ctx, installed));
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  model ${JSON.stringify(reply)} -> ${got}${ok ? "" : `   (expected ${expected})`}`);
}

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
