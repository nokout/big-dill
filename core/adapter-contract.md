# Adapter contract

How to build a host on top of `@nokout/big-dill-core`.

This exists because the VS Code extension is expected to be **reimplemented**, not
only installed. Some environments cannot reach the Marketplace but can reach npm
and PyPI, so the engine and the pytest plugin arrive through package registries
and only a thin editor-specific layer needs writing locally. This document is
what that layer is written against — it should be enough on its own, without
reading the existing extension.

## The shape of it

```
┌─────────────────────────┐
│  host (your adapter)    │  editor types, registration, display
├─────────────────────────┤
│  @nokout/big-dill-core  │  parsing, linting, completion, tree shape,
│  (npm)                  │  outcome decisions, pytest orchestration
├─────────────────────────┤
│  pytest-big-dill (PyPI) │  discovery + execution payloads over a pipe
└─────────────────────────┘
```

Core never imports an editor API — CI asserts this — and returns plain data
throughout. A host's entire job is to map that data onto its own types and
register the results. Nothing in core needs to know a host exists.

Both packages must be installed: core in the host's `node_modules`,
`pytest-big-dill` in the Python environment the tests run in.

## Four substitutions

Everything a VS Code extension would reach for has a plain equivalent. If you are
porting the existing adapter, these are the only translations you need.

| Editor construct | Core equivalent | Bridge with |
|---|---|---|
| `CancellationToken` | `AbortSignal` | `token.onCancellationRequested(() => controller.abort())` |
| `workspace.getConfiguration(…)` | a plain options object | read config at the edge, pass it down |
| `Uri` | a path string, or `{ path, absolute? }` | `Uri.file(p)` / `Uri.joinPath(cwd, p)` |
| `Position` / `Range` | `{ line, character }` / `{ start, end }` | construct at the edge |

Two conventions worth stating outright, because getting them wrong is silent:

- **Lines are 0-based** everywhere core returns them, matching most editor APIs.
  The pytest wire protocol is 1-based; core has already converted.
- **Uri descriptors** are relative to the run's working directory unless
  `absolute` is set. Feature paths are relative; Python file paths are absolute.

## Language features

Each takes a parsed document and returns plain results. `GherkinParseCache.parse()`
accepts anything structurally matching `CacheableDocument` — `{ uri: { fsPath },
version, getText() }` — which VS Code's `TextDocument` satisfies without adaptation.

| You want | Call | You get |
|---|---|---|
| Parse | `parseSource(text)` or `GherkinParseCache.parse(doc)` | `{ doc, errors }` |
| Lint | `lintDocument(doc, lines, config)` | `DiagnosticEntry[]` — `{ line, message, severity }` |
| Complete | `completeAt(line, column, cache)` | `CompletionEntry[]` |
| Outline | `buildSymbolTree(doc)` | `SymbolNode[]` — nested, with `kind` and `line` |
| Highlight tables | `buildTableTokens(doc, lines)` | `TokenEntry[]` — plus `TOKEN_TYPES` and `TYPE_INDEX` for the legend |
| Format tables | `formatTables(doc, lines)` | `TextEditEntry[]` — `{ startLine, newText }` |
| Hover text | `renderStepMarkdown(step)` | Markdown `string` |
| Find references | `findReferencesInLines(lines, step)` | 0-based line numbers |
| Unimplemented steps | `findUnimplementedSteps(lines, cache)` | `{ lineIndex, stepText }[]` |
| Generate a stub | `buildStepStub(stepText, keyword)` | Python source `string` |
| Browse steps | `browseSteps(steps, { mode, filter, group })` | `StepBrowserNode[]` — `group`, `step` or `message` |

`lintDocument` takes `LintConfig` — `{ allowedTags?, phrasingRules? }` — as plain
data. Individual rules are exported too, if a host wants to run a subset.

**Completion carries snippet syntax.** `CompletionEntry.insertText` may contain
LSP snippet syntax (`${1:name}`, `${1|a,b|}`) when `snippet` is true. A host that
cannot render snippets should insert the text literally; it remains valid.

## Step index

`StepCache` holds the step definitions discovered from the Python side.

```ts
const cache = new StepCache();
cache.update(stepDefinitions);          // from a discovery run
cache.updateDistributed(fromPackages);  // from third-party step libraries
cache.updateUsageCounts(featureLines);  // ranks completions by use

cache.matchPattern(stepText);           // → StepDefinition | null
cache.paramPositionAt(line, column);    // → the parameter under a cursor
```

Populate it before offering completion, hover, definition or references — all of
them read from it.

## Running pytest

```ts
const { discovery, stepDefinitions } = await discoverTests({
    cwd, interpreterPath, pytestArgs, log, signal,
});
const payloads = await runTests({ …same, testIds });
const diagnostics = await runBddLint({ …same, featureFilePath });
```

`PytestOptions` is entirely plain: a resolved `cwd`, an interpreter path, extra
arguments, an optional `log` callback for subprocess stderr, and an optional
`AbortSignal`. Core creates the pipe, spawns the interpreter, and parses frames.
The host resolves the interpreter and the working directory — those are policy
decisions only a host can make.

`interpreterPath` is a plain string. It does **not** require the VS Code Python
extension; anything that can run `-m pytest` will do.

## Displaying results

Two steps, deliberately separate so neither needs an editor.

```ts
const { roots, idToRunId } = buildTestTree(discovery.tests);
```

`roots` is a plain tree of `TreeNode` — `{ id, label, uri, canResolveChildren,
tags, description?, range?, children }`. Materialise each node as whatever your
editor displays, resolving `uri` per the descriptor rules above. Keep your own
map from node id to your item; `idToRunId` maps node ids to pytest run ids.

```ts
for (const decision of resolveExecutionOutcomes(payload, outcomeMapping)) {
    const item = yourIndex.get(decision.runId);   // may be absent — skip it
    …
}
```

Each `OutcomeDecision` is `{ runId, state, message?, label }` where `state` is
one of `passed | failed | errored | skipped | enqueued`.

Two things that are easy to get wrong:

- **Decisions are produced for every run id in the payload**, including tests
  outside your tree. Skip ids you do not recognise rather than treating them as
  errors.
- **`label` tells you what to do with the waiting marker** — `'strip'`,
  `'prefix'` or `'none'` — using the exported `WAITING_PREFIX`. Do not derive it
  from `state`: a plain `success` deliberately leaves the label untouched, so an
  item previously marked waiting keeps its marker. That is existing behaviour,
  preserved on purpose.

## What a host must provide

Core supplies no policy. A complete host is responsible for:

1. **An interpreter path** — however it likes: a setting, a discovered virtualenv, `python` on `PATH`.
2. **A working directory** for pytest, resolved from whatever settings it exposes.
3. **Configuration** — `allowedTags` and `phrasingRules` for linting, an outcome mapping for custom statuses, extra pytest arguments.
4. **Registration** — wiring core's results into its own editor: completion, hover, definition, references, code actions, formatting, symbols, semantic tokens, diagnostics, a test tree, and a step browser, as far as it supports them. All are optional and independent.
5. **Re-discovery triggers** — watching `.feature` files and step definition files, and re-running discovery when they change.
6. **Cancellation**, if it has a notion of it, bridged to `AbortSignal`.

None of this is required all at once. A host that only lints `.feature` files
needs `parseSource` and `lintDocument` and nothing else.

## Versioning

Core and `pytest-big-dill` share the wire protocol in `protocol/types.ts`. Pin
both to compatible versions: a mismatch fails **silently** — an empty test tree,
or results attaching to no node — rather than erroring.

The exported protocol types are the contract. Treat additions as compatible and
any change to an existing field as breaking.

## A host with no editor at all

Core is usable from a plain Node script, which is the quickest way to confirm an
installation works:

```js
const { parseSource, lintDocument } = require('@nokout/big-dill-core');
const text = require('fs').readFileSync('login.feature', 'utf-8');
const { doc } = parseSource(text);
for (const d of lintDocument(doc, text.split('\n'))) {
    console.log(`${d.severity} line ${d.line + 1}: ${d.message}`);
}
```
