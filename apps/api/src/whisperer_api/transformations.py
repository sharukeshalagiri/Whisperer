"""Generate reviewed text transformations without mutating their sources."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol
from uuid import UUID, uuid4

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from whisperer_api.transformation_schemas import (
    TextTransformationRequest,
    TextTransformationResponse,
    TransformationKind,
    TransformationResource,
)

_MAX_SOURCE_CHARACTERS = 100000


class TransformationGateway(Protocol):
    """Describe the inference operation used for one fixed transformation."""

    async def transform(
        self,
        kind: TransformationKind,
        text: str,
        instruction: str | None,
        target_language: str | None,
    ) -> str:
        """Rewrite text according to a fixed transformation kind.

        Args:
            kind: Allowlisted transformation.
            text: User-owned source text.
            instruction: Optional or required user guidance.
            target_language: Language for translation, otherwise None.

        Returns:
            Proposed replacement text.

        Raises:
            ValueError: If the gateway response is unusable.
        """
        ...


class TransformationSources(Protocol):
    """Read owned server text and the revision it was read at."""

    def transformation_source(
        self,
        session: Session,
        user_id: str,
        resource_type: TransformationResource,
        resource_id: UUID,
    ) -> tuple[str, int]:
        """Return owned resource text and its current revision.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            resource_type: Kind of owned text resource.
            resource_id: Owned resource identifier.

        Returns:
            Stored text and revision.

        Raises:
            ResourceNotFoundError: If the resource is absent or foreign-owned.
        """
        ...


class TransformationConflictError(Exception):
    """Report that the referenced resource changed before transformation."""


class TransformationSourceError(Exception):
    """Report that the referenced resource has no text to transform."""


class TransformationService:
    """Produce reviewable rewrites, leaving acceptance to resource edit routes.

    Args:
        gateway: Inference collaborator that performs the rewrite.
        sources: Resolver for owned notes and meeting text.
    """

    def __init__(self, gateway: TransformationGateway, sources: TransformationSources) -> None:
        """Store collaborators.

        Args:
            gateway: Inference collaborator that performs the rewrite.
            sources: Resolver for owned notes and meeting text.
        """
        self._gateway = gateway
        self._sources = sources

    def source(
        self, session: Session, user_id: str, request: TextTransformationRequest
    ) -> tuple[str, int | None]:
        """Resolve the text to transform inside a short database transaction.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            request: Validated transformation request.

        Returns:
            Source text and its revision, or None for inline text.

        Raises:
            ResourceNotFoundError: If a referenced resource is absent or foreign-owned.
            TransformationConflictError: If the expected revision is stale.
            TransformationSourceError: If the resource text is empty or too large.
        """
        if request.resource_type is None or request.resource_id is None:
            return request.text or "", None
        text, revision = self._sources.transformation_source(
            session, user_id, request.resource_type, request.resource_id
        )
        if request.source_revision is not None and request.source_revision != revision:
            raise TransformationConflictError
        if not text.strip() or len(text) > _MAX_SOURCE_CHARACTERS:
            raise TransformationSourceError
        return text, revision

    async def generate(
        self, request: TextTransformationRequest, text: str, revision: int | None
    ) -> TextTransformationResponse:
        """Call the gateway outside any database transaction.

        Args:
            request: Validated transformation request.
            text: Resolved source text.
            revision: Source revision, or None for inline text.

        Returns:
            Proposed text for user review.

        Raises:
            ValueError: If the gateway response is unusable.
        """
        output = await self._gateway.transform(
            request.kind, text, request.instruction, request.target_language
        )
        if not output.strip():
            raise ValueError("transformation response is empty")
        return TextTransformationResponse(id=uuid4(), text=output.strip(), source_revision=revision)
