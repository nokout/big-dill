"""Unit tests for docstring_utils.parse_tags and get_summary."""
from pytest_big_dill.docstring_utils import get_summary, parse_tags


def test_get_summary_returns_first_non_empty_line():
    doc = "Short summary.\n\nArgs:\n    x: something"
    assert get_summary(doc) == "Short summary."

def test_get_summary_strips_whitespace():
    doc = "  Leading spaces.  \n\nMore text."
    assert get_summary(doc) == "Leading spaces."

def test_get_summary_single_line_no_trailing_newline():
    doc = "Only line."
    assert get_summary(doc) == "Only line."

def test_get_summary_returns_none_for_empty_string():
    assert get_summary("") is None

def test_get_summary_returns_none_for_whitespace_only():
    assert get_summary("   \n\n  ") is None

def test_get_summary_returns_none_for_none_input():
    assert get_summary(None) is None

def test_parse_tags_returns_empty_list_when_no_tags_section():
    doc = "Summary.\n\nArgs:\n    x: something"
    assert parse_tags(doc) == []

def test_parse_tags_returns_empty_list_for_none():
    assert parse_tags(None) == []

def test_parse_tags_returns_empty_list_for_empty_string():
    assert parse_tags("") == []

def test_parse_tags_single_line_comma_separated():
    doc = "Summary.\n\nTags:\n    auth, users"
    assert parse_tags(doc) == ["auth", "users"]

def test_parse_tags_lowercases_tags():
    doc = "Summary.\n\nTags:\n    Auth, USERS"
    assert parse_tags(doc) == ["auth", "users"]

def test_parse_tags_strips_whitespace_around_tags():
    doc = "Summary.\n\nTags:\n      auth ,  users  "
    assert parse_tags(doc) == ["auth", "users"]

def test_parse_tags_multiple_lines_in_section():
    doc = "Summary.\n\nTags:\n    auth, users\n    geography"
    assert parse_tags(doc) == ["auth", "users", "geography"]

def test_parse_tags_ignores_empty_items_from_trailing_commas():
    doc = "Summary.\n\nTags:\n    auth,, users,"
    assert parse_tags(doc) == ["auth", "users"]

def test_parse_tags_section_followed_by_another_section():
    doc = (
        "Summary.\n\n"
        "Tags:\n"
        "    auth, ui\n\n"
        "Returns:\n"
        "    None"
    )
    assert parse_tags(doc) == ["auth", "ui"]

def test_parse_tags_section_with_no_values_returns_empty():
    doc = "Summary.\n\nTags:\n\nReturns:\n    None"
    assert parse_tags(doc) == []

def test_parse_tags_tags_section_only_no_other_sections():
    doc = "Summary.\n\nTags:\n    smoke, regression"
    assert parse_tags(doc) == ["smoke", "regression"]
