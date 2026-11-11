# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Pin both images by digest so a rebuild uses the reviewed Python and uv releases.
FROM ghcr.io/astral-sh/uv:0.9.29@sha256:db9370c2b0b837c74f454bea914343da9f29232035aa7632a1b14dc03add9edb AS uv
FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH=/app/.venv/bin:$PATH

WORKDIR /app
COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --all-packages --no-install-package whisperer-api

COPY apps/api/src/ apps/api/src/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --all-packages \
    # Keep the prior Node service's non-root UID so its retained api-data volume remains writable.
    && groupadd --gid 1000 whisperer \
    && useradd --uid 1000 --gid whisperer --create-home --home-dir /home/whisperer --shell /usr/sbin/nologin whisperer \
    && install --directory --owner=whisperer --group=whisperer /data

USER whisperer
EXPOSE 4318
CMD ["uvicorn", "whisperer_api.main:app", "--host", "0.0.0.0", "--port", "4318"]
