"""CLI command: generate step type metadata for distribution inside a wheel.

Usage (run from the project root, with the project importable)::

    pytest-bdd-orama [output_path]

If *output_path* is omitted, writes ``pytest_bdd_orama_steps.json`` in the
current directory.  Include this file in your wheel and declare it via an
entry point so the VS Code extension can discover it.

pyproject.toml example::

    [project.entry-points."pytest_bdd_orama.steps"]
    my-package = "my_package:pytest_bdd_orama_steps.json"
"""
from __future__ import annotations
import json
import sys
from pathlib import Path


def _build_metadata(
    step_definitions: list[dict],
    step_types: "dict[str, type]",
) -> dict:
    """Build the metadata dict from pre-collected data (testable without disk I/O)."""
    from .step_types import StepType

    return {
        'version': 2,
        'step_types': {
            name: {
                'suggested_values': cls.suggested_values(),
                'has_validator': cls.validate.__func__ is not StepType.validate.__func__,
            }
            for name, cls in step_types.items()
        },
        'steps': [
            {
                'keyword': defn['keyword'],
                'pattern': defn['pattern'],
                'parameters': defn['parameters'],
                'file': defn['file'],
                'line': defn['line'],
                'summary': defn['summary'],
                'tags': defn['tags'],
                'param_types': defn['param_types'],
            }
            for defn in step_definitions
        ],
    }


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('pytest_bdd_orama_steps.json')

    from .step_registry import collect_step_type_classes

    step_types = collect_step_type_classes()
    # collect_step_definitions requires a live pytest session; the CLI entry point
    # only exports step_type metadata (suggested values, validators).  Step-level
    # enrichment (file, line, summary, tags) is produced during pytest collection.
    metadata = _build_metadata([], step_types)

    output.write_text(json.dumps(metadata, indent=2))
    print(f"pytest-bdd-orama: written step metadata to {output}")
