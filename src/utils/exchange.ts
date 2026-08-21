import type {
  SchemaDiagram,
  SchemaField,
  SchemaRelation,
  SchemaTable,
} from "../types/schema";

/** Exports the logical schema as Mermaid ER diagram source. */
export function exportMermaid(diagram: SchemaDiagram): string {
  const tables: string[] = diagram.tables.map((table: SchemaTable) => {
    const fields: string[] = table.fields.map(
      (field: SchemaField) =>
        `    ${field.type} ${field.name}${field.primary ? " PK" : ""}${field.unique ? " UK" : ""}`,
    );

    return `  ${safeName(table.name)} {\n${fields.join("\n")}\n  }`;
  });
  const relations: string[] = diagram.relations.map(
    (relation: SchemaRelation) => {
      const source: SchemaTable | undefined = diagram.tables.find(
        (table: SchemaTable) => table.id === relation.sourceTableId,
      );
      const target: SchemaTable | undefined = diagram.tables.find(
        (table: SchemaTable) => table.id === relation.targetTableId,
      );

      if (!source || !target) return "";

      const marker: string =
        relation.cardinality === "many-to-one"
          ? "}o--||"
          : relation.cardinality === "one-to-many"
            ? "||--o{"
            : "||--||";

      return `  ${safeName(source.name)} ${marker} ${safeName(target.name)} : references`;
    },
  );

  return ["erDiagram", ...tables, ...relations.filter(Boolean)].join("\n");
}

/**
 * Builds a readable Markdown document from the current logical schema.
 *
 * @param diagram diagram to document
 * @returns Markdown document content
 */
export function exportMarkdown(diagram: SchemaDiagram): string {
  const title: string = diagram.name?.trim() || "Database schema";
  const tableSections: string[] = diagram.tables.map((table: SchemaTable) =>
    markdownTable(table),
  );
  const relationLines: string[] = diagram.relations
    .map((relation: SchemaRelation) =>
      markdownRelation(relation, diagram.tables),
    )
    .filter((value: string): boolean => Boolean(value));
  const enumSections: string[] = diagram.enums.map(
    (schemaEnum) =>
      `- **${escapeMarkdown(schemaEnum.name)}**: ${schemaEnum.values.map((value: string) => `\`${escapeCode(value)}\``).join(", ") || "_No values_"}${schemaEnum.comment ? ` — ${escapeMarkdown(schemaEnum.comment)}` : ""}`,
  );
  const customTypeSections: string[] = diagram.customTypes.map((customType) => {
    const details: string[] = [customType.baseType];

    if (customType.length !== null) details.push(`length ${customType.length}`);

    if (customType.precision !== null)
      details.push(
        `precision ${customType.precision}${customType.scale !== null ? `, scale ${customType.scale}` : ""}`,
      );

    return `- **${escapeMarkdown(customType.name)}**: ${details.join(", ")}${customType.comment ? ` — ${escapeMarkdown(customType.comment)}` : ""}`;
  });
  const sections: string[] = [
    `# ${escapeMarkdown(title)}`,
    `Dialect: **${escapeMarkdown(diagram.dialect)}**  \nTables: **${diagram.tables.length}** · Relationships: **${diagram.relations.length}**`,
    "## Tables",
    tableSections.join("\n\n") || "_No tables defined._",
    "## Relationships",
    relationLines.map((line: string) => `- ${line}`).join("\n") ||
      "_No relationships defined._",
  ];

  if (enumSections.length) sections.push("## Enums", enumSections.join("\n"));

  if (customTypeSections.length)
    sections.push("## Custom types", customTypeSections.join("\n"));

  return `${sections.join("\n\n")}\n`;
}

/** Builds a standalone SVG snapshot of tables, relationships, notes and areas. */
export function exportSvg(diagram: SchemaDiagram): string {
  const width: number =
    Math.max(
      900,
      ...diagram.tables.map((table: SchemaTable) => table.x + table.width + 20),
      ...diagram.notes.map((note) => note.x + note.width),
      ...diagram.areas.map((area) => area.x + area.width),
    ) + 60;
  const height: number =
    Math.max(
      600,
      ...diagram.tables.map(
        (table: SchemaTable) => table.y + 60 + table.fields.length * 34,
      ),
      ...diagram.notes.map((note) => note.y + note.height),
      ...diagram.areas.map((area) => area.y + area.height),
    ) + 60;
  const areas: string = diagram.areas
    .map(
      (area) =>
        `<g><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" rx="12" fill="${area.color}" fill-opacity=".18" stroke="${area.color}"/><text x="${area.x + 12}" y="${area.y + 22}" font-family="sans-serif" font-size="13" font-weight="700">${escapeXml(area.title)}</text></g>`,
    )
    .join("");
  const relations: string = diagram.relations
    .map((relation: SchemaRelation) => svgRelation(relation, diagram.tables))
    .join("");
  const tables: string = diagram.tables
    .map((table: SchemaTable) => svgTable(table))
    .join("");
  const notes: string = diagram.notes
    .map(
      (note) =>
        `<g><rect x="${note.x}" y="${note.y}" width="${note.width}" height="${note.height}" rx="8" fill="${note.color}" stroke="#d9bd59"/><text x="${note.x + 12}" y="${note.y + 22}" font-family="sans-serif" font-size="11" font-weight="700">${escapeXml(note.title)}</text><text x="${note.x + 12}" y="${note.y + 46}" font-family="sans-serif" font-size="12">${escapeXml(
          note.text,
        )
          .split("\n")
          .map(
            (line: string, index: number) =>
              `<tspan x="${note.x + 12}" dy="${index ? 18 : 0}">${line}</tspan>`,
          )
          .join("")}</text></g>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/>${areas}${relations}${tables}${notes}</svg>`;
}

/**
 * Converts an SVG snapshot to a PNG browser download.
 *
 * @param svg standalone SVG snapshot
 * @param fileName target file name
 * @returns completes after the browser download begins
 */
export async function downloadPng(
  svg: string,
  fileName: string,
): Promise<void> {
  await downloadRaster(svg, fileName, "image/png");
}

/**
 * Converts an SVG snapshot to a JPEG browser download.
 *
 * @param svg standalone SVG snapshot
 * @param fileName target file name
 * @returns completes after the browser download begins
 */
export async function downloadJpeg(
  svg: string,
  fileName: string,
): Promise<void> {
  await downloadRaster(svg, fileName, "image/jpeg", 0.92);
}

/**
 * Converts an SVG snapshot to a WebP browser download.
 *
 * @param svg standalone SVG snapshot
 * @param fileName target file name
 * @returns completes after the browser download begins
 */
export async function downloadWebp(
  svg: string,
  fileName: string,
): Promise<void> {
  await downloadRaster(svg, fileName, "image/webp", 0.92);
}

/**
 * Rasterizes an SVG snapshot using the requested browser-supported image format.
 *
 * @param svg standalone SVG snapshot
 * @param fileName target file name
 * @param mimeType target image MIME type
 * @param quality optional lossy encoder quality
 * @returns completes after the browser download begins
 */
async function downloadRaster(
  svg: string,
  fileName: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  quality?: number,
): Promise<void> {
  const image: HTMLImageElement = new Image();
  const url: string = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  await new Promise<void>(
    (resolve: () => void, reject: (reason?: unknown) => void) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render SVG."));
      image.src = url;
    },
  );
  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = image.width * 2;
  canvas.height = image.height * 2;
  const context: CanvasRenderingContext2D | null = canvas.getContext("2d");

  if (!context) {
    URL.revokeObjectURL(url);

    throw new Error("Unable to create image export canvas.");
  }

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob: Blob | null = await new Promise(
    (resolve: (value: Blob | null) => void) =>
      canvas.toBlob(resolve, mimeType, quality),
  );

  if (!blob)
    throw new Error(
      `Unable to encode ${mimeType.replace("image/", "").toUpperCase()}.`,
    );

  downloadBlob(blob, fileName);
}

/** Starts a browser download for a blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Renders one schema table as a compact SVG group. */
function svgTable(table: SchemaTable): string {
  const height: number = 48 + table.fields.length * 34;
  const fields: string = table.fields
    .map(
      (field: SchemaField, index: number) =>
        `<text x="${table.x + 12}" y="${table.y + 72 + index * 34}" font-family="sans-serif" font-size="12">${escapeXml(field.name)}: ${escapeXml(field.type)}${field.primary ? " [PK]" : ""}</text>`,
    )
    .join("");

  return `<g><rect x="${table.x}" y="${table.y}" width="${table.width}" height="${height}" rx="10" fill="#fff" stroke="${table.color}"/><rect x="${table.x}" y="${table.y}" width="${table.width}" height="48" rx="10" fill="${table.color}" fill-opacity=".13"/><text x="${table.x + 12}" y="${table.y + 30}" font-family="sans-serif" font-size="14" font-weight="700">${escapeXml(table.name)}</text>${fields}</g>`;
}

/** Renders a relationship as an orthogonal SVG path. */
function svgRelation(relation: SchemaRelation, tables: SchemaTable[]): string {
  const source: SchemaTable | undefined = tables.find(
    (table: SchemaTable) => table.id === relation.sourceTableId,
  );
  const target: SchemaTable | undefined = tables.find(
    (table: SchemaTable) => table.id === relation.targetTableId,
  );

  if (!source || !target) return "";

  const startX: number = source.x + source.width;
  const startY: number = source.y + 65;
  const endX: number = target.x;
  const endY: number = target.y + 65;
  const middleX: number = (startX + endX) / 2;

  return `<path d="M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}" fill="none" stroke="#7f8cad" stroke-width="2"/>`;
}

/** Builds the Markdown section for a single table. */
function markdownTable(table: SchemaTable): string {
  const rows: string[] = table.fields.map(
    (field: SchemaField) =>
      `| ${escapeMarkdownCell(field.name)} | ${escapeMarkdownCell(field.type)} | ${fieldAttributes(field).join(", ") || "—"} | ${escapeMarkdownCell(field.defaultValue) || "—"} | ${escapeMarkdownCell(field.checkExpression || "") || "—"} | ${escapeMarkdownCell(field.comment) || "—"} |`,
  );
  const indexes: string[] = table.indexes.map(
    (index) =>
      `- ${index.unique ? "Unique index" : "Index"} \`${escapeCode(index.name)}\`: ${index.fieldIds
        .map(
          (fieldId: string) =>
            table.fields.find((field: SchemaField) => field.id === fieldId)
              ?.name || fieldId,
        )
        .map((fieldName: string) => `\`${escapeCode(fieldName)}\``)
        .join(", ")}`,
  );

  return [
    `## ${escapeMarkdown(table.name)}`,
    table.comment ? escapeMarkdown(table.comment) : "",
    "| Field | Type | Attributes | Default | Check | Description |",
    "| --- | --- | --- | --- | --- | --- |",
    rows.join("\n") || "| — | — | — | — | — | — |",
    indexes.length ? `### Indexes\n${indexes.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Converts a relationship into a human-readable Markdown list item. */
function markdownRelation(
  relation: SchemaRelation,
  tables: SchemaTable[],
): string {
  const source: SchemaTable | undefined = tables.find(
    (table: SchemaTable) => table.id === relation.sourceTableId,
  );
  const target: SchemaTable | undefined = tables.find(
    (table: SchemaTable) => table.id === relation.targetTableId,
  );

  if (!source || !target) return "";

  const sourceFields: string = relation.sourceFieldIds
    .map(
      (fieldId: string) =>
        source.fields.find((field: SchemaField) => field.id === fieldId)
          ?.name || fieldId,
    )
    .join(", ");
  const targetFields: string = relation.targetFieldIds
    .map(
      (fieldId: string) =>
        target.fields.find((field: SchemaField) => field.id === fieldId)
          ?.name || fieldId,
    )
    .join(", ");

  return `\`${escapeCode(source.name)}.${escapeCode(sourceFields)}\` → \`${escapeCode(target.name)}.${escapeCode(targetFields)}\` (${relation.cardinality}; on delete ${relation.onDelete}; on update ${relation.onUpdate})${relation.constraintName ? ` — \`${escapeCode(relation.constraintName)}\`` : ""}`;
}

/** Lists field constraints which are useful in a schema document. */
function fieldAttributes(field: SchemaField): string[] {
  const attributes: Array<[boolean, string]> = [
    [field.primary, "PK"],
    [field.unique, "Unique"],
    [!field.nullable, "Not null"],
    [Boolean(field.autoIncrement), "Auto increment"],
    [Boolean(field.unsigned), "Unsigned"],
  ];

  return attributes
    .filter((entry: [boolean, string]) => entry[0])
    .map((entry: [boolean, string]) => entry[1]);
}

/** Escapes a cell value so it cannot split or break a Markdown table. */
function escapeMarkdownCell(value: string): string {
  return escapeMarkdown(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

/** Escapes Markdown syntax in user-entered prose. */
function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("#", "\\#")
    .replaceAll("\n", " ");
}

/** Escapes inline-code delimiters in an identifier. */
function escapeCode(value: string): string {
  return value.replaceAll("`", "\\`");
}
function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
