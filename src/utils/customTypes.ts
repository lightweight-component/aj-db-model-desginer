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
