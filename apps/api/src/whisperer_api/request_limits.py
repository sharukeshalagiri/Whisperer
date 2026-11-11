"""Bound request bodies and refuse unauthenticated uploads before any body is read."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

    from starlette.types import ASGIApp, Message, Receive, Scope, Send

MiB = 1024 * 1024
#: Audio uploads: the 25 MiB audio cap plus multipart framing.
UPLOAD_LIMIT = 26 * MiB
#: A two-way sync snapshot carries complete meeting transcripts and summaries.
SYNC_LIMIT = 64 * MiB
#: Every other request body.
DEFAULT_LIMIT = 4 * MiB

_UPLOAD_PATHS = re.compile(r"^/v1/(transcriptions|meetings/[^/]+/segments/[^/]+)$")
#: Body-carrying /v1 routes that are reachable without a bearer token.
_PUBLIC_PATHS = frozenset({"/v1/auth/refresh", "/v1/local/challenge"})
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def body_limit(path: str) -> int:
    """Return the largest request body accepted for ``path``.

    Args:
        path: Request path.

    Returns:
        Limit in bytes.
    """
    if _UPLOAD_PATHS.match(path):
        return UPLOAD_LIMIT
    if path == "/v1/sync":
        return SYNC_LIMIT
    return DEFAULT_LIMIT


class RequestLimitMiddleware:
    """Pure ASGI middleware that runs before routing parses any body."""

    def __init__(self, app: ASGIApp, bearer_plausible: Callable[[str], bool]) -> None:
        """Wrap ``app``.

        Args:
            app: The application.
            bearer_plausible: Cheap check that a bearer credential could be valid, without the
                database. The route still performs the full check.
        """
        self._app = app
        self._bearer_plausible = bearer_plausible

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Enforce the size limit and the bearer pre-check for body-carrying requests.

        Args:
            scope: ASGI scope.
            receive: ASGI receive callable.
            send: ASGI send callable.
        """
        if scope["type"] != "http" or scope["method"] not in _BODY_METHODS:
            await self._app(scope, receive, send)
            return
        path: str = scope["path"]
        headers = {key.lower(): value for key, value in scope["headers"]}
        if path.startswith("/v1/") and path not in _PUBLIC_PATHS:
            authorization = headers.get(b"authorization", b"").decode("latin-1")
            if not authorization.startswith("Bearer ") or not self._bearer_plausible(
                authorization.removeprefix("Bearer ")
            ):
                await _problem(send, path, 401, "A valid Bearer token is required.")
                return
        limit = body_limit(path)
        declared = headers.get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            await _problem(send, path, 413, "The request body is too large.")
            return
        received = 0
        started = False
        rejected = False

        async def limited_receive() -> Message:
            nonlocal received, started, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Answer now: body parsers turn any read error into their own 400. The app
                    # then sees a disconnect, and whatever it sends afterwards is dropped.
                    rejected = True
                    if not started:
                        started = True
                        await _problem(send, path, 413, "The request body is too large.")
                    return {"type": "http.disconnect"}
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if rejected:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        await self._app(scope, limited_receive, tracking_send)


async def _problem(send: Send, path: str, status: int, detail: str) -> None:
    """Send a small RFC 9457 problem response.

    Args:
        send: ASGI send callable.
        path: Request path for the ``instance`` member.
        status: HTTP status.
        detail: Safe explanation.
    """
    title = {401: "Unauthorized", 413: "Content Too Large"}[status]
    body = json.dumps(
        {
            "type": "about:blank",
            "title": title,
            "status": status,
            "detail": detail,
            "instance": path,
        }
    ).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/problem+json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
