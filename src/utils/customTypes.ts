import type { SchemaCustomType } from "../types/schema";

/**
 * Builds the concrete database type represented by a reusable custom type.
 *
 * @param type custom type definition
 * @returns base type with configured length or precision parameters
 */
export function customTypeDefinition(type: SchemaCustomType): string {
  const baseType: string = type.baseType.trim().replace(/\s*\([^)]*\)$/, "");

  if (type.precision !== null) {
    const scale: number = Math.min(type.precision, Math.max(0, type.scale ?? 0));

    return `${baseType}(${type.precision},${scale})`;
  }

  if (type.length !== null)
    return `${baseType}(${type.length})`;

  return baseType;
}

/** Parses a concrete database type into editable custom-type parameters. */
export function parseCustomTypeDefinition(id: string, name: string, definition: string, comment: string = ""): SchemaCustomType {
  const match: RegExpMatchArray | null = definition.trim().match(/^(.+?)(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/);
  const baseType: string = match?.[1]?.trim() || "TEXT";
  const first: number | null = match?.[2] ? Number(match[2]) : null;
  const second: number | null = match?.[3] ? Number(match[3]) : null;
  const decimal: boolean = second !== null || /^(DECIMAL|NUMERIC)$/i.test(baseType);

  return { id, name, baseType, length: decimal ? null : first, precision: decimal ? first : null, scale: decimal ? second ?? 0 : null, comment };
}
