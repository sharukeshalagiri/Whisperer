"""The meeting worker survives a failing pass instead of stopping for the life of the process."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import OperationalError
from whisperer_api.auth import SystemClock
from whisperer_api.meetings import MeetingService
from whisperer_api.persistence import Database

if TYPE_CHECKING:
    from pathlib import Path


class _UnusedInference:
    """No inference is needed: the worker finds no queued work."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(name)


def test_worker_keeps_running_after_a_database_error(tmp_path: Path) -> None:
    """A transient "database is locked" in one pass must not end the worker task."""
    database = Database(f"sqlite:///{tmp_path / 'api.sqlite3'}")
    database.create_schema()
    service = MeetingService(database, SystemClock(), _UnusedInference(), tmp_path / "audio")
    service._worker_retry_seconds = 0.01
    calls = {"recover": 0}
    original = service._recover_expired_leases

    def flaky() -> None:
        calls["recover"] += 1
        if calls["recover"] == 1:
            raise OperationalError("UPDATE", {}, Exception("database is locked"))
        original()

    service._recover_expired_leases = flaky  # type: ignore[method-assign]

    async def scenario() -> None:
        await service.start()
        for _ in range(200):
            if calls["recover"] >= 2:
                break
            service._wake.set()
            await asyncio.sleep(0.01)
        worker = service._worker
        assert worker is not None
        assert not worker.done(), "the worker stopped after one failing pass"
        await service.stop()

    asyncio.run(scenario())
    assert calls["recover"] >= 2
