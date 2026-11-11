"""Strict HTTP representations for the Whisperer API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class StrictModel(BaseModel):
    """Reject unknown properties at every JSON command boundary.

    Args:
        None.
    """

    model_config = ConfigDict(extra="forbid")


class Problem(StrictModel):
    """Represent an RFC 9457-compatible safe API error.

    Args:
        type: Stable machine-readable problem URI.
        title: HTTP status title.
        status: HTTP response status.
        detail: Safe client-readable explanation.
        instance: Request path which produced the error.
    """

    type: str
    title: str
    status: int
    detail: str
    instance: str


class HealthResponse(StrictModel):
    """Represent liveness compatible with the former service.

    Args:
        status: Fixed healthy indicator.
        service: Fixed service identifier.
        version: Fixed API generation number.
    """

    status: Literal["ok"] = "ok"
    service: Literal["whisperer"] = "whisperer"
    version: Literal[1] = 1
    instance_id: UUID | None = Field(
        default=None,
        serialization_alias="instanceId",
        description="Desktop-assigned instance, present only on an on-device server.",
    )


class LocalChallengeRequest(StrictModel):
    """Carry a desktop nonce for proof of boot-token possession.

    Args:
        nonce: 16 to 256 base64url characters chosen by the desktop.
    """

    nonce: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{16,256}$")]


class LocalChallengeResponse(StrictModel):
    """Prove the server holds the boot token without revealing it.

    Args:
        hmac: Unpadded base64url HMAC-SHA256 of the nonce, keyed by the token text.
    """

    hmac: str


class InferenceEngineStatus(StrictModel):
    """Describe one inference engine without credentials.

    Args:
        provider: ``http``, ``onnx``, ``off`` or null when not set up.
        model: Model name or catalog identifier.
        status: Lifecycle state.
        message: Safe user-facing explanation.
    """

    provider: str | None
    model: str | None
    status: Literal["ready", "missing", "downloading", "loading", "failed", "unconfigured", "off"]
    message: str


class InferenceStatusResponse(StrictModel):
    """Report speech and language-model readiness separately.

    Args:
        speech: Speech engine state.
        llm: Language-model engine state.
    """

    speech: InferenceEngineStatus
    llm: InferenceEngineStatus


class SpeechModelResponse(StrictModel):
    """Describe one supported on-device speech model.

    Args:
        id: Catalog identifier shown to users.
        title: Display name.
        revision: Pinned upstream commit.
        license: Weights license.
        languages: Supported language codes.
        sizeBytes: Total download size.
        installed: Whether a complete copy is installed.
    """

    id: str
    title: str
    revision: str
    license: str
    languages: list[str]
    size_bytes: int = Field(serialization_alias="sizeBytes")
    installed: bool


class SpeechModelListResponse(StrictModel):
    """List supported on-device speech models.

    Args:
        items: Catalog entries.
    """

    items: list[SpeechModelResponse]


class ModelDownloadRequest(StrictModel):
    """Request one explicit catalog model download.

    Args:
        model: Catalog identifier.
    """

    model: str = Field(min_length=1, max_length=200)


class ModelDownloadResponse(StrictModel):
    """Acknowledge a started model download.

    Args:
        model: Catalog identifier.
        status: Always ``downloading``.
    """

    model: str
    status: Literal["downloading"] = "downloading"


class InferenceTestRequest(StrictModel):
    """Choose which engine to probe.

    Args:
        target: ``speech`` or ``llm``.
    """

    target: Literal["speech", "llm"]


class InferenceTestResponse(StrictModel):
    """Report one engine probe.

    Args:
        ok: Whether the engine answered correctly.
        latencyMs: Elapsed milliseconds.
        message: Safe explanation.
    """

    ok: bool
    latency_ms: int = Field(serialization_alias="latencyMs")
    message: str


class ReadyResponse(StrictModel):
    """Represent safe external dependency readiness.

    Args:
        status: Ready or unavailable state.
        missingConfiguration: Required setting names only.
        failures: Sanitized dependency errors.
    """

    status: Literal["ready", "unavailable"]
    missing_configuration: tuple[str, ...] = Field(serialization_alias="missingConfiguration")
    failures: tuple[str, ...]


class UserResponse(StrictModel):
    """Represent public local user information.

    Args:
        id: Opaque local account ID.
        firstName: Identity provider profile given name when supplied.
        lastName: Identity provider profile family name when supplied.
        onboardingCompleted: User's application onboarding state.
    """

    id: UUID
    first_name: str | None = Field(serialization_alias="firstName")
    last_name: str | None = Field(serialization_alias="lastName")
    onboarding_completed: bool = Field(serialization_alias="onboardingCompleted")


class UserUpdateRequest(StrictModel):
    """Partially update the local profile fields without changing OIDC identity.

    Args:
        firstName: Optional local first name.
        lastName: Optional local last name.
    """

    first_name: str | None = Field(default=None, max_length=200, alias="firstName")
    last_name: str | None = Field(default=None, max_length=200, alias="lastName")


class CurrentUserResponse(StrictModel):
    """Wrap the current user under the legacy response key.

    Args:
        user: Authenticated public local user.
    """

    user: UserResponse


class RefreshRequest(StrictModel):
    """Request local application refresh-token rotation.

    Args:
        refreshToken: Opaque refresh credential issued by this API.
    """

    refresh_token: str = Field(min_length=43, max_length=256, serialization_alias="refreshToken")


class RefreshResponse(StrictModel):
    """Return a short app access token and rotated refresh credential.

    Args:
        accessToken: Short-lived API JWT.
        refreshToken: Newly issued opaque local refresh credential.
    """

    access_token: str = Field(serialization_alias="accessToken")
    refresh_token: str = Field(serialization_alias="refreshToken")


class DevicePollResponse(StrictModel):
    """Represent protected device authorization state.

    Args:
        status: Pending or atomically redeemed completion state.
        accessToken: App access token only after completion.
        refreshToken: App refresh credential only after completion.
        provider: Generic upstream authentication type.
        firstName: Public first name when available.
        lastName: Public last name when available.
        onboardingCompleted: Application onboarding state.
    """

    status: Literal["pending", "complete"]
    access_token: str | None = Field(default=None, serialization_alias="accessToken")
    refresh_token: str | None = Field(default=None, serialization_alias="refreshToken")
    provider: str | None = None
    first_name: str | None = Field(default=None, serialization_alias="firstName")
    last_name: str | None = Field(default=None, serialization_alias="lastName")
    onboarding_completed: bool | None = Field(
        default=None, serialization_alias="onboardingCompleted"
    )


class NoteCreateRequest(StrictModel):
    """Create a note from a title and content.

    Args:
        title: Note title, possibly empty.
        content: Note content, possibly empty.
    """

    title: str = Field(max_length=200)
    content: str = Field(max_length=100000)


class NoteUpdateRequest(StrictModel):
    """Partially update a note title, content or pin state.

    Args:
        title: Optional replacement title.
        content: Optional replacement content.
        pinned: Optional pin state.
    """

    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=100000)
    pinned: bool | None = None


class NoteResponse(StrictModel):
    """Represent an owned note.

    Args:
        id: Stable note ID.
        title: Display title.
        content: Note content.
        summary: Generated summary or absent value.
        pinned: Pin state.
        createdAt: Creation timestamp.
        updatedAt: Last mutation timestamp.
    """

    id: UUID
    title: str
    content: str
    summary: str | None
    pinned: bool
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")


class NoteListResponse(StrictModel):
    """Wrap a list of owned notes.

    Args:
        items: Notes ordered by update time descending.
    """

    items: list[NoteResponse]


NonBlankDictionaryText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class DictionaryCreateRequest(StrictModel):
    """Create a private substitution entry.

    Args:
        phrase: Required phrase to recognize.
        replacement: Optional desired text.
    """

    phrase: Annotated[NonBlankDictionaryText, Field(max_length=200)]
    replacement: Annotated[NonBlankDictionaryText, Field(max_length=500)]


class DictionaryUpdateRequest(StrictModel):
    """Partially update a private substitution entry.

    Args:
        phrase: Optional phrase replacement.
        replacement: Optional output replacement.
    """

    phrase: Annotated[NonBlankDictionaryText, Field(max_length=200)] | None = None
    replacement: Annotated[NonBlankDictionaryText, Field(max_length=500)] | None = None


class DictionaryResponse(StrictModel):
    """Represent a private dictionary entry.

    Args:
        id: Stable entry ID.
        phrase: Recognized phrase.
        replacement: Output replacement.
    """

    id: UUID
    phrase: str
    replacement: str


class DictionaryListResponse(StrictModel):
    """Wrap private dictionary entries.

    Args:
        items: Entries ordered by creation time.
    """

    items: list[DictionaryResponse]


class TranscriptResponse(StrictModel):
    """Represent a persisted transcription.

    Args:
        id: Stable transcript ID.
        text: Final presentation text.
        rawText: Upstream text before substitutions.
        language: Optional spoken language tag.
        createdAt: Creation timestamp.
        dictionaryReplacements: Number of substitutions applied before polish.
    """

    id: UUID
    text: str
    raw_text: str = Field(serialization_alias="rawText")
    language: str | None
    created_at: datetime = Field(serialization_alias="createdAt")
    dictionary_replacements: int = Field(default=0, serialization_alias="dictionaryReplacements")


class TranscriptListResponse(StrictModel):
    """Wrap caller-owned transcripts.

    Args:
        items: Transcripts ordered newest first.
    """

    items: list[TranscriptResponse]
