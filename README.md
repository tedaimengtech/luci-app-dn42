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

### 最简 SDK 编译环境

使用 [OpenWrt 官方 SDK 容器](https://github.com/openwrt/docker)，只构建插件包，不编译整套固件。需要已启动的 Linux Docker 服务；macOS / Windows 可使用 Docker Desktop，Apple Silicon 通过 `linux/amd64` 模拟运行 SDK。

```sh
./scripts/check.sh
./scripts/build-openwrt.sh
```

默认使用 `openwrt/sdk:x86-64-24.10.4`，作为编译检查基线。安装到设备前请选用与设备版本、目标平台一致的 SDK，例如：

```sh
SDK_IMAGE=openwrt/sdk:mediatek-filogic-24.10.4 JOBS=2 ./scripts/build-openwrt.sh
```

产物放在 `bin/<镜像名>/packages/` 下，下载缓存位于 `.cache/openwrt/<镜像名>/`。容器退出即删除，首次运行需联网下载 SDK、feeds 和构建依赖。源码以只读方式挂载，编译在容器的 Linux 文件系统中完成。SDK 镜像和 Docker 服务需自行安装；脚本检测到缺失会直接报错。

已有 Linux SDK 时，也可在其根目录执行 `sh /源码绝对路径/scripts/sdk-build.sh /源码绝对路径`。此操作会更新 feeds 和 `.config`，应使用专用 SDK 目录。

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
