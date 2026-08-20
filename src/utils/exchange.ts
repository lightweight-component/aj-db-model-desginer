import type { SchemaDiagram, SchemaField, SchemaRelation, SchemaTable } from "../types/schema";

/** Exports the logical schema as Mermaid ER diagram source. */
export function exportMermaid(diagram: SchemaDiagram): string {
  const tables: string[] = diagram.tables.map((table: SchemaTable) => {
    const fields: string[] = table.fields.map((field: SchemaField) => `    ${field.type} ${field.name}${field.primary ? " PK" : ""}${field.unique ? " UK" : ""}`);

    return `  ${safeName(table.name)} {\n${fields.join("\n")}\n  }`;
  });
  const relations: string[] = diagram.relations.map((relation: SchemaRelation) => {
    const source: SchemaTable | undefined = diagram.tables.find((table: SchemaTable) => table.id === relation.sourceTableId);
    const target: SchemaTable | undefined = diagram.tables.find((table: SchemaTable) => table.id === relation.targetTableId);

    if (!source || !target)
      return "";

    const marker: string = relation.cardinality === "many-to-one" ? "}o--||" : relation.cardinality === "one-to-many" ? "||--o{" : "||--||";

    return `  ${safeName(source.name)} ${marker} ${safeName(target.name)} : references`;
  });

  return ["erDiagram", ...tables, ...relations.filter(Boolean)].join("\n");
}

/** Builds a standalone SVG snapshot of tables, relationships, notes and areas. */
export function exportSvg(diagram: SchemaDiagram): string {
  const width: number = Math.max(900, ...diagram.tables.map((table: SchemaTable) => table.x + table.width + 20), ...diagram.notes.map((note) => note.x + note.width), ...diagram.areas.map((area) => area.x + area.width)) + 60;
  const height: number = Math.max(600, ...diagram.tables.map((table: SchemaTable) => table.y + 60 + table.fields.length * 34), ...diagram.notes.map((note) => note.y + note.height), ...diagram.areas.map((area) => area.y + area.height)) + 60;
  const areas: string = diagram.areas.map((area) => `<g><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" rx="12" fill="${area.color}" fill-opacity=".18" stroke="${area.color}"/><text x="${area.x + 12}" y="${area.y + 22}" font-family="sans-serif" font-size="13" font-weight="700">${escapeXml(area.title)}</text></g>`).join("");
  const relations: string = diagram.relations.map((relation: SchemaRelation) => svgRelation(relation, diagram.tables)).join("");
  const tables: string = diagram.tables.map((table: SchemaTable) => svgTable(table)).join("");
  const notes: string = diagram.notes.map((note) => `<g><rect x="${note.x}" y="${note.y}" width="${note.width}" height="${note.height}" rx="8" fill="${note.color}" stroke="#d9bd59"/><text x="${note.x + 12}" y="${note.y + 22}" font-family="sans-serif" font-size="11" font-weight="700">${escapeXml(note.title)}</text><text x="${note.x + 12}" y="${note.y + 46}" font-family="sans-serif" font-size="12">${escapeXml(note.text).split("\n").map((line: string, index: number) => `<tspan x="${note.x + 12}" dy="${index ? 18 : 0}">${line}</tspan>`).join("")}</text></g>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/>${areas}${relations}${tables}${notes}</svg>`;
}

/** Converts an SVG snapshot to a PNG browser download. */
export async function downloadPng(svg: string, fileName: string): Promise<void> {
  const image: HTMLImageElement = new Image();
  const url: string = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to render SVG.")); image.src = url; });
  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = image.width * 2;
  canvas.height = image.height * 2;
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob: Blob | null = await new Promise((resolve: (value: Blob | null) => void) => canvas.toBlob(resolve, "image/png"));

  if (!blob)
    throw new Error("Unable to encode PNG.");

  downloadBlob(blob, fileName);
}

/** Starts a browser download for a blob. */
export function downloadBlob(blob: Blob, fileName: string): void { const url: string = URL.createObjectURL(blob); const anchor: HTMLAnchorElement = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url); }

function svgTable(table: SchemaTable): string { const height: number = 48 + table.fields.length * 34; const fields: string = table.fields.map((field: SchemaField, index: number) => `<text x="${table.x + 12}" y="${table.y + 72 + index * 34}" font-family="sans-serif" font-size="12">${escapeXml(field.name)}: ${escapeXml(field.type)}${field.primary ? " [PK]" : ""}</text>`).join(""); return `<g><rect x="${table.x}" y="${table.y}" width="${table.width}" height="${height}" rx="10" fill="#fff" stroke="${table.color}"/><rect x="${table.x}" y="${table.y}" width="${table.width}" height="48" rx="10" fill="${table.color}" fill-opacity=".13"/><text x="${table.x + 12}" y="${table.y + 30}" font-family="sans-serif" font-size="14" font-weight="700">${escapeXml(table.name)}</text>${fields}</g>`; }
function svgRelation(relation: SchemaRelation, tables: SchemaTable[]): string { const source: SchemaTable | undefined = tables.find((table: SchemaTable) => table.id === relation.sourceTableId); const target: SchemaTable | undefined = tables.find((table: SchemaTable) => table.id === relation.targetTableId); if (!source || !target) return ""; const startX: number = source.x + source.width; const startY: number = source.y + 65; const endX: number = target.x; const endY: number = target.y + 65; const middleX: number = (startX + endX) / 2; return `<path d="M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}" fill="none" stroke="#7f8cad" stroke-width="2"/>`; }
function safeName(value: string): string { return value.replace(/[^A-Za-z0-9_]/g, "_"); }
function escapeXml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;"); }
