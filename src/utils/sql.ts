import type { DatabaseDialect, SchemaDiagram, SchemaField, SchemaRelation, SchemaTable } from "../types/schema";

/** Generates executable, readable CREATE TABLE and CREATE INDEX statements for the selected dialect. */
export function generateSql(diagram: SchemaDiagram): string {
  const typeStatements: string[] = [...diagram.enums.map((item) => enumStatement(item.name, item.values, diagram.dialect)), ...diagram.customTypes.map((item) => customTypeStatement(item.name, item.baseType, diagram.dialect))];
  const statements: string[] = diagram.tables.map((table: SchemaTable) => createTableStatement(table, diagram.relations, diagram.tables, diagram.dialect));
  const indexStatements: string[] = diagram.tables.flatMap((table: SchemaTable) => table.indexes.map((index) => {
    const fields: string[] = index.fieldIds.map((fieldId: string) => table.fields.find((field: SchemaField) => field.id === fieldId)?.name ?? "unknown");

    return `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quoteIdentifier(diagram.dialect, index.name)} ON ${quoteIdentifier(diagram.dialect, table.name)} (${fields.map((name: string) => quoteIdentifier(diagram.dialect, name)).join(", ")});`;
  }));

  return [...typeStatements, ...statements, ...indexStatements].filter((statement: string) => Boolean(statement)).join("\n\n");
}

/** Generates one CREATE TABLE statement, including primary keys and outbound foreign keys. */
function createTableStatement(table: SchemaTable, relations: SchemaRelation[], tables: SchemaTable[], dialect: DatabaseDialect): string {
  const primaryKeys: SchemaField[] = table.fields.filter((field: SchemaField) => field.primary);
  const lines: string[] = table.fields.map((field: SchemaField) => columnDefinition(field, dialect));

  if (primaryKeys.length > 0)
    lines.push(`PRIMARY KEY (${primaryKeys.map((field: SchemaField) => quoteIdentifier(dialect, field.name)).join(", ")})`);

  relations.filter((relation: SchemaRelation) => relation.sourceTableId === table.id).forEach((relation: SchemaRelation) => {
    const target: SchemaTable | undefined = tables.find((candidate: SchemaTable) => candidate.id === relation.targetTableId);

    if (!target)
      return;

    const sourceNames: string[] = relation.sourceFieldIds.map((fieldId: string) => table.fields.find((field: SchemaField) => field.id === fieldId)?.name).filter((name: string | undefined): name is string => Boolean(name));
    const targetNames: string[] = relation.targetFieldIds.map((fieldId: string) => target.fields.find((field: SchemaField) => field.id === fieldId)?.name).filter((name: string | undefined): name is string => Boolean(name));

    if (sourceNames.length !== relation.sourceFieldIds.length || targetNames.length !== relation.targetFieldIds.length)
      return;

    const constraintName: string = relation.constraintName.trim() || `fk_${table.name}_${relation.id.slice(0, 8)}`;
    lines.push(`CONSTRAINT ${quoteIdentifier(dialect, constraintName)} FOREIGN KEY (${sourceNames.map((name: string) => quoteIdentifier(dialect, name)).join(", ")}) REFERENCES ${quoteIdentifier(dialect, target.name)} (${targetNames.map((name: string) => quoteIdentifier(dialect, name)).join(", ")}) ON DELETE ${relation.onDelete} ON UPDATE ${relation.onUpdate}`);
  });

  return `CREATE TABLE ${quoteIdentifier(dialect, table.name)} (\n${lines.map((line: string) => `  ${line}`).join(",\n")}\n);`;
}

/** Creates a native PostgreSQL enum, or a portable documentation statement for other engines. */
function enumStatement(name: string, values: string[], dialect: DatabaseDialect): string {
  const literals: string = values.map((value: string) => `'${value.replaceAll("'", "''")}'`).join(", ");

  if (dialect === "postgresql")
    return `CREATE TYPE ${quoteIdentifier(dialect, name)} AS ENUM (${literals});`;

  return `-- Enum ${name}: ${literals}`;
}

/** Creates native domain/type syntax where the selected engine supports it. */
function customTypeStatement(name: string, baseType: string, dialect: DatabaseDialect): string {
  if (dialect === "postgresql")
    return `CREATE DOMAIN ${quoteIdentifier(dialect, name)} AS ${baseType};`;

  if (dialect === "sqlserver")
    return `CREATE TYPE ${quoteIdentifier(dialect, name)} FROM ${baseType};`;

  return `-- Custom type ${name}: ${baseType}`;
}

/** Renders one column and its column-level constraints. */
function columnDefinition(field: SchemaField, dialect: DatabaseDialect): string {
  const parts: string[] = [quoteIdentifier(dialect, field.name), field.type];

  if (!field.nullable || field.primary)
    parts.push("NOT NULL");

  if (field.unique && !field.primary)
    parts.push("UNIQUE");

  if (field.defaultValue)
    parts.push(`DEFAULT ${field.defaultValue}`);

  return parts.join(" ");
}

/** Quotes an identifier according to the selected SQL dialect. */
function quoteIdentifier(dialect: DatabaseDialect, identifier: string): string {
  if (dialect === "mysql")
    return `\`${identifier.replaceAll("`", "``")}\``;

  if (dialect === "sqlserver")
    return `[${identifier.split("]").join("]]")}]`;

  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}
