from __future__ import annotations
from enum import Enum


class StepType:
    """Base class for pytest-bdd step parameter types.

    Subclass and override suggested_values() and/or validate() to add
    autocomplete and validation for step parameters in VS Code.
    """

    @classmethod
    def suggested_values(cls) -> list[str]:
        """Return values to offer as autocomplete suggestions.

        Return an empty list when there is no fixed set of valid values.
        """
        return []

    @classmethod
    def validate(cls, value: str) -> str | None:
        """Return an error message if *value* is invalid, otherwise None."""
        return None


class StepEnum(StepType, str, Enum):
    """StepType mixin for enum-based step parameter types.

    Members are the valid values. suggested_values() and validate() are
    implemented automatically from the enum members.

    Example::

        class AustralianState(StepEnum):
            NSW = "NSW"
            VIC = "Victoria"
            QLD = "Queensland"
    """

    @classmethod
    def suggested_values(cls) -> list[str]:
        return [e.value for e in cls]

    @classmethod
    def validate(cls, value: str) -> str | None:
        if value not in cls._value2member_map_:
            valid = ", ".join(cls._value2member_map_)
            return f"'{value}' is not a valid {cls.__name__}. Expected one of: {valid}"
        return None
