# P2 文件监听最小方案

## 目标

把当前后端从“手动触发扫描”推进到“Vault 文件变化后自动触发同步”。

P2 的重点不是把同步系统一次性做成完整后台任务队列，而是先让桌面应用具备可用的自动同步闭环：

```text
Vault 文件变化
→ watcher 收集事件
→ SyncCoordinator debounce 合并事件
→ SyncCoordinator 触发 scanVault()
→ 由现有 reconcile 逻辑完成 parse/index/delete
```

核心原则：

- watcher 只负责发现变化和触发扫描。
- 扫描请求的 debounce 和串行化交给 `SyncCoordinatorService`。
- `scanVault()` 继续作为唯一权威 reconcile 入口。
- 不把 parse/index/delete 逻辑分散到 watcher 里。
- 第一版优先可用，复杂状态和后台 runner 后置。

## 当前前提

P2 依赖当前已经完成的几块基础：

- `observed_hash` 和 `indexed_hash` 已经拆开。
- `scanVault()` 能发现半完成状态并修复。
- 残留 `running` job 能在下一次扫描时被标记为 `interrupted`。
- 同一文件在当前进程内已经做了串行化，避免重复 parse/index。

因此 watcher 第一版不需要判断某个文件具体该怎么处理。

它只需要告诉系统：

```text
Vault 可能变了，请重新对账。
```

## 第一版运行链路

推荐第一版链路：

```text
后端启动
→ 启动 watcher
→ 收集 add/change/unlink 事件
→ 忽略内部目录和明显无关文件
→ 向 SyncCoordinator 请求 scan
→ SyncCoordinator debounce 一小段时间
→ SyncCoordinator 触发 scanVault()
→ 如果扫描期间又收到事件，记录 pending scan
→ 当前扫描结束后再补跑一次 scanVault()
```

这条链路的重点是避免事件风暴。

例如编辑器保存文件时，可能短时间内产生多次 change / rename / unlink / add 事件。第一版不逐个事件处理，只合并成一次全量 reconcile。

## 模块边界

建议新增独立 watcher 模块，例如：

```text
backend/src/watcher/watcher.module.ts
backend/src/watcher/vault-watcher.service.ts
```

职责划分：

- `VaultWatcherService`
  - 读取 `APOTHECARY_VAULT_PATH`
  - 启动和关闭文件监听
  - 过滤文件事件
  - 调用 `SyncCoordinatorService.requestScan()`
- `StartupSyncService`
  - 后端启动后提交一次 startup scan
  - 独立于 watcher 开关
- `SyncCoordinatorService`
  - debounce 合并扫描请求
  - 保证 `scanVault()` 不并发执行
  - 扫描中收到新请求时，扫描结束后补跑一次
- `IngestService`
  - 保持现有主流程编排职责
  - 不感知事件来源
  - 继续负责 scan/reconcile/parse/index/delete
- `FilesService`
  - 继续只表达文件事实
  - 不承担 watcher 调度职责

这样后端结构仍然是：

```text
watcher
→ sync-coordinator
→ ingest.scanVault()
→ files/parser/documents/embedding/vector/sync
```

启动扫描是另一条触发源：

```text
startup-sync
→ sync-coordinator
→ ingest.scanVault()
```

## 事件范围

第一版只关心这些变化：

- 新增文件
- 修改文件
- 删除文件
- 新增目录
- 删除目录

rename/move 不做特殊识别。

第一版统一按：

```text
旧路径消失
新路径出现
```

交给下一次 `scanVault()` 处理。

也就是说：

- 旧路径会进入 delete reconcile。
- 新路径会进入 present reconcile。
- 后续如果要做 move 识别，再引入 hash/fingerprint 方案。

## 忽略规则

第一版至少忽略：

- `.apothecary/**`
- `.obsidian/**`
- `node_modules/**`
- 隐藏临时文件
- 不支持的扩展名

支持扩展名继续跟随当前扫描能力：

- `.txt`
- `.md`
- `.pdf`
- `.docx`

复杂 ignore 配置先不做。

后续可以再加：

- 用户自定义 ignore pattern
- 最大文件大小限制
- 二进制文件过滤
- 大目录性能保护

## debounce 与串行化

第一版同步协调层内部只需要一个轻量调度状态：

```text
scanInFlight: boolean
scanRequested: boolean
debounceTimer: Timeout | null
```

建议行为：

```text
收到文件事件
→ scanRequested = true
→ 重置 debounceTimer

debounce 到期
→ 如果 scanInFlight = false，开始 scanVault()
→ 如果 scanInFlight = true，只保留 scanRequested = true

scanVault() 结束
→ 如果扫描期间 scanRequested = true，再跑一次
→ 否则回到 idle
```

这个协调层不是正式 async runner。

它只解决扫描请求合并和全量扫描串行化问题。

## 启动扫描

第一版建议后端启动后异步触发一次全量扫描。

原因：

- watcher 只能看到启动后的变化。
- 启动前发生的文件变化需要靠初始 scan 对账。
- 这能让桌面应用打开后自动进入可用状态。

注意：

- 启动 scan 不属于 watcher 职责。
- watcher disabled 只表示不监听后续文件变化，不应影响启动 scan。
- 不建议阻塞 Nest 应用启动。
- 可以 fire-and-forget 执行初始 scan。
- 错误先记录日志，后续同步状态接口再展示给前端。

## 错误处理

第一版错误语义保持简单：

- watcher 启动失败：记录错误，后端仍可通过手动 scan 使用。
- scanVault 失败：记录错误，下一次文件事件或手动 scan 可再次触发。
- 单文件 parse/index 失败：继续使用现有 `files.status = error` 和 `sync_jobs.failed` 语义。

不在 watcher 层做自动 retry backoff。

后续 runner 阶段再统一处理：

- retry 次数
- retry 延迟
- 任务状态查询
- 前端可重试入口

## 验收标准

P2 第一版完成后应满足：

- 后端启动后会监听 Vault 目录。
- 启动后会异步触发一次全量 scan。
- 文件新增、修改、删除后会自动触发 scan。
- 高频文件事件会被 debounce 合并，不会一事件一扫描。
- 扫描运行中再次收到事件时，扫描结束后会补跑一次。
- watcher 不直接执行 parse/index/delete。
- rename/move 即使按 delete + new 处理，也不会破坏一致性。

## 实现切片

### Slice 1：文档与边界

只完成本设计文档，并调整路线文档。

验收：

- watcher 和 runner 的边界清楚。
- 第一版事件模型清楚。
- 不把复杂 ignore、move 识别、retry 提前塞进来。

### Slice 2：watcher 服务骨架

改动范围：

- 新增 watcher module/service。
- 接入应用启动和关闭生命周期。
- 能启动监听并清理资源。

验收：

- 后端启动不报错。
- Vault 路径不存在时给出明确错误。
- 应用关闭时 watcher 能 close。

### Slice 3：事件合并与 scan 调度

改动范围：

- debounce。
- `scanInFlight / scanRequested`。
- 初始 scan。
- 调用 `IngestService.scanVault()`。

验收：

- 多个快速文件事件只触发有限次数扫描。
- scan 期间的事件不会丢。
- SyncCoordinator 不制造并发 `scanVault()`。

### Slice 4：测试

优先测试调度逻辑，不强依赖真实文件系统事件。

建议测试：

- 多次事件 debounce 后只调用一次 scan。
- scan 运行中再次请求，结束后补跑一次。
- scan 失败后状态能回到可再次触发。
- close 后不再触发 scan。

## 非目标

P2 第一版不做：

- 完整 async runner。
- 数据库级 job lease。
- 自动 retry 调度器。
- 复杂 rename/move 识别。
- 用户自定义 ignore 配置。
- 前端同步状态面板。
- Electron 壳。

这些都重要，但不应该阻塞 watcher 第一版落地。
