# Proposals

## Snippets
A set of snippets that create a more full set of setup.
This might be better left to specific projects though becuase they can populate steps which are familiar to them.


## Better tags and filtering
Move tags into the main scenario name in the test tree.
Support filtering by tags.

Where a tags is on a parent element, display the tag on the parent but match all children of that element when filtering.

## Suggestions on parameters add explanatory text.
Can we add some additional explanatory text for a param sugestion?
Can we make that searchable for suggestions too?


## Create User Guides 

Guides should be linked from the README. 

If using documentation generators, the build should be triggered from the build.sh command.

  * A non-technical overview. Linking to related information like gherkin and pytest.
  * A user guide for testers writing features tests using this extension and hooks. This will just cover the scenario writing and how the extension will help them, how to take advantage of it. This should be markdown.
  * A guide for test developers on how to implement the name and status hooks, types (from both emums and classes with suggestors and validators) and the linting hooks . Ideally drive this from python incode documentation approaches. The tools and methods chosen should be discussed before implementation. Explain the interactions with the extension and vscode and where to see debugging information.






## Improved display of waiting State — Options

### Background

VS Code's `TestRun` API has five fixed states: `passed`, `failed`, `errored`, `skipped`, `enqueued`.
Icons and colours for each are rendered internally by VS Code — there is no hook to add a custom state or substitute a custom icon.

`enqueued` is a transient state, not a terminal result. When `run.end()` is called with a test still
enqueued, VS Code shows it as "not run" — visually indistinguishable from `skipped`. This is the
root cause of the current behaviour: `"waiting": "enqueued"` in `outcomeMapping` shows the clock
icon during the run, then reverts to the skipped icon once the run ends.

---

### Option 1 — Fork VS Code core

Add a `waiting` (or `blocked`) state alongside the existing five.

**Scope:** High. The Test Explorer UI spans multiple packages in the vscode repo
(`src/vs/workbench/contrib/testing/`). Changes needed in the state machine, result storage,
renderer, and icon set. The fork would need ongoing maintenance against every VS Code release.

**Best fit for:** Internal tooling on a pinned VS Code version, or as a basis for an upstream PR.

---

### Option 2 — Contribute upstream to VS Code

Open a proposal on the VS Code repo for a `blocked` / `pending` state. The precedent exists —
`enqueued` was added because "not yet run" was a recognised gap.

**Scope:** Low to start (write a proposal). Medium-to-high if self-implementing.
Timeline: 6–18 months if well received.

**Best fit for:** Long-term correct solution if the team has appetite to engage with VS Code upstream.

---

## Option 3 — Custom sidebar tree view (extension, no fork)

Build a `TreeDataProvider` panel alongside the built-in Testing panel. The extension already owns
the test run data — it would be rendered in a second tree with full control over icons and states.

#### What VS Code gives for free via `TestController` (would be lost in a standalone panel)

- Gutter icons (coloured dots in the editor margin)
- CodeLens — "Run Test" / "Debug Test" above test functions in source
- Inline editor decorations after a run
- Filter bar, run history, standard keyboard shortcuts
- Status bar test count

#### What a custom `TreeDataProvider` must reimplement

| Feature | Effort |
|---|---|
| Hierarchical tree (workspace → file → scenario) | Small |
| Custom state icons per node | Trivial once tree exists |
| Run / run-all buttons and toolbar commands | Small |
| Refresh / re-discover | Trivial |
| Navigate to source file:line | Small |
| Show test output / messages | Small–Medium |
| Filter by state | Medium |
| Run history (persist across sessions) | Medium–Large |
| Status bar summary | Small |
| Search by name | Medium |

**Rough total for full parity:** several weeks.

#### What cannot be replicated by a tree view

- **Gutter icons** — hard-wired to `TestController`. No access to the editor margin from a tree view.
- **CodeLens** — also driven by `TestController`.
- **Standard Testing keyboard shortcuts** — bound to the built-in Testing panel.

#### Practical middle ground: hybrid panel

Keep `TestController` as-is (gutter icons, CodeLens, keyboard shortcuts stay), and add a lightweight
`TreeDataProvider` panel that reads the same result data and renders custom states.

Only needs to implement: tree, state icons, run buttons, navigate to source. Run history and
filtering can be deferred — the panel shows current-run state only.

---

### Option 4 — Custom webview panel

A full HTML/CSS/JS panel that renders the test tree exactly as needed. No constraints on icons or
layout.

**Tradeoff:** No integration with gutter icons, Test Explorer, or editor decorations. Effectively
building a parallel test UI from scratch.

**Best fit for:** If the team wants to move entirely away from the built-in Test Explorer.

---

### Option 5 — Stay in the existing API, use item metadata

Within the current constraints:

- `item.description` persists on the tree node across runs. Set it to `"⏳ waiting"` when a test
  produces a waiting custom_status — shows as secondary text in the Test Explorer tree.
- `item.label` can include a unicode prefix (⏳, 🔶, etc.).
- Call `run.skipped(item)` for a clean terminal result, paired with a description that distinguishes
  "waiting" from an intentional skip.

**Tradeoff:** The icon is still the skipped icon. The differentiation is in the text label, not the
visual state.

**Best fit for:** Quickest path if glanceability via text is acceptable.

---

### Open Questions

1. **Gutter icons deal-breaker?** A standalone custom panel loses them. Is that acceptable, or must
   gutter state stay in sync with custom states?

2. **Read-only vs interactive?** If the custom panel is display-only (no run buttons), scope drops
   significantly. Do users need to trigger runs from it, or just read results?

3. **Current run only vs history?** Persisting run history is the largest single implementation
   chunk. Is "shows the last run" sufficient?

4. **Audience?** Internal team on a fixed VS Code version (fork more feasible) vs. distributed
   extension (fork is out; upstream or custom panel is the path)?

5. **How many custom states?** If it is only `waiting`, a description/label approach may be
   sufficient. If the set grows (`waiting | known-error | flaky | pending-pr`), the custom panel
   becomes more justified.

6. **Who maintains it?** A hybrid panel that syncs with `TestController` couples the custom state
   display to the internal result data structures. Any change in the result resolver ripples into
   the tree. Is that coupling acceptable long-term?


## Gutter Icons for Scenario Outline Example Rows — Options

### Background

Layer 1 (implemented) places the gutter icon at the `Scenario:` or `Scenario Outline:`
keyword line for every test item. For a plain scenario this is exactly right. For a
scenario outline it is correct at the outline level, but all three rows from the examples
table share one gutter position — there is no per-row icon in the feature file.

This document covers the options for layer 2: a distinct gutter icon on each data row
in the `Examples:` table.

---

### What data is available

**On the pytest item:**

| Source | Value |
|---|---|
| `item._obj.__scenario__` | `ScenarioTemplate` — the parsed outline |
| `scenario.line_number` | Line of the `Scenario Outline:` keyword (same for all rows) |
| `scenario.examples` | List of `Examples` blocks (one per `Examples:` table) |
| `item.callspec.params['_pytest_bdd_example']` | `{col: value}` dict for the current row |

**On each `Examples` block** (pytest-bdd 8.x / gherkin):

| Attribute | Value |
|---|---|
| `examples_block.line_number` | Line of the `Examples:` keyword |
| `examples_block.rows` | List of row dicts `{col: value}` |

The individual data rows do **not** carry a line number attribute on the `Examples`
object — that number must be derived from the `Examples` block's `line_number` plus
the row's position within the table (header on line+1, first data row on line+2, etc.).

---

### The matching problem

To link `item.callspec.params['_pytest_bdd_example']` to a specific row in the table,
the row must be identified. Three strategies:

#### Strategy A — Match by value (simplest, fragile)

Compare the `{col: value}` dict from the callspec against each row in
`scenario.examples[n].rows` until a match is found.

```python
example_params = item.callspec.params['_pytest_bdd_example']
for examples_block in scenario.examples:
    for row_index, row in enumerate(examples_block.rows):
        if row == example_params:
            lineno = examples_block.line_number + 2 + row_index  # +1 header, +1 data
            break
```

**Limitation:** fails silently for duplicate rows (same values on two lines). Rare
in practice but possible for boolean/simple fixtures.

#### Strategy B — Match by callspec id and row index

pytest-bdd 8.x generates a callspec id like `A01-alpha` or `0-foo` for each row.
The row index embedded in the id (when no id column exists, it is a 0-based integer
prefix) can be used to select the correct row without value comparison.

Extracting the row index requires parsing the callspec id, which is fragile when the
user has added a custom id column.

#### Strategy C — Patch pytest-bdd to attach row line numbers (most robust)

Contribute a small change to pytest-bdd that attaches `_pytest_bdd_example_lineno`
to each item during parameterisation, pointing directly to the gherkin row's line.
This avoids any matching heuristic.

**Scope:** upstream PR to pytest-bdd. Outside this repo's control.

#### Strategy D — Read the feature file directly

Open the `.feature` file, find the `Examples:` block for the right outline, and
count lines. Deterministic and requires no pytest-bdd internals, but adds file I/O
during discovery and is sensitive to file encoding edge cases.

---

### Recommended approach for this repo

Use **Strategy A** with a guard: if more than one row matches, fall back to the
`Scenario Outline:` line (the layer 1 behaviour) rather than picking arbitrarily.

This covers the common case (unique row values) without risk of placing the icon on
the wrong line.

---

### Changes needed

#### Python — `vscode_pytest/__init__.py`

**`TestItem` TypedDict** — add an optional field:

```python
class TestItem(TestData):
    lineno: str
    runID: str
    feature_path: NotRequired[str]
    scenario_name: NotRequired[str]
    example_lineno: NotRequired[str]   # <-- new: specific example-row line
```

**`create_test_node()`** — after setting `node["lineno"] = str(scenario.line_number)`,
attempt to resolve the individual row line:

```python
if scenario is not None and hasattr(scenario, "line_number"):
    node["lineno"] = str(scenario.line_number)
    # Layer 2: try to pin the row line for scenario outlines
    raw_params = getattr(test_case, "callspec", None)
    example_params = (raw_params.params.get("_pytest_bdd_example", {})
                      if raw_params else {})
    if example_params and hasattr(scenario, "examples"):
        row_line = _find_example_row_line(scenario, example_params)
        if row_line is not None:
            node["example_lineno"] = str(row_line)
```

**Helper:**

```python
def _find_example_row_line(scenario, example_params: dict) -> int | None:
    """Return the 1-indexed line of the matching example row, or None if ambiguous."""
    matches = []
    for block in scenario.examples:
        for index, row in enumerate(block.rows):
            if dict(row) == example_params:
                # +1 for Examples: keyword, +1 for header row, +index for data row
                matches.append(block.line_number + 2 + index)
    return matches[0] if len(matches) == 1 else None
```

#### TypeScript — `types.ts`

```typescript
export type DiscoveredTestItem = DiscoveredTestCommon & {
    lineno: number | string;
    runID: string;
    feature_path?: string;
    scenario_name?: string;
    example_lineno?: number | string;   // <-- new
};
```

#### TypeScript — `treeBuilder.ts`

In the BDD leaf section, prefer `example_lineno` over `lineno` when present:

```typescript
const rawLine = leaf.example_lineno ?? leaf.lineno;
const lineno = typeof rawLine === 'string' ? parseInt(rawLine, 10) : rawLine;
const range = Number.isFinite(lineno) && lineno > 0
    ? new Range(new Position(lineno - 1, 0), new Position(lineno, 0))
    : undefined;
```

---

### Open questions

1. **Duplicate rows** — is it acceptable for the icon to fall back to the outline line
   when two rows have identical values, or should the feature author be warned?

2. **Multiple `Examples:` blocks** — a single outline can have several `Examples:`
   sections. The strategy above handles them correctly (iterates all blocks), but the
   VS Code tree currently creates one item per row across all blocks combined. Confirm
   that the tree labels remain unique if rows from different blocks happen to share values.

3. **Line number formula** — the `block.line_number + 2 + index` formula assumes
   the header row immediately follows the `Examples:` keyword with no blank lines.
   pytest-bdd's gherkin parser may expose the header row's line directly; check
   `block.rows` vs `block.example_params` in the actual 8.x data model before
   committing to the offset formula.



