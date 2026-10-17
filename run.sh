#!/bin/zsh
# Entry point for the Shortcuts app, which runs scripts with a minimal PATH.
# If node still isn't found, replace `node` below with the output of `which node`.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if ! command -v node >/dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh" >/dev/null
fi
DIR="${0:A:h}"
exec node "$DIR/dist/index.js" "$@"
