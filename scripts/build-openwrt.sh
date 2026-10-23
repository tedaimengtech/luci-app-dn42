#!/bin/sh
# Official Linux SDK; only the application package is built.
set -eu
project=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
image=${SDK_IMAGE:-openwrt/sdk:x86-64-24.10.4}
jobs=${JOBS:-2}
case "$jobs" in ''|*[!0-9]*|0) echo 'JOBS must be a positive integer' >&2; exit 1;; esac
command -v docker >/dev/null 2>&1 || {
    echo 'Install Docker (with a Linux backend) to run the OpenWrt SDK.' >&2
    exit 1
}
docker info >/dev/null 2>&1 || {
    echo 'Docker daemon is unavailable. Start Docker Desktop or your Linux Docker backend first.' >&2
    exit 1
}
# Keep downloads and output from different SDK versions/targets separate.
key=$(printf '%s' "$image" | tr '/:' '__')
output="$project/bin/$key"
cache="$project/.cache/openwrt/$key"
mkdir -p "$output" "$cache"
docker run --rm --platform linux/amd64 \
    --mount "type=bind,source=$project,target=/src,readonly" \
    --mount "type=bind,source=$output,target=/builder/bin" \
    --mount "type=bind,source=$cache,target=/builder/dl" \
    --env "JOBS=$jobs" \
    "$image" sh /src/scripts/sdk-build.sh /src
printf 'Packages: %s\n' "$output"
