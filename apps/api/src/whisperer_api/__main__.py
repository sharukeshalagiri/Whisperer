"""Operational commands for the Whisperer API package."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from whisperer_api.settings import Settings


class CommandRunner:
    """Run explicit API maintenance commands without starting Uvicorn.

    Args:
        settings: Runtime settings loaded for the command.
    """

    def __init__(self, settings: Settings) -> None:
        """Store validated runtime configuration.

        Args:
            settings: Runtime configuration used by commands.
        """
        self._settings = settings

    async def preflight(self) -> int:
        """Print sanitized readiness and return a shell status.

        Args:
            None.

        Returns:
            Zero when every check is ready, otherwise one.
        """
        import httpx

        from whisperer_api.preflight import PreflightService

        async with httpx.AsyncClient(follow_redirects=False) as client:
            result = await PreflightService(self._settings, client).run()
        print(
            json.dumps(
                {
                    "status": "ready" if result.ready else "unavailable",
                    "missingConfiguration": result.missing_configuration,
                    "failures": result.failures,
                },
                sort_keys=True,
            )
        )
        return 0 if result.ready else 1

    def export_openapi(self, output: Path) -> int:
        """Write the generated OpenAPI contract to the requested path.

        Args:
            output: Contract destination managed by this package.

        Returns:
            Zero after atomically writing the JSON document.
        """
        from whisperer_api.main import create_app

        output.parent.mkdir(parents=True, exist_ok=True)
        # Pin LF so the committed contract is byte-identical when regenerated on Windows.
        output.write_text(
            json.dumps(create_app(self._settings).openapi(), indent=2, sort_keys=True) + "\n",
            newline="\n",
        )
        return 0

    def import_legacy(self, source: Path, mapping: Path, apply: bool) -> int:
        """Migrate mapped content from the earlier Node.js API database, dry run by default.

        Args:
            source: Earlier SQLite database, opened read-only.
            mapping: Explicit old user ID to OIDC issuer and subject mapping file.
            apply: Whether to commit inserts into this API's database.

        Returns:
            Zero after reporting candidate or inserted row counts.
        """
        from whisperer_api.legacy_import import LegacyImporter
        from whisperer_api.persistence import Database

        database = Database(self._settings.database_url)
        database.create_schema()
        result = LegacyImporter(database).run(source, mapping, apply)
        print(json.dumps(asdict(result), sort_keys=True))
        return 0


def main() -> int:
    """Parse and run a package operational command.

    Args:
        None.

    Returns:
        POSIX process exit status.
    """
    parser = argparse.ArgumentParser(prog="python -m whisperer_api")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("preflight")
    export = commands.add_parser("openapi")
    export.add_argument("--output", required=True, type=Path)
    legacy = commands.add_parser("import-legacy")
    legacy.add_argument("--source", required=True, type=Path)
    legacy.add_argument("--mapping", required=True, type=Path)
    legacy.add_argument("--apply", action="store_true")
    local = commands.add_parser("serve-local")
    local.add_argument("--config", required=True, type=Path)
    arguments = parser.parse_args()
    if arguments.command == "serve-local":
        # Environment settings are ignored: the desktop's config file is the only input.
        from whisperer_api.local_runtime import serve_local

        return serve_local(arguments.config)
    from whisperer_api.settings import Settings

    runner = CommandRunner(Settings())
    if arguments.command == "preflight":
        return asyncio.run(runner.preflight())
    if arguments.command == "import-legacy":
        return runner.import_legacy(arguments.source, arguments.mapping, arguments.apply)
    return runner.export_openapi(arguments.output)


if __name__ == "__main__":
    raise SystemExit(main())
