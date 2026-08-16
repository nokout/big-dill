#!/usr/bin/env bash
# Build and (optionally) install the pytest-bdd-runner VSCode extension.
#
# Usage:
#   ./build.sh           — compile + package → produces big-dill-*.vsix
#   ./build.sh --install — compile + package + install into VSCode
#   ./build.sh --reload  — compile + package + install + reload the open VSCode window

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"

echo "==> Installing Node dependencies..."
cd "$SCRIPT_DIR"
npm install
cd "$EXT_DIR"

echo "==> Compiling TypeScript..."
npm run bundle:production

echo "==> Packaging extension..."
# --no-dependencies is required: the extension is bundled by esbuild, so every
# runtime dep is already inlined into dist/extension.js. Packaging node_modules
# as well would ship the whole hoisted workspace tree.
# --no-rewrite-relative-links keeps the README's image paths pointing at the
# images packaged inside the VSIX. Without it vsce rewrites them to
# github.com/.../raw/HEAD URLs, which resolve to the wrong path: the images live
# under extension/, not the repository root.
../node_modules/.bin/vsce package --no-dependencies --no-rewrite-relative-links

VSIX=$(ls -t big-dill-*.vsix 2>/dev/null | head -1)
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
    # Accept 'code', 'code-insiders', or 'codium' (native or flatpak)
    CODE_CLI=()
    for candidate in code code-insiders codium; do
        if command -v "$candidate" &>/dev/null; then
            CODE_CLI=("$candidate")
            break
        fi
    done
    if [[ ${#CODE_CLI[@]} -eq 0 ]] && flatpak info com.vscodium.codium &>/dev/null; then
        CODE_CLI=(flatpak run com.vscodium.codium)
    fi
    if [[ ${#CODE_CLI[@]} -eq 0 ]]; then
        echo "ERROR: no 'code', 'code-insiders', or 'codium' CLI found (nor a VSCodium flatpak)." >&2
        exit 1
    fi
    echo "==> Installing extension (using ${CODE_CLI[*]})..."
    "${CODE_CLI[@]}" --install-extension "$VSIX" --force

    if [[ "$RELOAD" == "true" ]]; then
        echo "==> Reloading VSCode window..."
        RELOADED=false

        # On X11 Linux, xdotool is more reliable than code --command (which can open a new window).
        if [[ -n "${DISPLAY:-}" ]] && command -v xdotool &>/dev/null; then
            WID=$(xdotool search --name "Visual Studio Code" 2>/dev/null | head -1)
            [[ -z "$WID" ]] && WID=$(xdotool search --name "VSCodium" 2>/dev/null | head -1)
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
            "${CODE_CLI[@]}" --command workbench.action.reloadWindow 2>/dev/null || true
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
