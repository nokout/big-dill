"""Utility functions for extracting structured information from docstrings."""
from __future__ import annotations
import re

_SECTION_RE = re.compile(r'^[ \t]*([A-Z][A-Za-z]*):\s*$', re.MULTILINE)


def get_summary(docstring: str | None) -> str | None:
    """Return the first non-empty line of *docstring*, stripped of whitespace."""
    if not docstring:
        return None
    for line in docstring.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


def parse_tags(docstring: str | None) -> list[str]:
    """Extract the Tags: section from a Google-style docstring.

    Returns a list of lowercased, whitespace-stripped tag strings.
    """
    if not docstring:
        return []

    lines = docstring.splitlines()
    tags_start: int | None = None
    for i, line in enumerate(lines):
        if re.match(r'^[ \t]*Tags:\s*$', line):
            tags_start = i
            break

    if tags_start is None:
        return []

    body_lines: list[str] = []
    for line in lines[tags_start + 1:]:
        if _SECTION_RE.match(line):
            break
        body_lines.append(line)

    tags: list[str] = []
    for line in body_lines:
        for part in line.split(','):
            tag = part.strip().lower()
            if tag:
                tags.append(tag)
    return tags
