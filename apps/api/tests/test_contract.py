"""Tests for published FastAPI contract identities."""

from __future__ import annotations

from whisperer_api.main import create_app
from whisperer_api.settings import Settings


def test_openapi_preserves_resource_operation_ids() -> None:
    """Publish stable operation IDs required by the generated desktop client."""
    schema = create_app(Settings()).openapi()

    assert schema["paths"]["/v1/notes"]["get"]["operationId"] == "listNotes"
    assert schema["paths"]["/v1/dictionary"]["get"]["operationId"] == "listDictionary"
    assert schema["paths"]["/v1/transcripts"]["get"]["operationId"] == "listTranscripts"
    assert schema["paths"]["/v1/transcriptions"]["post"]["operationId"] == "createTranscription"
    assert (
        schema["paths"]["/v1/transcripts/{transcript_id}"]["delete"]["operationId"]
        == "deleteTranscript"
    )
    assert schema["paths"]["/v1/notes/{note_id}/summary"]["post"]["operationId"] == "summarizeNote"
    assert (
        schema["paths"]["/v1/meetings/{meeting_id}/questions"]["post"]["operationId"]
        == "askMeetingQuestion"
    )
    assert (
        schema["paths"]["/v1/dictionary/{entry_id}"]["put"]["operationId"]
        == "replaceDictionaryEntry"
    )
    assert (
        schema["paths"]["/v1/dictionary/{entry_id}"]["delete"]["operationId"]
        == "deleteDictionaryEntry"
    )
    assert schema["paths"]["/device/stream"]["get"]["operationId"] == "streamDeviceAuthorization"
