#!/usr/bin/env bash
# Build and (optionally) install the pytest-bdd-runner VSCode extension.
#
# Usage:
#   ./build.sh           — compile + package → produces pytest-bdd-orama-*.vsix
#   ./build.sh --install — compile + package + install into VSCode
#   ./build.sh --reload  — compile + package + install + reload the open VSCode window

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

INSTALL=false
RELOAD=false
for arg in "$@"; do
    case "$arg" in
        --install) INSTALL=true ;;
        --reload)  INSTALL=true; RELOAD=true ;;
        *) echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
done

if [[ "$INSTALL" == "true" ]]; then
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

    if [[ "$RELOAD" == "true" ]]; then
        echo "==> Reloading VSCode window..."
        RELOADED=false

        # On X11 Linux, xdotool is more reliable than code --command (which can open a new window).
        if [[ -n "${DISPLAY:-}" ]] && command -v xdotool &>/dev/null; then
            WID=$(xdotool search --name "Visual Studio Code" 2>/dev/null | head -1)
            if [[ -n "$WID" ]]; then
                xdotool windowactivate --sync "$WID"
                sleep 0.2
                xdotool key --window "$WID" ctrl+shift+p
                sleep 0.4
                xdotool type --clearmodifiers "Developer: Reload Window"
                sleep 0.2
                xdotool key --window "$WID" Return
                RELOADED=true
            fi
        fi

        if [[ "$RELOADED" == "false" ]]; then
            "$CODE_CLI" --command workbench.action.reloadWindow 2>/dev/null || true
        fi
    fi

    echo ""
    echo "Done."
else
    echo ""
    echo "To install manually, run:"
    echo "  code --install-extension $EXT_DIR/$VSIX"
    echo ""
    echo "Or run './build.sh --install'         to build and install."
    echo "Or run './build.sh --install --reload' to build, install, and reload the window."
fi
