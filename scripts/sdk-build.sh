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
if [ "${SDK_PREPARED:-0}" != 1 ]; then
    ./scripts/feeds update -a
    ./scripts/feeds install luci-base luci-lib-jsonc lua libuci-lua curl wireguard-tools
fi
package=package/luci-app-dn42
if [ -e "$package" ]; then
    [ -f "$package/.dn42-local-source" ] || {
        echo "Refusing to replace unmanaged package: $package" >&2
        exit 1
    }
    rm -rf "$package"
fi
mkdir -p "$package"
touch "$package/.dn42-local-source"
# Do not copy tests, local caches, or compiled output into the SDK.
cp "$source_dir/Makefile" "$source_dir/LICENSE" "$package/"
cp -R "$source_dir/root" "$source_dir/htdocs" "$package/"
# Register the local package directly; it is not part of the upstream feed index.
# The source Makefile normally lives under feeds/luci/applications/.
sed 's@include ../../luci.mk@include $(TOPDIR)/feeds/luci/luci.mk@' \
    "$source_dir/Makefile" > "$package/Makefile"
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
# Both built-in (y) and module (m) selections produce an SDK package.
grep -Eq '^CONFIG_PACKAGE_luci-app-dn42=[my]$' .config || {
    echo 'luci-app-dn42 was not selected; package configuration follows:' >&2
    grep -n -A 20 -B 2 'config PACKAGE_luci-app-dn42$' tmp/.config-package.in >&2 || true
    grep -E 'luci-app-dn42|^CONFIG_(MODULES|ALL|ALL_NONSHARED|ALL_KMODS)=' .config >&2 || true
    exit 1
}
make -j"$jobs" package/luci-app-dn42/compile V=s
packages=$(find bin -type f \( -name 'luci-app-dn42*.ipk' -o -name 'luci-app-dn42*.apk' \))
[ -n "$packages" ] || {
    echo 'Build finished without producing a luci-app-dn42 package.' >&2
    exit 1
}
printf '%s\n' "$packages"
