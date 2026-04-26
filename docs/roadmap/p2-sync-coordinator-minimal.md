# P2 同步协调层最小方案

## 目标

把 watcher 里的扫描调度逻辑抽成后端内部核心能力。

当前 watcher 第一版已经能做到：

```text
Vault 文件变化
→ debounce
→ scanVault()
```

但这会让 watcher 同时承担两个职责：

- 监听文件系统事件
- 决定什么时候扫描、如何串行扫描、扫描失败后如何恢复可触发状态

P2 这一小步要把它拆开：

```text
startup trigger ┐
                ├→ SyncCoordinator.requestScan(reason)
watcher trigger ┘
                  → ingest.scanVault()
```

这样启动扫描和文件监听扫描是两种独立触发源，但都会进入同一个同步协调层。

watcher 只负责“发现文件变化”。

同步协调层负责“让扫描请求安全执行”。

## 设计原则

- 不写 controller。
- 不做前端状态展示。
- 不把 `sync_jobs` 变成任务队列。
- 不做完整 async runner。
- 不引入数据库级 lease。
- `scanVault()` 继续作为唯一权威 reconcile 入口。

这一版只做后端内部链路解耦。

## 模块边界

建议新增独立模块：

```text
backend/src/sync-coordinator/sync-coordinator.module.ts
backend/src/sync-coordinator/sync-coordinator.service.ts
```

职责划分：

- `VaultWatcherService`
  - 启动 / 关闭文件监听
  - 过滤 watcher 事件
  - 把有效事件转成 `requestScan(reason)`
- `StartupSyncService`
  - 在应用启动后请求一次 `startup` scan
  - 不依赖 watcher 是否启用
- `SyncCoordinatorService`
  - 接受扫描请求
  - debounce 合并请求
  - 保证同一时间只有一个 `scanVault()`
  - 如果扫描期间又收到请求，结束后补跑一次
  - 捕获 scan 错误，保证后续请求还能继续触发
- `IngestService`
  - 继续负责 `scanVault()`
  - 继续负责 scan/reconcile/parse/index/delete 主链路

模块依赖方向：

```text
startup-sync ┐
             ├→ sync-coordinator
watcher ─────┘
→ ingest
→ files/parser/documents/embedding/vector/sync
```

## 扫描触发源

当前后端有两类扫描触发源。

### 启动扫描

后端服务启动后，应请求一次全量 scan。

目的：

- 发现服务关闭期间发生的文件变化。
- 触发 `scanVault()` 开头的残留 `running` job 收口。
- 让桌面应用启动后自动完成一次对账。

启动扫描不属于 watcher 职责。

即使 `APOTHECARY_WATCHER_ENABLED=false`，启动扫描仍然应该执行。

### 文件监听扫描

watcher 只处理服务运行期间的文件变化。

当 Vault 目录发生有效文件事件时：

```text
VaultWatcherService
→ SyncCoordinatorService.requestScan("watcher:<event>:<path>")
```

如果 watcher 被禁用，只是不监听后续文件变化，不影响启动扫描。

## 第一版状态模型

`SyncCoordinatorService` 内部只需要几个进程内状态：

```text
debounceTimer: Timeout | null
scanInFlight: boolean
scanRequested: boolean
pendingScanReason: string
closed: boolean
```

含义：

- `debounceTimer`：合并短时间内的多次扫描请求
- `scanInFlight`：当前是否已经有 scan 正在执行
- `scanRequested`：是否存在待处理扫描请求
- `pendingScanReason`：最近一次请求原因，主要用于日志
- `closed`：协调层是否已关闭

这仍然是进程内调度状态，不是持久化任务状态。

## 执行规则

请求进入：

```text
requestScan(reason)
→ scanRequested = true
→ pendingScanReason = reason
→ 重置 debounceTimer
```

debounce 到期：

```text
如果 scanInFlight = true
  → 不启动新的 scan

如果 scanInFlight = false
  → 开始 drainScanQueue()
```

执行扫描：

```text
scanInFlight = true

while scanRequested:
  reason = pendingScanReason
  scanRequested = false
  await ingest.scanVault()

scanInFlight = false
```

扫描中又收到请求：

```text
scanRequested = true
pendingScanReason = 新 reason

当前 scanVault() 结束后
→ while 继续
→ 补跑一次 scanVault()
```

扫描失败：

```text
捕获错误
记录日志
不向外抛出
scanInFlight 回到 false
后续 requestScan 仍然可用
```

## 配置

第一版仍沿用 watcher debounce 配置：

```text
APOTHECARY_WATCHER_DEBOUNCE_MS=750
```

虽然 debounce 移到 `SyncCoordinatorService`，当前唯一请求来源仍然是 watcher，因此暂时不新增第二套配置。

后续如果手动 API、retry 或 runner 都接入 coordinator，再考虑把它重命名为更通用的：

```text
APOTHECARY_SYNC_DEBOUNCE_MS
```

## 验收标准

完成后应满足：

- watcher 不再直接调用 `IngestService.scanVault()`。
- watcher 不再持有 `scanInFlight / scanRequested / debounceTimer`。
- watcher 不负责启动扫描。
- startup scan 由独立启动触发服务提交。
- watcher disabled 时，startup scan 仍然会提交。
- 文件事件只调用 `SyncCoordinatorService.requestScan()`。
- coordinator 单测覆盖 debounce、扫描中补跑、失败后可再次触发、close 后不触发。
- startup trigger 单测覆盖应用启动后提交 `startup` scan。
- watcher 单测只覆盖启动、关闭、事件过滤和请求转发。
- 不新增 controller。
- 不新增前端代码。

## 非目标

这一小步不做：

- `GET /sync/status`
- 前端同步状态展示
- 完整后台 runner
- 数据库任务队列
- retry backoff
- 跨进程锁
- 任务持久化状态

这些可以在后端核心链路稳定后再做。
