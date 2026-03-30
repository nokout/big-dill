# Upstream Tracking

Files adapted from [microsoft/vscode-python](https://github.com/microsoft/vscode-python), which is MIT licensed.

The Microsoft copyright notice is preserved in each adapted file header. See `LICENSE` for the full MIT license text.

## Tracked files

| Our path | ms-python source path | Last-synced commit |
|---|---|---|
| `vscode-extension/python_files/vscode_pytest/__init__.py` | `python_files/vscode_pytest/__init__.py` | `5c2c3948` |
| `vscode-extension/python_files/vscode_pytest/_common.py` | `python_files/vscode_pytest/_common.py` | `5c2c3948` |

> **Note:** The TypeScript files (`types.ts`, `treeBuilder.ts`, `resultResolver.ts`, `ipc.ts`, `pytestRunner.ts`,
> `extension.ts`) are BDD-orama originals — they do not adapt ms-python TypeScript internals directly, as
> those are private APIs not accessible from a separate extension.  Only the Python-side vscode_pytest plugin
> is adapted from ms-python.

## How to check for upstream changes

```bash
# Fetch the ms-python repo and diff a tracked file against the synced SHA
git -C /path/to/vscode-python diff <SHA> HEAD -- python_files/vscode_pytest/__init__.py
```

Fill in the `Last-synced commit` column when copying each file during Phase 4.
