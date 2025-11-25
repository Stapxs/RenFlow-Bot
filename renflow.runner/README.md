# Renflow Runner

Renflow Bot 的独立工作流执行引擎。

## 项目结构

```
renflow.runner/
├── src/
│   ├── index.ts          # 主入口
│   ├── onebot/           # OneBot 协议实现
│   ├── workflow/         # 工作流引擎
│   ├── types/            # TypeScript 类型定义
│   └── utils/            # 工具函数
├── dist/                 # 构建输出
├── package.json
└── tsconfig.json
```

## CLI 功能

通过命令行接口（CLI）执行工作流定义文件。
~~~bash
npx renflow-runner <file_path>
~~~

其中，文件可以传递以下两种格式：
- `.json`：工作流的 JSON 定义文件。传递 JSON 文件将直接加载并执行其中定义的工作流。此功能通常只能用来检查单个工作流是否有效。
- `.rfw/.zip`：Renflow Bot 工作流包文件。由 Renflow Bot Editor 导出，包含工作集定义和机器人连接配置的配置包。传递工作流包文件将加载整个工作集并连接到相应的机器人平台以执行工作流。
