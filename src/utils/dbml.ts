import type { SchemaDiagram, SchemaField, SchemaRelation, SchemaTable } from "../types/schema";

/** Exports the supported schema subset as portable DBML text. */
export function exportDbml(diagram: SchemaDiagram): string {
  const tables: string[] = diagram.tables.map((table: SchemaTable) => {
    const fields: string[] = table.fields.map((field: SchemaField) => {
      const attributes: string[] = [];
      if (field.primary) attributes.push("pk");
      if (field.unique) attributes.push("unique");
      if (!field.nullable) attributes.push("not null");
      if (field.defaultValue) attributes.push(`default: \`${field.defaultValue}\``);
      if (field.comment) attributes.push(`note: '${escapeNote(field.comment)}'`);

      return `  ${field.name} ${field.type}${attributes.length ? ` [${attributes.join(", ")}]` : ""}`;
    });
    const indexes: string[] = table.indexes.map((index) => `    (${index.fieldIds.map((id: string) => table.fields.find((field: SchemaField) => field.id === id)?.name ?? "unknown").join(", ")})${index.unique ? " [unique]" : ""}`);
    const indexBlock: string = indexes.length ? `\n  indexes {\n${indexes.join("\n")}\n  }` : "";

    return `Table ${table.name} {\n${fields.join("\n")}${indexBlock}\n}`;
  });
  const relations: string[] = diagram.relations.flatMap((relation: SchemaRelation) => relation.sourceFieldIds.map((sourceId: string, index: number) => {
    const source: SchemaTable | undefined = diagram.tables.find((table: SchemaTable) => table.id === relation.sourceTableId);
    const target: SchemaTable | undefined = diagram.tables.find((table: SchemaTable) => table.id === relation.targetTableId);
    const sourceName: string = source?.fields.find((field: SchemaField) => field.id === sourceId)?.name ?? "unknown";
    const targetName: string = target?.fields.find((field: SchemaField) => field.id === relation.targetFieldIds[index])?.name ?? "unknown";
    // In DBML, `orders.user_id > users.id` means many source rows reference one target row.
    const marker: string = relation.cardinality === "one-to-one" ? "-" : relation.cardinality === "many-to-one" ? ">" : "<";

    return `Ref: ${source?.name}.${sourceName} ${marker} ${target?.name}.${targetName}`;
  }));

  return [...tables, ...relations].join("\n\n");
}

/** Converts simple DBML Table and Ref declarations into an editor diagram. */
export function parseDbml(source: string): SchemaDiagram {
  const tables: SchemaTable[] = [];
  const fieldMap: Map<string, string> = new Map();
  // The closing brace of a table starts at column zero; this keeps nested indexes blocks intact.
  const tablePattern: RegExp = /Table\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(source))) {
    const name: string = match[1];
    const table: SchemaTable = { id: crypto.randomUUID(), name, x: 120 + tables.length % 3 * 360, y: 120 + Math.floor(tables.length / 3) * 260, width: 260, color: "#5f6ee8", comment: "", collapsed: false, locked: false, indexes: [], fields: [] };
    match[2].split("\n").forEach((line: string) => {
      const fieldMatch: RegExpMatchArray | null = line.trim().match(/^([A-Za-z_][\w]*)\s+([^\s[]+)(?:\s+\[([^\]]+)\])?/);

      if (!fieldMatch || fieldMatch[1] === "indexes")
        return;

      const attributes: string = fieldMatch[3] ?? "";
      const field: SchemaField = { id: crypto.randomUUID(), name: fieldMatch[1], type: fieldMatch[2], primary: /\bpk\b/i.test(attributes), unique: /\bunique\b/i.test(attributes), nullable: !/not null/i.test(attributes), defaultValue: attributes.match(/default:\s*`?([^,\]`]+)`?/i)?.[1]?.trim() ?? "", comment: attributes.match(/note:\s*'([^']*)'/i)?.[1] ?? "" };
      table.fields.push(field);
      fieldMap.set(`${name}.${field.name}`, field.id);
    });

    const indexPattern: RegExp = /\(([^)]+)\)\s*(\[\s*unique\s*\])?/gi;
    let indexMatch: RegExpExecArray | null;
    while ((indexMatch = indexPattern.exec(match[2]))) {
      const fieldIds: string[] = indexMatch[1].split(",").map((fieldName: string) => fieldMap.get(`${name}.${fieldName.trim()}`)).filter((fieldId: string | undefined): fieldId is string => Boolean(fieldId));

      if (fieldIds.length === 0)
        continue;

      table.indexes.push({ id: crypto.randomUUID(), name: `index_${table.indexes.length + 1}`, fieldIds, unique: Boolean(indexMatch[2]) });
    }
    if (table.fields.length > 0) tables.push(table);
  }
  const relations: SchemaRelation[] = [];
  const refPattern: RegExp = /Ref:\s*([A-Za-z_]\w*\.[A-Za-z_]\w*)\s*([<>-])\s*([A-Za-z_]\w*\.[A-Za-z_]\w*)/g;
  while ((match = refPattern.exec(source))) {
    const left: string[] = match[1].split(".");
    const right: string[] = match[3].split(".");
    const source: SchemaTable | undefined = tables.find((table: SchemaTable) => table.name === left[0]);
    const target: SchemaTable | undefined = tables.find((table: SchemaTable) => table.name === right[0]);
    const sourceFieldId: string | undefined = fieldMap.get(match[1]);
    const targetFieldId: string | undefined = fieldMap.get(match[3]);
    if (!source || !target || !sourceFieldId || !targetFieldId) continue;
    relations.push({ id: crypto.randomUUID(), sourceTableId: source.id, sourceFieldIds: [sourceFieldId], targetTableId: target.id, targetFieldIds: [targetFieldId], cardinality: match[2] === "-" ? "one-to-one" : match[2] === ">" ? "many-to-one" : "one-to-many", constraintName: "", onDelete: "NO ACTION", onUpdate: "NO ACTION" });
  }
  if (tables.length === 0) throw new Error("No DBML Table blocks were found.");
  return { dialect: "mysql", enums: [], customTypes: [], notes: [], areas: [], tables, relations };
}

/** Escapes a DBML single-quoted note. */
function escapeNote(value: string): string { return value.replaceAll("'", "\\'"); }
