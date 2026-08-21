import type { DatabaseDialect } from "../types/schema";

export interface DialectDefinition {
  id: DatabaseDialect;
  label: string;
  types: string[];
}

/** Type catalogues used for field suggestions and schema validation. */
export const DIALECTS: Record<DatabaseDialect, DialectDefinition> = {
  generic: { id: "generic", label: "Generic", types: ["SMALLINT", "INTEGER", "BIGINT", "DECIMAL(10,2)", "REAL", "DOUBLE", "BOOLEAN", "VARCHAR(255)", "TEXT", "DATE", "TIME", "TIMESTAMP", "BINARY", "BLOB", "UUID"] },
  mysql: { id: "mysql", label: "MySQL", types: ["TINYINT", "SMALLINT", "INT", "BIGINT", "DECIMAL(10,2)", "FLOAT", "DOUBLE", "BOOLEAN", "VARCHAR(255)", "TEXT", "DATE", "DATETIME", "TIMESTAMP", "JSON", "BLOB", "UUID"] },
  mariadb: { id: "mariadb", label: "MariaDB", types: ["TINYINT", "SMALLINT", "INT", "BIGINT", "DECIMAL(10,2)", "FLOAT", "DOUBLE", "BOOLEAN", "VARCHAR(255)", "TEXT", "DATE", "DATETIME", "TIMESTAMP", "JSON", "BLOB", "UUID"] },
  postgresql: { id: "postgresql", label: "PostgreSQL", types: ["SMALLINT", "INTEGER", "BIGINT", "NUMERIC(10,2)", "REAL", "DOUBLE PRECISION", "BOOLEAN", "VARCHAR(255)", "TEXT", "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "JSON", "JSONB", "BYTEA", "UUID"] },
  sqlserver: { id: "sqlserver", label: "SQL Server", types: ["TINYINT", "SMALLINT", "INT", "BIGINT", "DECIMAL(10,2)", "FLOAT", "BIT", "VARCHAR(255)", "NVARCHAR(255)", "TEXT", "DATE", "DATETIME2", "DATETIMEOFFSET", "UNIQUEIDENTIFIER", "VARBINARY(MAX)"] },
  sqlite: { id: "sqlite", label: "SQLite", types: ["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC", "BOOLEAN", "DATE", "DATETIME", "JSON"] },
  oracle: { id: "oracle", label: "Oracle", types: ["NUMBER", "NUMBER(10,2)", "BINARY_FLOAT", "BINARY_DOUBLE", "VARCHAR2(255)", "NVARCHAR2(255)", "CLOB", "NCLOB", "DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "RAW(16)", "BLOB", "XMLTYPE"] },
};

const TYPE_ALIASES: Partial<Record<DatabaseDialect, Record<string, string>>> = {
  mysql: {
    INTEGER: "INT",
  },
  mariadb: {
    INTEGER: "INT",
  },
};

/** Removes parameter lists and whitespace noise before catalogue matching. */
export function typeBase(type: string): string {
  return type.trim().toUpperCase().replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ");
}

/**
 * Resolves a database-specific type alias to its catalogue type.
 *
 * @param dialect active database engine
 * @param type normalized field type
 * @returns canonical type used by the dialect catalogue
 */
function canonicalType(dialect: DatabaseDialect, type: string): string {
  return TYPE_ALIASES[dialect]?.[type] ?? type;
}

/** Tells whether a concrete type is available in the selected database engine. */
export function isTypeSupported(dialect: DatabaseDialect, type: string): boolean {
  const base: string = canonicalType(dialect, typeBase(type));

  return DIALECTS[dialect].types.some((candidate: string) => canonicalType(dialect, typeBase(candidate)) === base);
}

/** Lists suggested types without preventing an advanced user from entering a custom type. */
export function typesForDialect(dialect: DatabaseDialect): string[] {
  return DIALECTS[dialect].types;
}
