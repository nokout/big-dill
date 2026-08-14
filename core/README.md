# @nokout/big-dill-core

The headless engine behind [Big Dill](https://github.com/nokout/big-dill) — a
pytest-bdd test runner and Gherkin authoring toolkit for VS Code.

This package has **no editor dependency**. It parses Gherkin, runs structural
lint rules, formats tables, indexes step definitions, and speaks the pytest
discovery/execution protocol. Everything it returns is plain data, so it can be
used from a CI script, another editor, or any Node process.

```bash
npm install @nokout/big-dill-core
```

## Why it exists separately

The VS Code extension is a thin adapter over this package: it maps plain results
onto editor types and registers providers. Keeping the engine separate means the
logic is testable without an editor, reusable outside one, and installable
through an ordinary npm registry in environments where the VS Code Marketplace
is not reachable.

## Status

Extracted incrementally. The public API is still settling and may change until
1.0. See
[`docs/adapter-contract.md`](https://github.com/nokout/big-dill/blob/main/docs/adapter-contract.md)
for the interface a host is expected to implement.

## License

MIT — see [`LICENSE`](./LICENSE).
