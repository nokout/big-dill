# Third-Party Notices

pytest-bdd-orama is distributed under the terms in [`LICENSE`](LICENSE). The
components listed here are **not** covered by that licence: each remains under
its own terms, reproduced below, and nothing in `LICENSE` limits your rights
under them.

Two categories are covered:

1. **Adapted source** — files in this repository derived from another project.
2. **Bundled runtime dependencies** — npm packages shipped inside the `.vsix`,
   because the extension ships unbundled (TypeScript is compiled, but runtime
   `node_modules` are packaged as-is).

Development-only dependencies are not listed: they are not distributed to users.

---

## 1. Adapted source

### microsoft/vscode-python

Licence: MIT.
Upstream: https://github.com/microsoft/vscode-python
Synced from commit `5c2c3948e1c8c8a1dfe848104773477e70d0b83b`.
See [`UPSTREAM.md`](UPSTREAM.md) for the per-file mapping and re-sync procedure.

Files adapted from this project:

| Path | Nature of adaptation |
|---|---|
| `vscode-extension/python_files/run_pytest.py` | Adapted |
| `vscode-extension/python_files/vscode_pytest/__init__.py` | Adapted |
| `vscode-extension/python_files/vscode_pytest/_common.py` | Verbatim, no changes |
| `vscode-extension/src/testController/types.ts` | Adapted (payload type definitions) |

```
MIT License

Copyright (c) Microsoft Corporation. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Bundled runtime dependencies

Shipped inside the `.vsix`:

| Package | Version | Licence |
|---|---|---|
| `@cucumber/gherkin` | 39.1.0 | MIT |
| `@cucumber/messages` | 32.3.1 | MIT |
| `class-transformer` | 0.5.1 | MIT |
| `reflect-metadata` | 0.2.2 | Apache-2.0 |

A machine-readable CycloneDX SBOM is attached to every GitHub Release
(`sbom-extension.cdx.json`).

### @cucumber/gherkin — MIT

```
Copyright (c) 2017 Cucumber Ltd, Gaspar Nagy, Björn Rasmusson, Peter Sergeant,
and contributors
```

### @cucumber/messages — MIT

```
Copyright (c) 2018 Cucumber Ltd and contributors
```

### class-transformer — MIT

```
Copyright (c) 2015-2020 TypeStack
```

The three packages above are each distributed under the MIT licence, whose full
text is reproduced in section 1.

### reflect-metadata — Apache-2.0

```
Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
```

The full Apache License 2.0 text is available at
https://www.apache.org/licenses/LICENSE-2.0

---

## Python plugin dependencies

`pytest-bdd-orama` (the pytest plugin) declares `pytest`, `pytest-bdd`, and
`parse` as dependencies. These are installed by pip from PyPI rather than
bundled, so they are not redistributed by this project and retain their own
licences (MIT for all three at the time of writing).
