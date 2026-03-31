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


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('pytest_bdd_orama_steps.json')

    from .step_types import StepType
    from .step_registry import collect_step_type_classes

    step_types = collect_step_type_classes()
    metadata = {
        'version': 1,
        'step_types': {
            name: {
                'suggested_values': cls.suggested_values(),
                'has_validator': cls.validate.__func__ is not StepType.validate.__func__,
            }
            for name, cls in step_types.items()
        },
    }

    output.write_text(json.dumps(metadata, indent=2))
    print(f"pytest-bdd-orama: written step metadata to {output}")
