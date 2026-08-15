# @nokout/big-dill-core

The headless engine behind [Big Dill](https://github.com/nokout/big-dill) —
tooling for [pytest-bdd](https://pytest-bdd.readthedocs.io/).

```bash
npm install @nokout/big-dill-core
```

**No editor dependency.** It parses Gherkin, runs structural lint rules, formats
tables, indexes step definitions, computes completions and test-tree shape, and
orchestrates pytest over a local pipe. Everything it returns is plain data, so it
runs anywhere Node does — a CI lint gate, another editor, a script.

```js
const { parseSource, lintDocument } = require('@nokout/big-dill-core');

const text = require('fs').readFileSync('login.feature', 'utf-8');
const { doc } = parseSource(text);

for (const d of lintDocument(doc, text.split('\n'))) {
    console.log(`${d.severity} line ${d.line + 1}: ${d.message}`);
}
```

## Where this fits

Three packages work together:

| | |
|---|---|
| **`@nokout/big-dill-core`** | this package — the engine |
| [`pytest-big-dill`](https://pypi.org/project/pytest-big-dill/) | the pytest plugin, installed into the environment your tests run in |
| [`big-dill`](https://marketplace.visualstudio.com/items?itemName=nokout.big-dill) | the VS Code extension, a thin adapter over this package |

Running tests needs `pytest-big-dill` present in the Python environment; parsing,
linting and formatting need nothing but this package.

## Building a host

The VS Code extension is one host among possible others; nothing in this package
assumes it.
[`adapter-contract.md`](https://github.com/nokout/big-dill/blob/main/core/adapter-contract.md)
documents the full API, the four substitutions that replace editor constructs,
and what a host is expected to supply.

## Status

Extracted from the extension incrementally. The API is still settling and may
change before 1.0; the protocol types shared with `pytest-big-dill` are the part
most worth pinning.

## License

MIT — see [`LICENSE`](./LICENSE).
