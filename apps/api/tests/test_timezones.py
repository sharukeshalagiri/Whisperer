"""Time-zone data must ship with the API, including on Windows."""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError
from whisperer_api.metrics_schemas import IanaTimezone

_TIMEZONE = TypeAdapter(IanaTimezone)


@pytest.mark.parametrize("zone", ["UTC", "Europe/Berlin", "America/New_York", "Asia/Kolkata"])
def test_iana_time_zones_resolve_without_a_system_database(zone: str) -> None:
    """Accept common zones even where the OS has no tz database (Windows uses tzdata).

    Args:
        zone: IANA identifier the desktop may send with a dictation metric.

    Returns:
        None.
    """
    assert _TIMEZONE.validate_python(zone) == zone


def test_unknown_time_zones_are_rejected() -> None:
    """Reject identifiers that no tz database defines.

    Args:
        None.

    Returns:
        None.
    """
    with pytest.raises(ValidationError):
        _TIMEZONE.validate_python("Not/AZone")
