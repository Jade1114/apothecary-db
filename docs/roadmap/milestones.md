# 项目演进里程碑

这份文档把当前项目从“主链路已打通”继续推进到“可恢复、可自动同步、可产品化”的路线拆成几个里程碑。

它不是需求池，也不是历史记录。

它的作用只有一个：给后续实现提供稳定的推进顺序和验收标准。

## 当前阶段判断

当前项目大致处在：

```text
Phase 2.5 = 文件驱动主链路已通，但状态机、恢复能力、自动同步还未收口
```

阶段划分建议：

```text
Phase 1   手动 ingest demo
Phase 2   Vault 文件驱动索引主链路
Phase 3   状态机收紧 + 中断恢复 + 同步模型稳定化
Phase 4   watcher + async runner
Phase 5   retrieval 质量优化 + 正式产品 UI
```

当前已基本完成 `Phase 2`，下一阶段优先进入 `Phase 3`。

## 里程碑总览

### Milestone A：可恢复索引内核

目标：

- 让系统明确区分“最近看到的文件版本”和“已经成功索引的文件版本”
- 消除扫描后、索引前崩溃导致的错误跳过风险
- 为 watcher 和 async runner 打稳定地基

范围：

- `files` 状态机收紧
- `hash` 语义拆分或收口
- 启动恢复策略
- reconcile 幂等性和健康检查收紧
- `sync_jobs` 作为恢复线索的最小增强

关键文档：

- [P0 可恢复索引内核 RFC](p0-recoverable-index-kernel.md)

完成标准：

- 不再出现“文件已变化但因 hash 被提前覆盖而误判 unchanged”的窗口
- 进程异常退出后，下次 `scanVault()` 能发现并修复半完成状态
- `files.status = active` 只代表当前索引版本已经可用
- 旧 document/index 在失败时仍能作为回退版本参与检索

建议版本：

```text
v0.3.x
```

### Milestone B：同步模型稳定化

目标：

- 把 `sync_jobs` 从过程审计表推进成“可恢复的同步过程模型”
- 明确同一文件的串行化与失败重试语义

关键文档：

- [P1 同步过程模型 RFC](p1-sync-job-model.md)

范围：

- job 生命周期约束
- 单文件串行执行
- 启动后残留 `running` 的处理
- repair reconcile 的最小调度规则

完成标准：

- 同一路径文件不会并发进入重复 index
- 失败 job 有清晰状态和重跑入口
- 启动恢复不再依赖人工清库或手动删状态

建议版本：

```text
v0.4.x
```

### Milestone C：自动同步雏形

目标：

- 从“手动触发全量扫描”推进到“启动扫描 + watcher 增量收集 + reconcile”

范围：

- watcher 事件收集
- debounce / 合并策略
- delete + new 版 rename 处理
- 初始 scan 与自动 scan 的最小接线

关键文档：

- [P2 文件监听最小方案](p2-watcher-minimal.md)

完成标准：

- 文件新增、修改、删除能自动进入 reconcile
- 高频文件变动不会触发风暴式重复处理
- rename 即使先按 delete + new 处理，也不会破坏一致性

建议版本：

```text
v0.5.x
```

### Milestone D：后台同步 runner

目标：

- 将同步从“请求线程里做完整处理”推进到“提交任务 + 后台执行”

范围：

- job 入队与执行器
- 应用重启后的任务恢复
- 并发锁与同一 file 的串行化
- 最小的任务状态查询接口
- 前端同步状态展示

完成标准：

- API 不需要长时间阻塞等待 parse/index 完成
- 应用重启后任务状态一致
- 前端能看见同步中、失败、可重试

建议版本：

```text
v0.6.x
```

### Milestone E：结构化文档与检索质量

目标：

- 在 parser 和 normalized 格式稳定后，再做更强的结构表达和检索优化

范围：

- `document_blocks`
- heading / paragraph / code / table 等结构映射
- chunk 与原文结构对齐
- retrieval 评测样本
- rerank / hybrid search / answer 引用

完成标准：

- chunk 不再只是按纯文本切分，而能回溯到结构块
- retrieval quality 能被样本集评估，而不是凭感觉改 prompt
- answer 能稳定引用 evidence

建议版本：

```text
v0.7.x+
```

### Milestone F：产品化 UI 与桌面壳

目标：

- 把当前调试工作台推进成正式可用的产品界面

范围：

- 正式同步面板
- 错误恢复入口
- 索引状态与文件状态展示
- 设置页
- Electron 壳

完成标准：

- 不依赖开发者直接调 API 也能完成基本使用闭环
- 用户能理解当前索引状态、错误状态和重试路径

建议版本：

```text
v0.8.x+
```

## 推荐推进顺序

推荐按下面顺序推进：

```text
Milestone A
→ Milestone B
→ Milestone C
→ Milestone D
→ Milestone E
→ Milestone F
```

原因：

- `A/B` 解决的是一致性和恢复地基
- `C/D` 解决的是自动化和运行方式
- `E/F` 解决的是质量和产品体验

如果跳过 `A/B` 直接做 watcher 或 UI，会把当前状态语义问题扩散到更多模块。

## 当前明确不建议优先做

在 watcher 第一版完成前，不建议优先投入：

- Electron
- 复杂 UI 美化
- prompt 工程
- answer 质量调优
- rename/move 的复杂指纹识别
- `document_blocks`
- 完整自动 retry 调度器

这些方向都重要，但现在不是 ROI 最高的阶段。

## 近两阶段建议

### 现在就做

- 以 `Milestone A/B` 的最小实现作为当前稳定地基
- 进入 `Milestone C` 的 watcher 最小版
- 先让 Vault 文件变化能自动触发 reconcile

### 紧接着做

- 补轻量后台 runner 与同步状态接口
- 让前端能看到同步中、失败和最近同步结果
