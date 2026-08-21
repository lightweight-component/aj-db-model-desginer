# AJ DB Model Designer

## Introduction

AJ DB Model Designer is an online database schema designer built on Vue 3 + TypeScript, providing visual database table structure design, relationship diagram drawing, SQL preview, and export functions. It features built-in SQL import capabilities, supports multiple database dialects, and helps developers quickly design and manage database schemas.

## Features

- **Visual Design**: Create and edit database table structures via drag-and-drop
- **Relationship Diagram**: Intuitively display relationships between tables (supports various cardinality types)
- **SQL Preview**: Real-time generation of CREATE TABLE SQL for different database dialects
- **SQL Import**: Quickly import table structures from existing SQL definitions
- **Multi-Dialect Support**: Generic, MySQL, MariaDB, PostgreSQL, SQL Server, Oracle, and SQLite.
- **Data Export**: Supports exporting relationship diagrams in SVG format
- **Local Drafts**: Automatically saves design progress to prevent data loss
- **Type Management**: Custom types and type alias support

## Technology Stack

- **Framework**: Vue 3 + TypeScript
- **Build Tool**: Vite
- **State Management**: Pinia
- **Styling**: Less
- **Code Quality**: Biome

## Installation and Running

### Environment Requirements

- Node.js 16+
- pnpm / npm

### Install Dependencies

```bash
pnpm install
```

### Start Development Server

```bash
pnpm dev
```

### Build Production Version

```bash
pnpm build
```

## Project Structure

```
src/
├── components/          # Vue Components
│   ├── SchemaArea.vue   # Main Design Area Container
│   ├── SchemaCanvas.vue # Canvas Rendering Component
│   ├── SchemaInspector.vue # Property Panel
│   ├── SchemaIssues.vue # Error/Warning Panel
│   ├── SchemaNavigator.vue # Thumbnail Navigator
│   ├── SchemaNote.vue   # Comment/Note Component
│   ├── SchemaTable.vue  # Data Table Component
│   ├── SqlPreview.vue   # SQL Preview Panel
│   └── TypeManager.vue  # Type Manager
├── stores/              # Pinia State Management
│   └── schema.ts        # Schema State & Logic
├── types/               # TypeScript Type Definitions
│   └── schema.ts        # Schema Related Types
├── utils/               # Utility Functions
│   ├── dbml.ts          # DBML Parsing & Generation
│   ├── dialects.ts      # Database Dialect Handling
│   ├── exchange.ts      # SVG Export Tool
│   ├── sql.ts           # SQL Generator
│   └── sqlImport.ts     # SQL Import Parser
├── styles/              # Style Files
│   └── base.less        # Base Styles
├── App.vue              # Application Root Component
└── main.ts              # Application Entry
```

## Core Concepts

### SchemaDiagram

The top-level data structure for the database schema, containing all table and relationship definitions.

### SchemaTable

Table structure, including table name, field list, remarks, and other information.

### SchemaField

Field definition, including field name, type, constraints (primary key, unique, not null, etc.), default value, and remarks.

### SchemaRelation

Table relationship definition, including source field, target field, relationship type, and cascade operation rules.

### DatabaseDialect

Supported database dialects:
- `mysql`
- `mariadb`
- `postgresql`
- `sqlite`
- `sqlserver`
- `oracle`
- `generic`

## Usage Instructions

### Create Table

1. Right-click on the blank canvas area and select "New Table"
2. Enter table name and field information
3. Set field types, constraints, and remarks

### Establish Relationship

1. Drag source table field to target table field
2. Select relationship type (One-to-One, One-to-Many, Many-to-One)
3. Configure cascade operations (ON DELETE / ON UPDATE)

### Preview SQL

Click the "SQL Preview" button on the toolbar or use the shortcut to view the SQL statements corresponding to the current schema. You can switch between different database dialects.

### Import SQL

Supports importing existing CREATE TABLE statements into a visual schema structure.

### Export Image

You can export the current design diagram as an SVG vector image for documentation writing and team collaboration.

## Script Commands

| Command | Description |
|------|------|
| `pnpm dev` | Start development server |
| `pnpm install` | Install dependencies |
| `pnpm build` | Build production version |
| `pnpm check` | Run Biome checks |
| `pnpm test` | Run unit tests |

## Browser Support

- Chrome (Latest)
- Firefox (Latest)
- Safari (Latest)
- Edge (Latest)

## License

This project is open source under the LGPL-2.1 License (as stated in the included `LICENSE` file).

## Contributing Guide

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/xxx`)
3. Commit changes (`git commit -am 'Add xxx'`)
4. Push to branch (`git push origin feature/xxx`)
5. Submit Pull Request

## Contact Information

- Project URL: https://gitee.com/lightweight-components/aj-db-model-designer
- Issue Feedback: https://gitee.com/lightweight-components/aj-db-model-designer/issues
