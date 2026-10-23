#!/bin/sh
# Run from the root of a disposable Linux OpenWrt SDK.
set -eu
source_dir=${1:-/src}
jobs=${JOBS:-2}
case "$jobs" in ''|*[!0-9]*|0) echo 'JOBS must be a positive integer' >&2; exit 1;; esac
if [ ! -d scripts ] && [ -f setup.sh ]; then
    bash ./setup.sh
fi
[ -f rules.mk ] && [ -x scripts/feeds ] || {
    echo 'Run sdk-build.sh from the root of an OpenWrt SDK.' >&2
    exit 1
}
./scripts/feeds update -a
package=feeds/luci/applications/luci-app-dn42
[ ! -e "$package" ] || {
    echo "Package already exists: $package (use a disposable SDK)." >&2
    exit 1
}
mkdir -p "$package"
# Do not copy tests, local caches, or compiled output into the SDK.
cp "$source_dir/Makefile" "$source_dir/LICENSE" "$package/"
cp -R "$source_dir/root" "$source_dir/htdocs" "$package/"
./scripts/feeds update -i luci
./scripts/feeds install luci-app-dn42
touch .config
sed '/^CONFIG_ALL[=_]/d; /^# CONFIG_ALL[ _]/d; /^CONFIG_PACKAGE_luci-app-dn42=/d; /^# CONFIG_PACKAGE_luci-app-dn42 is not set$/d' .config > .config.dn42
cat >> .config.dn42 <<'EOF'
# CONFIG_ALL is not set
# CONFIG_ALL_NONSHARED is not set
# CONFIG_ALL_KMODS is not set
CONFIG_PACKAGE_luci-app-dn42=m
EOF
mv .config.dn42 .config
make defconfig
grep -q '^CONFIG_PACKAGE_luci-app-dn42=m$' .config || {
    echo 'luci-app-dn42 was not selected; check feed/dependency errors above.' >&2
    exit 1
}
make -j"$jobs" package/luci-app-dn42/compile V=s
packages=$(find bin -type f \( -name 'luci-app-dn42*.ipk' -o -name 'luci-app-dn42*.apk' \))
[ -n "$packages" ] || {
    echo 'Build finished without producing a luci-app-dn42 package.' >&2
    exit 1
}
printf '%s\n' "$packages"
