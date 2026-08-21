import type {
  DatabaseDialect,
  SchemaDiagram,
  SchemaField,
  SchemaIndex,
  SchemaRelation,
  SchemaTable,
} from "../types/schema";
import { CURRENT_SCHEMA_VERSION } from "./schemaCompatibility";

interface PendingRelation {
  source: string;
  sourceFields: string[];
  target: string;
  targetFields: string[];
  name: string;
  onDelete: SchemaRelation["onDelete"];
  onUpdate: SchemaRelation["onUpdate"];
  line: number;
}

/** Imports common Generic, MySQL, MariaDB, PostgreSQL, SQL Server, SQLite, and Oracle schema DDL. */
export function parseSqlDdl(
  source: string,
  dialect: DatabaseDialect,
): SchemaDiagram {
  const tables: SchemaTable[] = [];
  const pendingRelations: PendingRelation[] = [];
  const headerPattern: RegExp =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\.)?(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+))\s*\(/gi;
  let header: RegExpExecArray | null;
  while ((header = headerPattern.exec(source))) {
    const openIndex: number = headerPattern.lastIndex - 1;
    const closeIndex: number = matchingParenthesis(source, openIndex);

    if (closeIndex < 0)
      throw new Error(
        `Line ${lineNumber(source, openIndex)}: CREATE TABLE has no closing parenthesis.`,
      );

    const name: string = cleanIdentifier(header[1]);

    if (
      tables.some(
        (table: SchemaTable) => table.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error(
        `Line ${lineNumber(source, header.index)}: duplicate table ${name}.`,
      );

    const table: SchemaTable = {
      id: crypto.randomUUID(),
      name,
      x: 120 + (tables.length % 3) * 360,
      y: 120 + Math.floor(tables.length / 3) * 260,
      width: 260,
      color: "#5f6ee8",
      comment: "",
      collapsed: false,
      locked: false,
      fields: [],
      indexes: [],
    };
    const primaryNames: string[] = [];
    const definitions: string[] = splitDefinitions(
      source.slice(openIndex + 1, closeIndex),
    );
    definitions.forEach((definition: string, definitionIndex: number) => {
      const line: number = lineNumber(
        source,
        openIndex +
          1 +
          source.slice(openIndex + 1, closeIndex).indexOf(definition),
      );
      const primary: RegExpMatchArray | null = definition.match(
        /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i,
      );
      const unique: RegExpMatchArray | null = definition.match(
        /^(?:CONSTRAINT\s+([^\s]+)\s+)?UNIQUE(?:\s+(?:KEY|INDEX)\s+([^\s(]+))?\s*\(([^)]+)\)/i,
      );
      const foreign: RegExpMatchArray | null = definition.match(
        /^(?:CONSTRAINT\s+([^\s]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)(.*)$/i,
      );

      if (primary) {
        primaryNames.push(...identifierList(primary[1]));
        return;
      }

      if (unique) {
        const names: string[] = identifierList(unique[3]);
        table.indexes.push({
          id: crypto.randomUUID(),
          name: cleanIdentifier(
            unique[1] ?? unique[2] ?? `uq_${table.name}_${definitionIndex + 1}`,
          ),
          fieldIds: names,
          unique: true,
        });
        return;
      }

      if (foreign) {
        pendingRelations.push(relationInput(name, foreign, line));
        return;
      }

      const field: SchemaField | null = parseColumn(definition);

      if (!field)
        throw new Error(
          `Line ${line}: unsupported table definition "${definition.slice(0, 60)}".`,
        );

      table.fields.push(field);
      const inlineReference: RegExpMatchArray | null = definition.match(
        /REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)(.*)$/i,
      );

      if (inlineReference)
        pendingRelations.push({
          source: name,
          sourceFields: [field.name],
          target: cleanIdentifier(inlineReference[1]),
          targetFields: identifierList(inlineReference[2]),
          name: "",
          onDelete: actionFrom(inlineReference[3], "DELETE"),
          onUpdate: actionFrom(inlineReference[3], "UPDATE"),
          line,
        });
    });

    if (table.fields.length === 0)
      throw new Error(
        `Line ${lineNumber(source, header.index)}: table ${name} contains no fields.`,
      );

    primaryNames.forEach((fieldName: string) => {
      const field: SchemaField | undefined = findField(table, fieldName);
      if (!field)
        throw new Error(
          `Table ${name}: primary key field ${fieldName} does not exist.`,
        );
      field.primary = true;
      field.nullable = false;
    });
    table.indexes = table.indexes
      .map((index: SchemaIndex) => ({
        ...index,
        fieldIds: index.fieldIds
          .map((fieldName: string) => findField(table, fieldName)?.id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      }))
      .filter((index: SchemaIndex) => index.fieldIds.length > 0);
    tables.push(table);
    headerPattern.lastIndex = closeIndex + 1;
  }

  parseCreateIndexes(source, tables);
  parseAlterRelations(source, pendingRelations);

  if (tables.length === 0)
    throw new Error("Line 1: no CREATE TABLE statements were found.");

  const relations: SchemaRelation[] = pendingRelations.map(
    (item: PendingRelation) => resolveRelation(item, tables),
  );

  return {
    formatVersion: CURRENT_SCHEMA_VERSION,
    dialect,
    enums: [],
    customTypes: [],
    notes: [],
    areas: [],
    tables,
    relations,
  };
}

/** Parses a column declaration and its common inline constraints. */
function parseColumn(definition: string): SchemaField | null {
  const match: RegExpMatchArray | null = definition.match(
    /^((?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+))\s+([\s\S]+)$/,
  );

  if (!match) return null;

  const rest: string = match[2].trim();
  const constraintMatch: RegExpMatchArray | null = rest.match(
    /\s+(?=(?:CONSTRAINT\s+\S+\s+)?(?:NOT\s+NULL|NULL\b|DEFAULT\b|PRIMARY\s+KEY|UNIQUE\b|REFERENCES\b|CHECK\b|COLLATE\b|UNSIGNED\b|AUTO_INCREMENT\b|AUTOINCREMENT\b|IDENTITY\b|GENERATED\b))/i,
  );
  const type: string = constraintMatch
    ? rest.slice(0, constraintMatch.index).trim()
    : rest;
  const tail: string = constraintMatch
    ? rest.slice(constraintMatch.index).trim()
    : "";

  if (!type) return null;

  return {
    id: crypto.randomUUID(),
    name: cleanIdentifier(match[1]),
    type,
    primary: /\bPRIMARY\s+KEY\b/i.test(tail),
    nullable: !/\bNOT\s+NULL\b|\bPRIMARY\s+KEY\b/i.test(tail),
    unique: /\bUNIQUE\b/i.test(tail),
    autoIncrement:
      /\bAUTO_INCREMENT\b|\bAUTOINCREMENT\b|\bIDENTITY\s*\(|\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i.test(
        tail,
      ),
    unsigned: /\bUNSIGNED\b/i.test(tail),
    checkExpression: tail.match(/\bCHECK\s*\(([^)]+)\)/i)?.[1]?.trim() ?? "",
    defaultValue:
      tail
        .match(
          /\bDEFAULT\s+(.+?)(?=\s+(?:CONSTRAINT|NOT|NULL|UNIQUE|PRIMARY|REFERENCES|CHECK|COLLATE|UNSIGNED|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|GENERATED)\b|$)/i,
        )?.[1]
        ?.trim() ?? "",
    comment: "",
  };
}

/** Imports standalone CREATE INDEX declarations after tables are known. */
function parseCreateIndexes(source: string, tables: SchemaTable[]): void {
  const pattern: RegExp =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\s+ON\s+((?:(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\.)?(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+))\s*\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const tableName: string = cleanIdentifier(match[3]);
    const table: SchemaTable | undefined = tables.find(
      (item: SchemaTable) =>
        item.name.toLowerCase() === tableName.toLowerCase(),
    );

    if (!table)
      throw new Error(
        `Line ${lineNumber(source, match.index)}: index references missing table ${tableName}.`,
      );

    const fieldIds: string[] = identifierList(match[4])
      .map((name: string) => findField(table, name)?.id)
      .filter((id: string | undefined): id is string => Boolean(id));

    if (fieldIds.length !== identifierList(match[4]).length)
      throw new Error(
        `Line ${lineNumber(source, match.index)}: index ${cleanIdentifier(match[2])} references a missing field.`,
      );

    table.indexes.push({
      id: crypto.randomUUID(),
      name: cleanIdentifier(match[2]),
      fieldIds,
      unique: Boolean(match[1]),
    });
  }
}

/** Imports ALTER TABLE foreign keys used by generated migration scripts. */
function parseAlterRelations(source: string, pending: PendingRelation[]): void {
  const pattern: RegExp =
    /ALTER\s+TABLE\s+((?:(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\.)?(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+))\s+ADD\s+(?:CONSTRAINT\s+(\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+((?:(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+)\.)?(?:\[[^\]]+\]|`[^`]+`|"[^"]+"|[\w$]+))\s*\(([^)]+)\)([^;]*);?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)))
    pending.push({
      source: cleanIdentifier(match[1]),
      sourceFields: identifierList(match[3]),
      target: cleanIdentifier(match[4]),
      targetFields: identifierList(match[5]),
      name: cleanIdentifier(match[2] ?? ""),
      onDelete: actionFrom(match[6], "DELETE"),
      onUpdate: actionFrom(match[6], "UPDATE"),
      line: lineNumber(source, match.index),
    });
}

function relationInput(
  source: string,
  match: RegExpMatchArray,
  line: number,
): PendingRelation {
  return {
    source,
    sourceFields: identifierList(match[2]),
    target: cleanIdentifier(match[3]),
    targetFields: identifierList(match[4]),
    name: cleanIdentifier(match[1] ?? ""),
    onDelete: actionFrom(match[5], "DELETE"),
    onUpdate: actionFrom(match[5], "UPDATE"),
    line,
  };
}
function resolveRelation(
  item: PendingRelation,
  tables: SchemaTable[],
): SchemaRelation {
  const source: SchemaTable | undefined = tables.find(
    (table: SchemaTable) =>
      table.name.toLowerCase() === item.source.toLowerCase(),
  );
  const target: SchemaTable | undefined = tables.find(
    (table: SchemaTable) =>
      table.name.toLowerCase() === item.target.toLowerCase(),
  );
  if (!source || !target)
    throw new Error(
      `Line ${item.line}: foreign key references a missing table.`,
    );
  const sourceIds: string[] = item.sourceFields
    .map((name: string) => findField(source, name)?.id)
    .filter((id: string | undefined): id is string => Boolean(id));
  const targetIds: string[] = item.targetFields
    .map((name: string) => findField(target, name)?.id)
    .filter((id: string | undefined): id is string => Boolean(id));
  if (
    sourceIds.length !== item.sourceFields.length ||
    targetIds.length !== item.targetFields.length ||
    sourceIds.length !== targetIds.length
  )
    throw new Error(
      `Line ${item.line}: foreign key references missing or mismatched fields.`,
    );
  return {
    id: crypto.randomUUID(),
    sourceTableId: source.id,
    sourceFieldIds: sourceIds,
    targetTableId: target.id,
    targetFieldIds: targetIds,
    cardinality: "many-to-one",
    constraintName: item.name,
    onDelete: item.onDelete,
    onUpdate: item.onUpdate,
  };
}
function splitDefinitions(value: string): string[] {
  const parts: string[] = [];
  let depth: number = 0;
  let start: number = 0;
  let quote: string = "";
  for (let index: number = 0; index < value.length; index += 1) {
    const character: string = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}
function matchingParenthesis(source: string, openIndex: number): number {
  let depth: number = 0;
  let quote: string = "";
  for (let index: number = openIndex; index < source.length; index += 1) {
    const character: string = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function cleanIdentifier(value: string): string {
  const parts: string[] = value
    .trim()
    .split(".")
    .map((part: string) => part.replace(/^(?:\[|`|")|(?:\]|`|")$/g, ""));
  return parts.pop() ?? "";
}
function identifierList(value: string): string[] {
  return value
    .split(",")
    .map((entry: string) => cleanIdentifier(entry.trim()))
    .filter(Boolean);
}
function findField(table: SchemaTable, name: string): SchemaField | undefined {
  return table.fields.find(
    (field: SchemaField) => field.name.toLowerCase() === name.toLowerCase(),
  );
}
function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}
function actionFrom(value: string, action: string): SchemaRelation["onDelete"] {
  const match: RegExpMatchArray | null = value.match(
    new RegExp(
      `ON\\s+${action}\\s+(NO\\s+ACTION|RESTRICT|CASCADE|SET\\s+NULL|SET\\s+DEFAULT)`,
      "i",
    ),
  );
  return (match?.[1]?.replace(/\s+/g, " ").toUpperCase() ??
    "NO ACTION") as SchemaRelation["onDelete"];
}
