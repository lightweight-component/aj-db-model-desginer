

# AJ DB Model Designer

## 简介

AJ DB Model Designer 是一个基于 Vue 3 + TypeScript 构建的在线数据库 schema 设计器，提供可视化的数据库表结构设计、关系图绘制、SQL 预览与导出功能。内置 SQL 导入能力，支持多种数据库方言，帮助开发者快速设计和管理数据库 schema。

## 功能特性

- **可视化设计**：通过拖拽方式创建和编辑数据库表结构
- **关系图绘制**：直观展示表间关联关系（支持多种基数类型）
- **SQL 预览**：实时生成各数据库方言的建表 SQL
- **SQL 导入**：支持从现有 SQL 定义快速导入表结构
- **多方言支持**：MySQL、PostgreSQL、SQLite、SQL Server 等
- **数据导出**：支持 SVG 格式的关系图导出
- **本地草稿**：自动保存设计进度，防止数据丢失
- **类型管理**：自定义类型和类型别名支持

## 技术栈

- **框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **状态管理**：Pinia
- **样式**：Less
- **代码质量**：Biome

## 安装与运行

### 环境要求

- Node.js 16+
- pnpm / npm

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

### 构建生产版本

```bash
pnpm build
```

## 项目结构

```
src/
├── components/          # Vue 组件
│   ├── SchemaArea.vue   # 主设计区域容器
│   ├── SchemaCanvas.vue # 画布渲染组件
│   ├── SchemaInspector.vue # 属性面板
│   ├── SchemaIssues.vue # 错误/警告面板
│   ├── SchemaNavigator.vue # 缩略图导航
│   ├── SchemaNote.vue   # 注释/便签组件
│   ├── SchemaTable.vue  # 数据表组件
│   ├── SqlPreview.vue   # SQL 预览面板
│   └── TypeManager.vue  # 类型管理器
├── stores/              # Pinia 状态管理
│   └── schema.ts        # Schema 状态与逻辑
├── types/               # TypeScript 类型定义
│   └── schema.ts        # Schema 相关类型
├── utils/               # 工具函数
│   ├── dbml.ts          # DBML 解析与生成
│   ├── dialects.ts      # 数据库方言处理
│   ├── exchange.ts      # SVG 导出工具
│   ├── sql.ts           # SQL 生成器
│   └── sqlImport.ts     # SQL 导入解析器
├── styles/              # 样式文件
│   └── base.less        # 基础样式
├── App.vue              # 应用根组件
└── main.ts              # 应用入口
```

## 核心概念

### SchemaDiagram

数据库 schema 的顶层数据结构，包含所有表和关系定义。

### SchemaTable

数据表结构，包含表名、字段列表、备注等信息。

### SchemaField

字段定义，包含字段名、类型、约束（主键、唯一、非空等）、默认值和备注。

### SchemaRelation

表间关系定义，包含源字段、目标字段、关系类型和级联操作规则。

### DatabaseDialect

支持的数据库方言：
- `mysql`
- `postgresql`
- `sqlite`
- `mssql`

## 使用说明

### 创建表

1. 在画布空白处右键选择"新建表"
2. 输入表名和字段信息
3. 设置字段类型、约束和备注

### 建立关系

1. 拖拽源表字段到目标表字段
2. 选择关系类型（一对一、一对多、多对多）
3. 配置级联操作（ON DELETE / ON UPDATE）

### 预览 SQL

点击工具栏"SQL 预览"按钮或使用快捷键，即可查看当前 schema 对应的 SQL 语句，支持切换不同数据库方言。

### 导入 SQL

支持将已有的 CREATE TABLE 语句导入为可视化的 schema 结构。

### 导出图片

可将当前设计图导出为 SVG 矢量图片，便于文档编写和团队协作。

## 脚本命令

| 命令 | 描述 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm preview` | 预览生产构建 |
| `pnpm lint` | 代码检查 |
| `pnpm test` | 运行单元测试 |

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)

## 许可证

本项目采用 MIT License 开源授权。

## 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -am 'Add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 联系方式

- 项目地址：https://gitee.com/lightweight-components/aj-db-model-desginer
- 问题反馈：https://gitee.com/lightweight-components/aj-db-model-desginer/issues