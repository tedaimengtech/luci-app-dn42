include $(TOPDIR)/rules.mk
LUCI_TITLE:=DN42 WireGuard and BIRD management
LUCI_DEPENDS:=+luci-base +luci-lib-jsonc +lua +libuci-lua +curl +wireguard-tools
LUCI_PKGARCH:=all
PKG_LICENSE:=MIT

define Package/luci-app-dn42/conffiles
/etc/config/dn42
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
