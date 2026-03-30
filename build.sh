#!/usr/bin/env bash
# Build and (optionally) install the pytest-bdd-runner VSCode extension.
#
# Usage:
#   ./build.sh           — compile + package → produces pytest-bdd-orama-*.vsix
#   ./build.sh --install — compile + package + install into VSCode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/vscode-extension"

echo "==> Installing Node dependencies..."
cd "$EXT_DIR"
npm install

echo "==> Compiling TypeScript..."
npm run compile

echo "==> Packaging extension..."
./node_modules/.bin/vsce package --no-dependencies

VSIX=$(ls -t pytest-bdd-orama-*.vsix 2>/dev/null | head -1)
if [[ -z "$VSIX" ]]; then
    echo "ERROR: no .vsix found after packaging" >&2
    exit 1
fi

echo ""
echo "Built: $EXT_DIR/$VSIX"

if [[ "${1:-}" == "--install" ]]; then
    # Accept either 'code' or 'code-insiders'
    CODE_CLI=""
    for candidate in code code-insiders; do
        if command -v "$candidate" &>/dev/null; then
            CODE_CLI="$candidate"
            break
        fi
    done
    if [[ -z "$CODE_CLI" ]]; then
        echo "ERROR: neither 'code' nor 'code-insiders' CLI found." >&2
        exit 1
    fi
    echo "==> Installing extension into VSCode (using $CODE_CLI)..."
    "$CODE_CLI" --install-extension "$VSIX" --force
    echo ""
    echo "Done. Reload the VSCode window (Ctrl+Shift+P → 'Developer: Reload Window') to activate."
else
    echo ""
    echo "To install manually, run:"
    echo "  code --install-extension $EXT_DIR/$VSIX"
    echo ""
    echo "Or run './build.sh --install' to build and install in one step."
fi
