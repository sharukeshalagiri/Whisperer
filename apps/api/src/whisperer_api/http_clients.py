"""Routing rules shared by every outbound HTTP client."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

# httpx and httpx2 honour HTTP(S)_PROXY and the operating system proxy, and neither exempts
# loopback on its own. A loopback endpoint (Ollama, a local speech server, a gateway sidecar)
# must be called directly, or audio and text bound for this machine would reach the proxy.
LOOPBACK_DIRECT: Mapping[str, None] = {
    "all://127.0.0.1": None,
    "all://localhost": None,
    "all://[::1]": None,
}
