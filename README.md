# mac-agent

Say a command, your Mac does it. Free and fully local:

```
macOS Dictation  →  fast keyword match  →  (if unsure) Gemma via Ollama  →  AppleScript / JXA
```

Common phrases ("screen selection", "open Slack", "go to Gmail", "next desktop") are matched instantly without the model. Everything else goes to the local model along with a live list of your running apps and open browser tabs, so it can pick the right one.

## Quick start

```bash
ollama pull gemma3:4b
npm install && npm run build
node dist/index.js "open slack"     # one-shot
node dist/index.js                  # interactive prompt
```

Full setup (macOS permissions, voice hotkey) is below.

## What it can do (v1)

| Say something like | Action |
|---|---|
| "screen selection", "show everything" | Mission Control (three-finger swipe up) |
| "app windows" | App Exposé, all windows of the current app |
| "next desktop", "previous screen" | Move one desktop left/right |
| "desktop 3" | Jump to desktop 3 |
| "open Slack", "switch to VS Code" | Focus the app, jumping to its desktop; launch it if closed |
| "go to Gmail", "open my YouTube tab" | Switch to that open tab (Chrome, Brave, Edge, Safari) |
| "close this tab", "close the YouTube tab" | Close a tab |
| "hide Slack", "quit Notes" | Hide or quit a running app |
| "search for X" | Google search in the default browser |
| "open twitter" (no tab open) | Model opens the site |
| "take me to my email" | Model picks the Gmail tab |

## Setup

### 1. Ollama and the model

```bash
brew install ollama          # or download the app from ollama.com
ollama serve                 # skip if the Ollama app is already running
ollama pull gemma3:4b
```

To use a different model, set `OLLAMA_MODEL` (e.g. `export OLLAMA_MODEL=gemma3:4b`) to whatever tag you pulled. The model must support Ollama's structured outputs, which all recent models do.

### 2. Build

```bash
cd mac-agent
npm install
npm run build
npm test                       # fast-path tests, no Mac APIs needed
node dist/index.js --dry-run "open slack"   # shows the decision without doing it
```

### 3. macOS settings

- **Desktop & Dock › Mission Control**: turn on *"When switching to an application, switch to a Space with open windows for the application"* (on by default).
- **Keyboard › Keyboard Shortcuts › Mission Control**: turn on *Switch to Desktop 1…9* if you want "desktop 3" to work.
- **Privacy & Security › Accessibility**: allow whatever runs the agent (Terminal while testing, **Shortcuts** for the voice hotkey). Needed for desktop switching and App Exposé.
- **Automation** prompts ("…wants to control Google Chrome / System Events") appear the first time. Click Allow.

### 4. Voice hotkey with Shortcuts (recommended)

This uses macOS's own dictation, so it's free and works from any app.

1. Open **Shortcuts**, create a new shortcut, name it *Mac Agent*.
2. Add **Dictate Text**. Set *Stop Listening* to **After Pause**.
3. Add **Run Shell Script**. Shell: `zsh`, Pass Input: **as arguments**. Script:
   ```
   /full/path/to/mac-agent/run.sh "$@"
   ```
4. In the shortcut's details (ⓘ), click **Add Keyboard Shortcut** and pick something like ⌥Space.

Now press the hotkey, say "open Slack", stop talking. Done.

Add `--speak` after `"$@"` if you want it to say out loud when it didn't understand.

### Or: interactive mode in Terminal

```bash
node dist/index.js
> open slack
```

Press the dictation key (🎤 / Fn twice) in the prompt to speak instead of typing. Handy for testing.

## Flags

- `--dry-run` show the decision, don't act
- `--verbose` print what it saw (apps, tabs, frontmost)
- `--speak` voice feedback on failure
- `--context file.json` use a saved snapshot instead of the real Mac (see `test/fixture-context.json`)

Every command is logged to `~/.mac-agent/log.jsonl` with what dictation heard, the action chosen, and timing. Use it to spot misheard phrases and add them to the fast path or the synonyms in `src/resolve.ts`.

## How it's put together

| File | Role |
|---|---|
| `src/fastpath.ts` | Regex rules. Context-free ones (Mission Control, desktops) run before anything else, so they're instant |
| `src/context.ts` | One JXA call that reads running apps, the frontmost app, and every tab in running browsers. Never launches a browser just to read it |
| `src/resolve.ts` | Fuzzy matching of spoken names to apps and tabs, plus a synonym table ("chrome", "vs code", "settings") |
| `src/llm.ts` | Ollama call with a JSON schema; the model's answer is validated against what's actually open |
| `src/actions.ts` | The actual Mac actions |

## Known limits

- Firefox and Arc tabs aren't readable (their AppleScript support is too limited). Apps still work.
- With two windows of the same browser on different desktops, focusing a tab in the background window sometimes raises the wrong window. Rare, but known.
- Clicking things inside web pages is the next step (needs "Allow JavaScript from Apple Events" in Chrome's Developer menu).

## TODO

The list keeps growing; add to it.

- [ ] Go to a Slack workspace and a specific channel ("open #general in Acme")
- [ ] Write emails ("email Sam that I'm running late")
- [ ] Copy a file from Finder into the app on screen
- [ ] Speed: get end-to-end latency from ~4s to under 1s
- [ ] Architecture: write a system design of this thing and compare it with available alternatives
