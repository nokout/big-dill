# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/nokout/big-dill/security/advisories/new)
rather than opening a public issue.

Include what you can: affected component, reproduction steps, and impact. You can
expect an acknowledgement within 7 days and an assessment within 30 days. If a fix
is warranted we will coordinate a release and credit you in the advisory unless you
prefer otherwise.

## Supported versions

This project is pre-1.0. Only the latest released version receives security fixes.

## What this software does

Understanding the trust model matters more than a version table here.

**The VS Code extension** (`vscode-extension/`) runs with the privileges of your
editor. To discover and run tests it **spawns pytest** using the Python interpreter
you have selected for the workspace. That executes your project's own code —
`conftest.py`, fixtures, and step definitions — exactly as running pytest in a
terminal would. This is inherent to any test runner, but it means:

- Only open workspaces you trust. The extension is not designed to run in
  VS Code's Restricted Mode.
- The interpreter and working directory come from your workspace settings
  (`big-dill.cwd`, `python.testing.cwd`) and the Python extension.

The extension makes **no network requests**, collects **no telemetry**, and
communicates with the pytest subprocess over a local named pipe only.

**The pytest plugin** (`pytest-plugin/`) runs inside your pytest process. It reads
feature files and step definitions to attach BDD metadata, and invokes hooks you
define in your own `conftest.py`.

## Supply chain

- The extension ships **unbundled**, so its runtime dependencies are distributed
  inside the VSIX. CI audits those strictly (`npm audit --omit=dev`, failing on
  high severity) on every push, pull request, and weekly.
- Development-only dependencies are audited too, but advisory-only — they never
  reach users. Current known advisories are all transitive under `@vscode/vsce`
  (the packaging tool) and are not present in shipped code.
- The Python plugin is audited with `pip-audit`.
- CodeQL (TypeScript and Python) runs on every pull request and weekly, with
  results in the repository's Security tab. Code scanning and dependency review
  require GitHub Advanced Security, which is free on public repositories — those
  jobs are configured to activate automatically once this repository is public.
- All GitHub Actions are pinned by full commit SHA.
- Releases publish an SBOM and a build-provenance attestation; see the release
  workflow for how to verify a downloaded VSIX.

We recommend enabling GitHub **secret scanning** and **push protection** on this
repository; the Visual Studio Marketplace additionally scans every published
extension for credentials and blocks publication if any are found.
