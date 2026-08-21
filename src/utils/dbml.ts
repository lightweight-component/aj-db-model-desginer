import type {
  SchemaCustomType,
  SchemaDiagram,
  SchemaEnum,
  SchemaField,
  SchemaRelation,
  SchemaTable,
} from "../types/schema";
import { customTypeDefinition, parseCustomTypeDefinition } from "./customTypes";
import { CURRENT_SCHEMA_VERSION } from "./schemaCompatibility";

/** Exports the supported schema subset as portable DBML text. */
export function exportDbml(diagram: SchemaDiagram): string {
  const enums: string[] = diagram.enums.map(
    (item: SchemaEnum) =>
      `Enum ${dbmlIdentifier(item.name)} {\n${item.values.map((value: string) => `  ${dbmlIdentifier(value)}`).join("\n")}\n}`,
  );
  const customTypes: string[] = diagram.customTypes.map(
    (item: SchemaCustomType) =>
      `// AJ_CUSTOM_TYPE ${item.name} = ${customTypeDefinition(item)}`,
  );
  const tables: string[] = diagram.tables.map((table: SchemaTable) => {
    const fields: string[] = table.fields.map((field: SchemaField) => {
      const attributes: string[] = [];
      if (field.primary) attributes.push("pk");
      if (field.unique) attributes.push("unique");
      if (!field.nullable) attributes.push("not null");
      if (field.autoIncrement) attributes.push("increment");
      if (field.unsigned) attributes.push("unsigned");
      if (field.checkExpression?.trim())
        attributes.push(`check: \`${field.checkExpression.trim()}\``);
      if (field.defaultValue)
        attributes.push(`default: \`${field.defaultValue}\``);
      if (field.comment)
        attributes.push(`note: '${escapeNote(field.comment)}'`);

      return `  ${dbmlIdentifier(field.name)} ${field.type}${attributes.length ? ` [${attributes.join(", ")}]` : ""}`;
    });
    const indexes: string[] = table.indexes.map(
      (index) =>
        `    (${index.fieldIds.map((id: string) => dbmlIdentifier(table.fields.find((field: SchemaField) => field.id === id)?.name ?? "unknown")).join(", ")}) [name: '${escapeNote(index.name)}'${index.unique ? ", unique" : ""}]`,
    );
    const indexBlock: string = indexes.length
      ? `\n  indexes {\n${indexes.join("\n")}\n  }`
      : "";

    return `Table ${dbmlIdentifier(table.name)} {\n${fields.join("\n")}${indexBlock}\n}`;
  });
  const relations: string[] = diagram.relations.map(
    (relation: SchemaRelation) => {
      const source: SchemaTable | undefined = diagram.tables.find(
        (table: SchemaTable) => table.id === relation.sourceTableId,
      );
      const target: SchemaTable | undefined = diagram.tables.find(
        (table: SchemaTable) => table.id === relation.targetTableId,
      );
      const sourceNames: string[] = relation.sourceFieldIds.map(
        (fieldId: string) =>
          dbmlIdentifier(
            source?.fields.find((field: SchemaField) => field.id === fieldId)
              ?.name ?? "unknown",
          ),
      );
      const targetNames: string[] = relation.targetFieldIds.map(
        (fieldId: string) =>
          dbmlIdentifier(
            target?.fields.find((field: SchemaField) => field.id === fieldId)
              ?.name ?? "unknown",
          ),
      );
      // In DBML, `orders.user_id > users.id` means many source rows reference one target row.
      const marker: string =
        relation.cardinality === "one-to-one"
          ? "-"
          : relation.cardinality === "many-to-one"
            ? ">"
            : "<";
      const sourceFields: string =
        sourceNames.length === 1
          ? sourceNames[0]
          : `(${sourceNames.join(", ")})`;
      const targetFields: string =
        targetNames.length === 1
          ? targetNames[0]
          : `(${targetNames.join(", ")})`;

      return `Ref: ${dbmlIdentifier(source?.name ?? "unknown")}.${sourceFields} ${marker} ${dbmlIdentifier(target?.name ?? "unknown")}.${targetFields}`;
    },
  );

  return [...enums, ...customTypes, ...tables, ...relations].join("\n\n");
}

/** Converts simple DBML Table and Ref declarations into an editor diagram. */
export function parseDbml(source: string): SchemaDiagram {
  const enums: SchemaEnum[] = [];
  const enumPattern: RegExp =
    /Enum\s+(`[^`]+`|[A-Za-z_][\w]*)\s*\{([\s\S]*?)\}/g;
  let enumMatch: RegExpExecArray | null;
  while ((enumMatch = enumPattern.exec(source))) {
    const values: string[] = enumMatch[2]
      .split("\n")
      .map((line: string) =>
        cleanDbmlIdentifier(line.trim().match(/^(`[^`]+`|\S+)/)?.[1] ?? ""),
      )
      .filter(Boolean);

    if (values.length > 0)
      enums.push({
        id: crypto.randomUUID(),
        name: cleanDbmlIdentifier(enumMatch[1]),
        values,
        comment: "",
      });
  }
  const customTypes: SchemaCustomType[] = [];
  const customTypePattern: RegExp =
    /^\s*\/\/\s*AJ_CUSTOM_TYPE\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/gim;
  let customTypeMatch: RegExpExecArray | null;
  while ((customTypeMatch = customTypePattern.exec(source)))
    customTypes.push(
      parseCustomTypeDefinition(
        crypto.randomUUID(),
        customTypeMatch[1],
        customTypeMatch[2],
      ),
    );
  const tables: SchemaTable[] = [];
  const fieldMap: Map<string, string> = new Map();
  // The closing brace of a table starts at column zero; this keeps nested indexes blocks intact.
  const tablePattern: RegExp =
    /Table\s+(`[^`]+`|[A-Za-z_][\w]*)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(source))) {
    const name: string = cleanDbmlIdentifier(match[1]);
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
      indexes: [],
      fields: [],
    };
    match[2].split("\n").forEach((line: string) => {
      const fieldMatch: RegExpMatchArray | null = line
        .trim()
        .match(/^(`[^`]+`|[A-Za-z_][\w]*)\s+([^\s[]+)(?:\s+\[([^\]]+)\])?/);

      if (!fieldMatch || fieldMatch[1] === "indexes") return;

      const attributes: string = fieldMatch[3] ?? "";
      const field: SchemaField = {
        id: crypto.randomUUID(),
        name: cleanDbmlIdentifier(fieldMatch[1]),
        type: fieldMatch[2],
        primary: /\bpk\b/i.test(attributes),
        unique: /\bunique\b/i.test(attributes),
        nullable: !/not null/i.test(attributes),
        autoIncrement: /\bincrement\b/i.test(attributes),
        unsigned: /\bunsigned\b/i.test(attributes),
        checkExpression:
          attributes.match(/check:\s*`([^`]+)`/i)?.[1]?.trim() ?? "",
        defaultValue:
          attributes.match(/default:\s*`?([^,\]`]+)`?/i)?.[1]?.trim() ?? "",
        comment: attributes.match(/note:\s*'([^']*)'/i)?.[1] ?? "",
      };
      table.fields.push(field);
      fieldMap.set(`${name}.${field.name}`, field.id);
    });

    const indexBlock: string =
      match[2].match(/indexes\s*\{([\s\S]*?)\}/i)?.[1] ?? "";
    const indexPattern: RegExp = /\(([^)]+)\)\s*\[([^\]]*)\]/gi;
    let indexMatch: RegExpExecArray | null;
    while ((indexMatch = indexPattern.exec(indexBlock))) {
      const fieldIds: string[] = indexMatch[1]
        .split(",")
        .map((fieldName: string) =>
          fieldMap.get(`${name}.${cleanDbmlIdentifier(fieldName.trim())}`),
        )
        .filter((fieldId: string | undefined): fieldId is string =>
          Boolean(fieldId),
        );

      if (fieldIds.length === 0) continue;

      const attributes: string = indexMatch[2];
      table.indexes.push({
        id: crypto.randomUUID(),
        name:
          attributes.match(/name:\s*'([^']+)'/i)?.[1] ??
          `index_${table.indexes.length + 1}`,
        fieldIds,
        unique: /\bunique\b/i.test(attributes),
      });
    }
    if (table.fields.length > 0) tables.push(table);
  }
  const relations: SchemaRelation[] = [];
  const refPattern: RegExp =
    /Ref:\s*(`[^`]+`|[A-Za-z_]\w*)\.(\([^)]+\)|`[^`]+`|[A-Za-z_]\w*)\s*([<>-])\s*(`[^`]+`|[A-Za-z_]\w*)\.(\([^)]+\)|`[^`]+`|[A-Za-z_]\w*)/g;
  while ((match = refPattern.exec(source))) {
    const sourceName: string = cleanDbmlIdentifier(match[1]);
    const targetName: string = cleanDbmlIdentifier(match[4]);
    const source: SchemaTable | undefined = tables.find(
      (table: SchemaTable) => table.name === sourceName,
    );
    const target: SchemaTable | undefined = tables.find(
      (table: SchemaTable) => table.name === targetName,
    );
    const sourceFieldIds: string[] = dbmlFieldList(match[2])
      .map((fieldName: string) => fieldMap.get(`${sourceName}.${fieldName}`))
      .filter((fieldId: string | undefined): fieldId is string =>
        Boolean(fieldId),
      );
    const targetFieldIds: string[] = dbmlFieldList(match[5])
      .map((fieldName: string) => fieldMap.get(`${targetName}.${fieldName}`))
      .filter((fieldId: string | undefined): fieldId is string =>
        Boolean(fieldId),
      );
    if (
      !source ||
      !target ||
      sourceFieldIds.length === 0 ||
      sourceFieldIds.length !== targetFieldIds.length
    )
      continue;
    relations.push({
      id: crypto.randomUUID(),
      sourceTableId: source.id,
      sourceFieldIds,
      targetTableId: target.id,
      targetFieldIds,
      cardinality:
        match[3] === "-"
          ? "one-to-one"
          : match[3] === ">"
            ? "many-to-one"
            : "one-to-many",
      constraintName: "",
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    });
  }
  if (tables.length === 0) throw new Error("No DBML Table blocks were found.");
  return {
    formatVersion: CURRENT_SCHEMA_VERSION,
    dialect: "mysql",
    enums,
    customTypes,
    notes: [],
    areas: [],
    tables,
    relations,
  };
}

/** Escapes a DBML single-quoted note. */
function escapeNote(value: string): string {
  return value.replaceAll("'", "\\'");
}
function dbmlIdentifier(value: string): string {
  return /^[A-Za-z_]\w*$/.test(value)
    ? value
    : `\`${value.replaceAll("`", "\\`")}\``;
}
function cleanDbmlIdentifier(value: string): string {
  return value.trim().replace(/^`|`$/g, "").replaceAll("\\`", "`");
}
function dbmlFieldList(value: string): string[] {
  const unwrapped: string = value.trim().replace(/^\(|\)$/g, "");
  return unwrapped
    .split(",")
    .map((field: string) => cleanDbmlIdentifier(field.trim()))
    .filter(Boolean);
}
