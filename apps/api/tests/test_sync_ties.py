"""Two servers resolve a same-timestamp conflict the same way, so they converge."""

from __future__ import annotations

from datetime import UTC, datetime

from whisperer_api.sync import local_copy_wins

_AT = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)


def test_newer_edit_wins_on_either_side() -> None:
    """Timestamps decide whenever they differ."""
    later = datetime(2026, 11, 11, 12, 1, tzinfo=UTC)
    assert local_copy_wins(later, ("a",), _AT, ("b",))
    assert not local_copy_wins(_AT, ("a",), later, ("b",))


def test_equal_timestamps_pick_the_same_copy_on_both_servers() -> None:
    """Each server sees the other's copy as incoming; exactly one copy must win on both."""
    first, second = ("Title", "first text", None), ("Title", "second text", None)
    first_server_keeps_first = local_copy_wins(_AT, first, _AT, second)
    second_server_keeps_second = local_copy_wins(_AT, second, _AT, first)
    assert first_server_keeps_first != second_server_keeps_second


def test_identical_copies_change_nothing() -> None:
    """Equal content at an equal time is not an update."""
    assert local_copy_wins(_AT, ("same",), _AT, ("same",))
