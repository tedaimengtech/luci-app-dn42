#!/bin/bash
# Build both formats in reusable, separate SDKs; never build runtime dependencies.
set -euo pipefail
project=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cache=${OPENWRT_CI_DIR:-"$project/.cache/openwrt-ci"}
output="$project/artifacts"
version=${PACKAGE_VERSION:-"$(TZ=Asia/Shanghai date +'%Y.%m.%d.%H%M%S').${GITHUB_RUN_ID:-0}.${GITHUB_RUN_ATTEMPT:-1}"}

# Ubuntu hosted runners already contain most SDK prerequisites. Avoid apt entirely
# when all are present; a cached SDK still needs its system libraries on each runner.
if [[ ${CI:-} == true ]]; then
    missing=()
    for dependency in build-essential gawk libncurses-dev libssl-dev python3-setuptools rsync unzip zstd file; do
        if [[ $(dpkg-query -W -f='${Status}' "$dependency" 2>/dev/null || true) != 'install ok installed' ]]; then
            missing+=("$dependency")
        fi
    done
    if ((${#missing[@]})); then
        sudo apt-get update -o Acquire::Retries=3
        sudo apt-get install -y --no-install-recommends "${missing[@]}"
    fi
fi

mkdir -p "$cache" "$output"
# Only current packages belong in the artifact and release.
find "$output" -maxdepth 1 -type f \( -name 'luci-app-dn42*.ipk' -o -name 'luci-app-dn42*.apk' \) -delete
for spec in '24.10.4 13.3.0 ipk' '25.12.6 14.3.0 apk'; do
    read -r release compiler format <<< "$spec"
    sdk="$cache/sdk-$release"
    if [[ ! -f "$sdk/.dn42-ci-ready" ]]; then
        filename="openwrt-sdk-$release-x86-64_gcc-${compiler}_musl.Linux-x86_64.tar.zst"
        base_url="https://downloads.openwrt.org/releases/$release/targets/x86/64"
        download=$(mktemp -d)
        # Visible errors and retries, without HTML scraping or grep/head pipelines.
        curl --fail --location --retry 5 --retry-all-errors --connect-timeout 20 \
            "$base_url/$filename" -o "$download/$filename"
        curl --fail --location --retry 5 --retry-all-errors --connect-timeout 20 \
            "$base_url/sha256sums" -o "$download/sha256sums"
        checksum=$(awk -v name="$filename" '$2 == name || $2 == "*" name { print $1 "  " name }' "$download/sha256sums")
        test -n "$checksum"
        (cd "$download"; printf '%s\n' "$checksum" | sha256sum --check -)
        mkdir -p "$sdk"
        tar --zstd -xf "$download/$filename" -C "$sdk" --strip-components=1
        rm -rf "$download"
        (
            cd "$sdk"
            # Only these feeds supply this package's metadata; skip routing,
            # telephony and video repositories and their indexing work.
            awk '/^src-/ && /[[:space:]](base|packages|luci)[[:space:]]/' \
                feeds.conf.default > feeds.conf
            test -s feeds.conf
            ./scripts/feeds update -a
            ./scripts/feeds install luci-base luci-lib-jsonc lua libuci-lua curl wireguard-tools
        )
        touch "$sdk/.dn42-ci-ready"
    fi
    (
        cd "$sdk"
        SDK_PREPARED=1 PACKAGE_VERSION="$version" JOBS="${JOBS:-$(nproc)}" \
            sh "$project/scripts/sdk-build.sh" "$project"
    )
    # A warm SDK may contain older packages: collect only this run's version.
    find "$sdk/bin/packages" -type f -name "luci-app-dn42*${version}-r1*.${format}" \
        -exec cp -v {} "$output/" \;
    test -n "$(find "$output" -maxdepth 1 -name "luci-app-dn42*${version}-r1*.${format}" -print -quit)"
done
if [[ -n ${GITHUB_OUTPUT:-} ]]; then
    printf 'tag=v%s\n' "$version" >> "$GITHUB_OUTPUT"
fi
