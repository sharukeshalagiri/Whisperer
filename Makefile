# GNU Make entry points. Each target delegates platform work to Node so it also
# works under GNU Make on Windows without POSIX shell recipes.
.PHONY: help setup desktop-build desktop-test desktop-lint desktop linux server windows dmg macos-zip brand-setup brand docs-check api-setup api-test api-lint api-contract api-preflight api-build api-up api-down api-status api-logs stack-up stack-down stack-status stack-config

help setup desktop-build desktop-test desktop-lint desktop linux server windows dmg macos-zip brand-setup brand docs-check api-setup api-test api-lint api-contract api-preflight api-build api-up api-down api-status api-logs stack-up stack-down stack-status stack-config:
	node tools/commands.mjs $@
