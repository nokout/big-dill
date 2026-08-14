# Upstream Tracking

Files adapted from [microsoft/vscode-python](https://github.com/microsoft/vscode-python), which is MIT licensed.

The Microsoft copyright notice is preserved in each adapted file header, and the
full MIT text is reproduced in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
Those files remain under Microsoft's copyright; the rest of this project is
licensed under [`LICENSE`](LICENSE), also MIT.

> **This file is scheduled for deletion.** The vendored pytest bridge is being
> replaced by an implementation of our own inside `pytest-big-dill`, after which
> nothing in this repository is adapted from ms-python and this tracking is moot.

Only the files listed below carry a Microsoft copyright. Every other file in
this repository is original work — if you add a file, do not copy a Microsoft
header into it.

## Tracked files

| Our path | ms-python source path | Last-synced commit |
|---|---|---|
| `extension/python_files/run_pytest.py` | `python_files/run_pytest.py` | `5c2c3948` |
| `extension/python_files/vscode_pytest/__init__.py` | `python_files/vscode_pytest/__init__.py` | `5c2c3948` |
| `extension/python_files/vscode_pytest/_common.py` | `python_files/vscode_pytest/_common.py` | `5c2c3948` |
| `extension/src/testController/types.ts` | `src/client/testing/testController/common/types.ts` | `5c2c3948` |

> **Note:** `types.ts` is the only adapted TypeScript file — it carries the discovery
> and execution payload type definitions that must stay wire-compatible with the
> Python side. The other TypeScript files (`treeBuilder.ts`, `resultResolver.ts`,
> `ipc.ts`, `pytestRunner.ts`, `extension.ts`) are Big Dill originals: they do not
> adapt ms-python TypeScript internals, which are private APIs not accessible from a
> separate extension. `ipc.ts` implements the same content-length framing protocol as
> ms-python, but the implementation is original.

## How to check for upstream changes

```bash
# Fetch the ms-python repo and diff a tracked file against the synced SHA
git -C /path/to/vscode-python diff <SHA> HEAD -- python_files/vscode_pytest/__init__.py
```

Update the `Last-synced commit` column whenever a tracked file is re-synced from upstream.
