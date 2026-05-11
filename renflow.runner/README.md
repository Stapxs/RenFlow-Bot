# Renflow Runner
Renflow Bot 的独立工作流执行引擎。此引擎以模块化分离的方式提供了 Renflow Bot 以下相关功能的集成：
- 工作流引擎：执行和管理工作流定义
- 机器人连接器：支持多种机器人平台的连接和通信
- 工作流节点：实现各种常用的工作流节点功能

## 项目结构

```
renflow.runner/
├── src/
│   ├── connectors/             # 机器人连接器实现
│   ├── nodes/                  # 工作流节点实现
│   ├── workflow/               # 工作流引擎
│   ├── utils/
│   └── index.ts                # 主入口
├── dist/                       # 构建输出
├── bin/renflow-runner.js       # CLI 入口
├── package.json
└── tsconfig.json
```

## CLI 功能
通过命令行接口（CLI）执行工作流定义文件/工作集包。

~~~bash
npx renflow-runner <file_path>
~~~

其中，文件可以传递以下两种格式：
- `.json`：工作流的 JSON 定义文件。传递 JSON 文件将直接加载并执行其中定义的工作流。此功能通常只能用来检查单个工作流是否有效。
- `.rfw/.zip`：Renflow Bot 工作流包文件。由 Renflow Bot Editor 导出，包含工作集定义和机器人连接配置的配置包。传递工作流包文件将加载整个工作集并连接到相应的机器人平台以执行工作流。

## 作为模块使用
Renflow Runner 也可以作为一个模块被其他 TypeScript/JavaScript 项目引用，以便在自定义应用中集成工作流执行功能。

完整 Type Doc 请查阅 [Renflow Runner API 文档](https://stapxs.github.io/OneBot-RenFlow/Runner-API/README.md)


### 工作流引擎
~~~typescript
import { runWorkflow } from 'renflow-runner';

const engine = new WorkflowEngine();
const workflowJson = fs.readFileSync('path/to/workflow.json', 'utf-8');
const executionData = JSON.parse(workflowJson);
await engine.execute(executionData, {}, { timeout: 60000 });
~~~

### 机器人连接器
~~~typescript
const adapter = await connectorManager.createBotAdapter('napcat', {
   url: 'ws://localhost:3001',
   token: '超级安全的令牌'
}, 'napcat-bot-1');

adapter.on(['message', 'message_mine'], (p: RenMessage) => {
   console.log('收到消息:', p);
})
adapter.on('connected', () => {
   console.log('适配器已连接');
});
adapter.on('disconnected', () => {
   console.log('适配器已断开连接');
})
adapter.on('error', (err: any) => {
   console.log('适配器发生错误:', err);
})

try {
   await adapter.connect()
} catch (e: any) {
   console.log('连接适配器时出错:', e.message);
}
~~~
