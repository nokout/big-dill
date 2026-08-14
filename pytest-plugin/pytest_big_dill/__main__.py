"""Run pytest for a specific set of tests, read from a file.

    python -m pytest_big_dill [pytest args...]

Test node ids come from the file named by ``BIG_DILL_TEST_IDS`` rather than the
command line, because Windows caps a command line at roughly 32,000 characters —
a few hundred BDD scenarios is enough to exceed it, and the failure mode is an
opaque OS error rather than anything actionable.

Without that variable this is simply ``pytest``, so the module is usable by hand.
"""

from __future__ import annotations

import os
import sys

import pytest

TEST_IDS_ENV = "BIG_DILL_TEST_IDS"


def read_test_ids(path: str) -> list[str]:
    with open(path, encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip()]


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])

    ids_file = os.environ.get(TEST_IDS_ENV)
    if ids_file:
        try:
            args.extend(read_test_ids(ids_file))
        except OSError as error:
            print(f"big-dill: cannot read test ids from {ids_file}: {error}", file=sys.stderr)
            return 2

    return pytest.main(args)


if __name__ == "__main__":
    sys.exit(main())
