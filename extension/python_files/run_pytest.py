#!/usr/bin/env python
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
# Adapted from microsoft/vscode-python (commit 5c2c3948e1c8c8a1dfe848104773477e70d0b83b).
# No changes from upstream run_pytest_script.py logic.
#
# Reads test ids from the file at RUN_TEST_IDS_PIPE and runs pytest with them.

from __future__ import annotations

import os
import sys

import pytest


def main() -> int:
    test_ids_file = os.environ.get("RUN_TEST_IDS_PIPE")
    if not test_ids_file:
        print("ERROR: RUN_TEST_IDS_PIPE not set", file=sys.stderr)
        return 2

    try:
        with open(test_ids_file, encoding="utf-8") as f:
            test_ids = [line.strip() for line in f if line.strip()]
    except OSError as e:
        print(f"ERROR reading test ids file: {e}", file=sys.stderr)
        return 2

    args = [
        "-p", "vscode_pytest",
        "--rootdir", os.getcwd(),
        *sys.argv[1:],  # extra args from the extension
        *test_ids,
    ]
    return pytest.main(args)


if __name__ == "__main__":
    sys.exit(main())
