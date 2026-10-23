# luci-app-dn42

详细架构、数据模型、RPC、应用与恢复流程、ROA 机制及后续计划见 [项目设计文档](docs/DESIGN.md)。

OpenWrt LuCI DN42 管理插件，首版源码。面向 BIRD 2 与每条连接独立的 WireGuard 接口。尚未在 OpenWrt / ImmortalWrt 实机安装验证，不建议直接覆盖生产设备。

## 已实现

- 连接表单：ASN、名称、eBGP/iBGP、公钥、私钥自动生成、PSK、Endpoint、本地可选监听端口、独立 Keepalive、LLA、双栈、MTU、防火墙区域、transit、RR 客户端和内部前缀。
- WireGuard 和防火墙全部通过 UCI API 写入；不直接拼接 `/etc/config/network` 配置。
- `route_allowed_ips=0`，DN42 路由交给 BIRD。默认 AllowedIPs 为 DN42/互联大网段加对端 LLA /128；LAN 前缀需自行补入。
- 引用已有 `dnpeers` / `dnpeers_transit`，不会改变其策略。模板名称可配置。
- eBGP 文件位于 `/etc/bird/peers/dn42_NAME.conf`，iBGP 位于 `/etc/bird/ibgp/dn42_NAME.conf`。
- 应用前预览 BIRD 内容；检查完整 BIRD 配置，失败恢复旧文件和已提交的 UCI 配置。网络/防火墙有未提交修改时拒绝应用。
- 按 ASN 分组，显示 BIRD 概况、详细会话信息、对应 WG Endpoint、握手及流量；10 秒刷新。可重载指定连接的导入策略。
- ROA HTTPS 下载、锁、语法检查、完整配置检查、BIRD 重配置失败恢复、无变化跳过、BGP 导入重载。
- 每小时可配置分钟的 ROA 定时更新；发现旧 update-roa 定时任务时拒绝创建重复任务。保留现有 `/etc/bird/update-roa.sh`，插件使用自己的更新入口。

## 现有 BIRD 接入

主配置须已有对应 include：

```bird
include "/etc/bird/ibgp/*.conf";
include "/etc/bird/peers/*.conf";
```

支持现有 `include "/etc/bird/peers/*"` 形式，但请将备份移出目录。必须存在所选模板，主配置还应有正确的 kernel/direct/ROA/自有路由配置。

iBGP 使用现有 `OWNAS`、`is_valid_network()`、`is_valid_network_v6()`、`dn42_roa` 和 `dn42_roa_v6`。内部允许前缀列表应在两端配置，包含需要交换的 LAN、节点地址和本 AS 聚合前缀；内部列表允许空 AS_PATH 的路由，其他路由要求 ROA_VALID。外部模板已启用的地址族可通过表单禁用，但实际继承行为仍需在目标 BIRD 版本验证。

## 构建

### GitHub Actions

推送到 `main` / `master` 分支、推送 `v*` 标签或手动运行 `Build OpenWrt package` workflow，即可使用 OpenWrt 24.10.4 的 x86/64 SDK 编译插件。仅修改 `README.md` 时不触发自动构建。构建成功后，安装包会上传到仓库的 `latest` Release，并覆盖同名文件。

Workflow 会缓存已准备好的 SDK、feeds 和依赖；命中缓存后直接复制当前源码并编译。需要刷新 SDK 或 feeds 时，递增 `.github/workflows/build.yml` 中的 `SDK_CACHE_VERSION`。每次构建的安装包也会保存在 Actions Artifacts 中。

### 本地 SDK 编译环境

使用 OpenWrt 官方 Linux SDK，只编译插件包。默认将 SDK、feeds、下载缓存和编译产物放在项目同级的 `../openwrt/`（本机为 `/home/tedaimeng/CLionProjects/openwrt/`）。

```sh
./scripts/build-openwrt.sh
```

首次运行下载 OpenWrt 24.10.4 x86/64 SDK 并准备 feeds，后续复用。使用 `OPENWRT_DIR` 可指定其他专用 SDK 目录。构建需要 OpenWrt SDK 所需的本机开发工具与库。切换 SDK 版本或目标时应使用独立目录。

安装包位于 `../openwrt/bin/packages/`。修改源码后再次运行脚本，会更新 SDK 内的插件源码并重新编译。

### 手动构建

放入与设备版本一致的 OpenWrt SDK 的 LuCI feed：

```sh
cp -R luci-app-dn42 feeds/luci/applications/
./scripts/feeds update -i luci
./scripts/feeds install luci-app-dn42
make menuconfig
make package/luci-app-dn42/compile V=s
```

选择 LuCI → Applications → luci-app-dn42。须额外安装设备对应的 BIRD 2 和 WireGuard 内核支持，插件不会替换现有 BIRD 软件包。

安装包后重启 rpcd、刷新 LuCI，入口为“网络 → DN42”。先备份 `/etc/config/network`、`/etc/config/firewall`、`/etc/config/dn42` 和 `/etc/bird*`，从一个禁用的新连接开始测试。

## 验证

```sh
./scripts/check.sh
# 或分别执行：
python3 -m unittest discover -s tests -v
luac -p root/usr/libexec/rpcd/luci.dn42
node --check htdocs/luci-static/resources/view/dn42/peers.js
node --check htdocs/luci-static/resources/view/dn42/status.js
node --check htdocs/luci-static/resources/view/dn42/roa.js
sh -n root/usr/libexec/dn42/update-roa
sh -n root/usr/libexec/dn42/schedule
```

ROA 测试在隔离临时目录中模拟命令，覆盖下载失败、校验失败、重配置错误、内容未变化和成功更新，不触碰系统配置。

## 首版限制 / 实机检查清单

- 当前只展示现有手工 BGP 会话，不支持把手工配置自动导入编辑；对应 WG 详细关联仅针对插件管理的连接。
- 已应用连接禁止改变接口名；不要直接改变 eBGP/iBGP 类型，应删除后重建，避免旧目录遗留。
- 支持删除未应用草稿。删除失败会恢复原有网络、防火墙及 BIRD 文件。
- 应用使用 netifd network reload 与单接口 ifup，需实机检查是否影响其他接口；SSH 经目标隧道时会短暂断开。
- 固定本地端口的被动连接需选择外层入站防火墙区域。未指定端口时不开放随机 UDP 端口，主要用于主动连接。
- 端口冲突目前检查插件内的连接；系统其他进程占用仍需实机验证。
- ROA 手动更新后台执行，避免长时间阻塞 RPC；结果在状态页查看。
- 定时更新日志位于 `/tmp/dn42-roa.log`，最近成功结果位于 `/etc/bird/.dn42-roa-last`；尚无日志轮转、条目统计和恢复历史界面。
- 已支持独立 BGP 启停（仅当前运行状态）、按前缀查询路由和 LLA ping 诊断。尚未实现全表分页检索、密钥导出、结构化状态指标及安装后迁移向导。
- 不创建 SNAT、不修改 DHCP/IPv6 PD、不重写现有 transit 策略。
