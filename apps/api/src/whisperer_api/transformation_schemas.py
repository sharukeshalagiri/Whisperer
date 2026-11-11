"""Strict HTTP representations for user-reviewed text transformations."""

from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from whisperer_api.schemas import StrictModel

TransformationKind = Literal["polish", "shorten", "expand", "tone", "translate", "custom"]
TransformationResource = Literal["note", "meeting-transcript", "meeting-summary"]


class TextTransformationRequest(StrictModel):
    """Request one proposed rewrite without changing its source.

    Args:
        text: Inline source text, used when no owned resource is referenced.
        kind: Fixed transformation to perform.
        instruction: Required for tone and custom requests, otherwise optional guidance.
        targetLanguage: Language name or tag, required for translation.
        resourceType: Owned server resource whose stored text is transformed.
        resourceId: Identifier of the owned resource.
        sourceRevision: Revision the caller expects the resource to have.
    """

    text: str | None = Field(default=None, max_length=100000)
    kind: TransformationKind
    instruction: str | None = Field(default=None, max_length=2000)
    target_language: str | None = Field(
        default=None,
        max_length=64,
        validation_alias="targetLanguage",
        serialization_alias="targetLanguage",
    )
    resource_type: TransformationResource | None = Field(
        default=None, validation_alias="resourceType", serialization_alias="resourceType"
    )
    resource_id: UUID | None = Field(
        default=None, validation_alias="resourceId", serialization_alias="resourceId"
    )
    source_revision: int | None = Field(
        default=None, ge=0, validation_alias="sourceRevision", serialization_alias="sourceRevision"
    )

    @model_validator(mode="after")
    def check_source(self) -> Self:
        """Require exactly one source and the options each kind needs.

        Args:
            None.

        Returns:
            The validated request.

        Raises:
            ValueError: If the source or required option is missing or ambiguous.
        """
        has_resource = self.resource_type is not None or self.resource_id is not None
        if has_resource and (self.resource_type is None or self.resource_id is None):
            raise ValueError("resourceType and resourceId must be supplied together")
        if has_resource == (self.text is not None):
            raise ValueError("supply either text or a resource reference")
        if self.text is not None and not self.text.strip():
            raise ValueError("text must not be blank")
        if self.kind in ("tone", "custom") and not (self.instruction or "").strip():
            raise ValueError("instruction is required for this transformation")
        if self.kind == "translate" and not (self.target_language or "").strip():
            raise ValueError("targetLanguage is required for translation")
        return self


class TextTransformationResponse(StrictModel):
    """Return a proposed rewrite for the caller to review.

    Args:
        id: Opaque identifier for this generated proposal.
        text: Proposed replacement text.
        sourceRevision: Revision that was transformed, or null for inline text.
    """

    id: UUID
    text: str
    source_revision: int | None = Field(serialization_alias="sourceRevision")
