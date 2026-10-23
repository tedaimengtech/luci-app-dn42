#!/bin/sh
# Native official SDK build in the sibling openwrt directory.
set -eu
project=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
release=${OPENWRT_RELEASE:-24.10.4}
target=${OPENWRT_TARGET:-x86/64}
jobs=${JOBS:-2}
case "$jobs" in ''|*[!0-9]*|0) echo 'JOBS must be a positive integer' >&2; exit 1;; esac
build_root="${OPENWRT_DIR:-$(dirname "$project")/openwrt}"
sdk="$build_root"
mkdir -p "$build_root/downloads"
if [ ! -f "$sdk/rules.mk" ]; then
    base_url="https://downloads.openwrt.org/releases/$release/targets/$target"
    sdk_file=$(curl -fsSL "$base_url/" | sed -n 's/.*href="\(openwrt-sdk-[^"]*\.tar\.zst\)".*/\1/p' | head -n 1)
    [ -n "$sdk_file" ] || { echo 'No SDK archive found.' >&2; exit 1; }
    curl -fL --retry 3 "$base_url/$sdk_file" -o "$build_root/downloads/$sdk_file"
    mkdir -p "$sdk"
    tar --zstd -xf "$build_root/downloads/$sdk_file" -C "$sdk" --strip-components=1
fi
# Optional host development packages extracted locally rather than installed globally.
if [ -d "$sdk/local-deps/usr/include" ]; then
    export CPATH="$sdk/local-deps/usr/include${CPATH:+:$CPATH}"
    export LIBRARY_PATH="$sdk/local-deps/usr/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
fi
if [ -d "$sdk/local-tools" ]; then
    export PATH="$sdk/local-tools:$PATH"
fi
cd "$sdk"
if [ -f "$sdk/.dn42-feeds-prepared" ]; then
    export SDK_PREPARED=1
else
    ./scripts/feeds update -a
    ./scripts/feeds install luci-base luci-lib-jsonc lua libuci-lua curl wireguard-tools
    touch "$sdk/.dn42-feeds-prepared"
    export SDK_PREPARED=1
fi
JOBS="$jobs" sh "$project/scripts/sdk-build.sh" "$project"
printf 'Packages: %s/bin/packages/\n' "$sdk"
