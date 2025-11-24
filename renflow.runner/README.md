# Ren Flow Runner

OneBot-RenFlow 的独立工作流执行引擎，支持 OneBot 协议连接。

## 特性

- 🚀 独立运行，无需 Tauri 桌面应用
- 🔌 支持 OneBot 11 协议（WebSocket）
- 🔄 工作流自动化执行
- 📝 完整的日志系统
- 🛠️ TypeScript 开发，类型安全

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

## 使用示例

### 基础使用

```typescript
import { nodeManager, LogLevel } from 'renflow-runner'

// 使用默认的单例实例
const nodes = nodeManager.getNodeList()
console.log('可用节点:', nodes)
```

### 安装（优先使用 Yarn）

推荐使用 `yarn` 安装与运行（支持全局安装或作为项目依赖）。以下示例分别展示 `yarn` 与 `npm` 两种用法。

```bash
# 使用 Yarn 全局安装（可作为 CLI 使用，传统 yarn v1）
yarn global add renflow.runner

# 或在项目中作为依赖
yarn add renflow.runner

# 等价的 npm 命令（保留参考）
# npm install -g renflow.runner
# npm install --save renflow.runner
```

### CLI 使用（安装后）

安装后会提供 `renflow-runner` 可执行器，示例：

```bash
# 使用本地 JSON 工作流文件直接执行并退出
renflow-runner ./examples/my-workflow.json

# 运行一个工作集包（.renflow/.rfw/.zip），并在触发后持续运行
renflow-runner ./my-bots-package.renflow

# 使用环境变量开启调试日志
RENFLOW_LOG=debug renflow-runner ./my-bots-package.renflow
```

### 自定义日志级别

```typescript
import { createNodeManager, LogLevel } from 'renflow-runner'

// 创建自定义实例并设置日志级别
const manager = createNodeManager(LogLevel.DEBUG)

// 或者在运行时修改日志级别
nodeManager.setLogLevel(LogLevel.WARN)
```

### 日志级别说明

- `LogLevel.DEBUG` (0) - 输出所有日志，包括调试信息
- `LogLevel.INFO` (1) - 输出信息、警告和错误（默认级别）
- `LogLevel.WARN` (2) - 仅输出警告和错误
- `LogLevel.ERROR` (3) - 仅输出错误

## 开发

```bash
# 安装依赖
npm install

# 开发模式（带热重载）
npm run dev

# 构建
npm run build

# 运行构建后的代码
npm start
```

## 环境要求

- Node.js >= 18.0.0
- TypeScript

## 许可

MIT License - Copyright © Stapx Steve
