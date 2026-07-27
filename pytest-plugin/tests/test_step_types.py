from pytest_bdd_orama.step_types import StepEnum, StepType


def test_step_type_suggested_values_is_empty():
    assert StepType.suggested_values() == []


def test_step_type_validate_returns_none():
    assert StepType.validate("anything") is None


def test_step_enum_suggested_values_returns_member_values():
    class Colour(StepEnum):
        RED = "red"
        BLUE = "blue"

    assert Colour.suggested_values() == ["red", "blue"]


def test_step_enum_validate_valid_value_returns_none():
    class Colour(StepEnum):
        RED = "red"

    assert Colour.validate("red") is None


def test_step_enum_validate_invalid_value_returns_error_message():
    class Colour(StepEnum):
        RED = "red"

    result = Colour.validate("green")
    assert result is not None
    assert "green" in result
    assert "Colour" in result


def test_step_enum_members_are_strings():
    class Direction(StepEnum):
        NORTH = "north"

    assert Direction.NORTH == "north"
    assert isinstance(Direction.NORTH, str)


def test_custom_step_type_validate_only():
    """Types with validate() but empty suggested_values() are valid."""
    class PositiveInt(StepType):
        @classmethod
        def validate(cls, value: str) -> str | None:
            return None if value.isdigit() and int(value) > 0 else f"'{value}' must be a positive integer"

    assert PositiveInt.suggested_values() == []
    assert PositiveInt.validate("5") is None
    assert PositiveInt.validate("abc") is not None
