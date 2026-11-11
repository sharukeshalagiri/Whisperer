"""Bounded readiness checks for configured external services."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

import httpx

from whisperer_api.settings import Settings

if TYPE_CHECKING:
    from pydantic import SecretStr


class AsyncHttpGetter(Protocol):
    """Describe the narrow asynchronous HTTP dependency required for readiness.

    Args:
        None.
    """

    async def get(
        self,
        url: str,
        *,
        timeout: float,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """Fetch one URL with a bounded timeout.

        Args:
            url: Absolute URL to request.
            timeout: Maximum request duration in seconds.
            headers: Optional sensitive request headers sent only to the dependency.

        Returns:
            HTTP response, if the request completes.

        Raises:
            httpx.HTTPError: If networking fails before a response is received.
        """


@dataclass(frozen=True, slots=True)
class PreflightResult:
    """Represent sanitized application readiness state.

    Args:
        ready: Whether all configured external checks succeeded.
        missing_configuration: Required setting names not configured.
        failures: Sanitized dependency failure messages.
    """

    ready: bool
    missing_configuration: tuple[str, ...]
    failures: tuple[str, ...]


class PreflightService:
    """Verify OIDC discovery and configured gateway models through injected HTTP.

    Args:
        settings: Validated runtime configuration.
        http_client: HTTP collaborator used for bounded external calls.
    """

    def __init__(self, settings: Settings, http_client: AsyncHttpGetter) -> None:
        """Store configuration and the injected network boundary.

        Args:
            settings: Validated runtime configuration.
            http_client: HTTP collaborator used for bounded external calls.
        """
        self._settings = settings
        self._http_client = http_client

    async def run(self) -> PreflightResult:
        """Run every safe readiness check without exposing external response details.

        Args:
            None.

        Returns:
            Readiness state suitable for an operator-facing endpoint or CLI.
        """
        missing = self._settings.missing_authentication_configuration
        failures: list[str] = []
        if not missing:
            await self._check_oidc_discovery(failures)
        else:
            failures.append("Authentication is not configured.")
        await self._check_gateway_models(failures)
        return PreflightResult(
            ready=not missing and not failures,
            missing_configuration=missing,
            failures=tuple(failures),
        )

    async def _check_oidc_discovery(self, failures: list[str]) -> None:
        """Validate the configured issuer's essential discovery fields.

        Args:
            failures: Mutable sanitized failure collection.

        Returns:
            None.
        """
        if self._settings.oidc_issuer_url is None:
            failures.append("Authentication is not configured.")
            return
        endpoint = (
            f"{str(self._settings.oidc_issuer_url).rstrip('/')}/.well-known/openid-configuration"
        )
        try:
            response = await self._http_client.get(
                endpoint, timeout=self._settings.oidc_timeout_seconds
            )
            if response.status_code < 200 or response.status_code >= 300:
                raise ValueError("OIDC discovery returned an unsuccessful status")
            document = response.json()
            if not isinstance(document, dict) or not all(
                isinstance(document.get(field), str)
                for field in ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri")
            ):
                failures.append("OIDC discovery response is invalid.")
        except (httpx.HTTPError, ValueError, TypeError):
            failures.append("OIDC discovery is unavailable.")

    async def _check_gateway_models(self, failures: list[str]) -> None:
        """Verify each inference endpoint serves its configured model.

        Speech and the language model each resolve to a dedicated endpoint or
        the shared gateway. Each endpoint is probed once with its own key, and
        the gateway is skipped when neither feature uses it.

        Args:
            failures: Mutable sanitized failure collection.

        Returns:
            None.
        """
        settings = self._settings
        probes: dict[str, tuple[str, SecretStr | None, set[str], str]] = {}
        for base_url, api_key, model, label in (
            (
                settings.speech_base_url,
                settings.speech_api_key,
                settings.transcription_model,
                "speech",
            ),
            (settings.llm_base_url, settings.llm_api_key, settings.polish_model, "language"),
        ):
            if base_url is None:
                url, key, name = str(settings.gateway_base_url), settings.gateway_api_key, "gateway"
                if key is None:
                    if "gateway" not in probes:
                        probes["gateway"] = (url, None, set(), "missing")
                    continue
            else:
                url, key, name = str(base_url), api_key, label
            probes.setdefault(name, (url, key, set(), name))[2].add(model)
        for name, (url, key, models, kind) in probes.items():
            if kind == "missing":
                failures.append("Gateway authentication is not configured.")
                continue
            await self._check_models(name, url, key, models, failures)

    async def _check_models(
        self,
        name: str,
        base_url: str,
        api_key: SecretStr | None,
        required: set[str],
        failures: list[str],
    ) -> None:
        """Verify one OpenAI-compatible endpoint lists the required model IDs.

        Args:
            name: ``gateway``, ``speech`` or ``language``, used in safe messages.
            base_url: Endpoint root serving ``/models``.
            api_key: Credential belonging to this endpoint only.
            required: Model IDs the endpoint must list.
            failures: Mutable sanitized failure collection.

        Returns:
            None.
        """
        subject = {"gateway": "gateway", "speech": "speech", "language": "language"}[name]
        headers = {"Authorization": f"Bearer {api_key.get_secret_value()}"} if api_key else None
        try:
            response = await self._http_client.get(
                f"{base_url.rstrip('/')}/models",
                timeout=self._settings.gateway_timeout_seconds,
                headers=headers,
            )
            if response.status_code < 200 or response.status_code >= 300:
                raise ValueError("models endpoint returned an unsuccessful status")
            if not required.issubset(self._model_ids(response.json())):
                if name == "gateway":
                    failures.append("Configured gateway models are unavailable.")
                else:
                    failures.append(f"Configured {subject} model is unavailable.")
        except (httpx.HTTPError, ValueError, TypeError):
            if name == "gateway":
                failures.append("Gateway model discovery is unavailable.")
            else:
                failures.append(f"{subject.capitalize()} model discovery is unavailable.")

    def _model_ids(self, payload: object) -> frozenset[str]:
        """Extract valid model IDs from an OpenAI-compatible models response.

        Args:
            payload: Untrusted decoded gateway response.

        Returns:
            Model identifiers accepted by the response boundary.
        """
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ValueError("invalid models response")
        return frozenset(
            item["id"]
            for item in payload["data"]
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        )
