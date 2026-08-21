import type {
  DatabaseDialect,
  DiagramEditorSettings,
  ForeignKeyAction,
  RelationCardinality,
  SchemaArea,
  SchemaCustomType,
  SchemaDiagram,
  SchemaEnum,
  SchemaField,
  SchemaNote,
  SchemaRelation,
  SchemaTable,
} from "../types/schema";

export const CURRENT_SCHEMA_VERSION: number = 2;
const DIALECTS: DatabaseDialect[] = [
  "generic",
  "mysql",
  "mariadb",
  "postgresql",
  "sqlserver",
  "sqlite",
  "oracle",
];
const CARDINALITIES: RelationCardinality[] = [
  "one-to-one",
  "one-to-many",
  "many-to-one",
];
const FOREIGN_KEY_ACTIONS: ForeignKeyAction[] = [
  "NO ACTION",
  "RESTRICT",
  "CASCADE",
  "SET NULL",
  "SET DEFAULT",
];

export interface SchemaValidationResult {
  diagram: SchemaDiagram | null;
  error: string | null;
}

/**
 * Validates a JSON diagram against the current application format.
 *
 * @param value parsed JSON value
 * @returns validated diagram or the exact invalid model path
 */
export function validateSchemaDiagram(value: unknown): SchemaValidationResult {
  const source: Record<string, unknown> | null = objectValue(value);

  if (!source) return failure("Root value must be a JSON object.");

  if (source.formatVersion !== CURRENT_SCHEMA_VERSION)
    return failure(`formatVersion must be ${CURRENT_SCHEMA_VERSION}.`);

  if (typeof source.name !== "string" || !source.name.trim())
    return failure("name must be a non-empty string.");

  if (!DIALECTS.includes(source.dialect as DatabaseDialect))
    return failure("dialect is not supported.");

  const settings: DiagramEditorSettings | null = validateSettings(
    source.settings,
  );

  if (!settings)
    return failure(
      "settings does not match the current editor settings format.",
    );

  const collectionError: string | null = requiredArrays(source, [
    "enums",
    "customTypes",
    "notes",
    "areas",
    "tables",
    "relations",
  ]);

  if (collectionError) return failure(collectionError);

  const enums: SchemaEnum[] | string = validateEnums(source.enums as unknown[]);

  if (typeof enums === "string") return failure(enums);

  const customTypes: SchemaCustomType[] | string = validateCustomTypes(
    source.customTypes as unknown[],
  );

  if (typeof customTypes === "string") return failure(customTypes);

  const notes: SchemaNote[] | string = validateNotes(source.notes as unknown[]);

  if (typeof notes === "string") return failure(notes);

  const areas: SchemaArea[] | string = validateAreas(source.areas as unknown[]);

  if (typeof areas === "string") return failure(areas);

  const tables: SchemaTable[] | string = validateTables(
    source.tables as unknown[],
  );

  if (typeof tables === "string") return failure(tables);

  const relations: SchemaRelation[] | string = validateRelations(
    source.relations as unknown[],
    tables,
  );

  if (typeof relations === "string") return failure(relations);

  return {
    diagram: {
      formatVersion: CURRENT_SCHEMA_VERSION,
      name: source.name,
      settings,
      dialect: source.dialect as DatabaseDialect,
      enums,
      customTypes,
      notes,
      areas,
      tables,
      relations,
    },
    error: null,
  };
}

/** Validates persisted canvas appearance and interaction settings. */
function validateSettings(value: unknown): DiagramEditorSettings | null {
  const settings: Record<string, unknown> | null = objectValue(value);

  if (
    !settings ||
    typeof settings.gridVisible !== "boolean" ||
    typeof settings.snapToGrid !== "boolean" ||
    typeof settings.showCardinality !== "boolean" ||
    (settings.relationRouteStyle !== "orthogonal" &&
      settings.relationRouteStyle !== "straight" &&
      settings.relationRouteStyle !== "curved")
  )
    return null;

  return {
    gridVisible: settings.gridVisible,
    snapToGrid: settings.snapToGrid,
    relationRouteStyle: settings.relationRouteStyle,
    showCardinality: settings.showCardinality,
  };
}

/** Validates enum definitions. */
function validateEnums(values: unknown[]): SchemaEnum[] | string {
  for (let index: number = 0; index < values.length; index += 1) {
    const item: Record<string, unknown> | null = objectValue(values[index]);

    if (
      !item ||
      !stringProperties(item, ["id", "name", "comment"]) ||
      !stringArray(item.values, false)
    ) {
      return `enums[${index}] does not match the current enum format.`;
    }
  }

  return values as SchemaEnum[];
}

/** Validates custom type definitions. */
function validateCustomTypes(values: unknown[]): SchemaCustomType[] | string {
  for (let index: number = 0; index < values.length; index += 1) {
    const item: Record<string, unknown> | null = objectValue(values[index]);

    if (
      !item ||
      !stringProperties(item, ["id", "name", "baseType", "comment"]) ||
      !nullableNumbers(item, ["length", "precision", "scale"])
    ) {
      return `customTypes[${index}] does not match the current custom type format.`;
    }
  }

  return values as SchemaCustomType[];
}

/** Validates canvas notes. */
function validateNotes(values: unknown[]): SchemaNote[] | string {
  for (let index: number = 0; index < values.length; index += 1) {
    const item: Record<string, unknown> | null = objectValue(values[index]);

    if (
      !item ||
      !stringProperties(item, ["id", "title", "text", "color"]) ||
      !numberProperties(item, ["x", "y", "width", "height"]) ||
      typeof item.locked !== "boolean"
    ) {
      return `notes[${index}] does not match the current note format.`;
    }
  }

  return values as SchemaNote[];
}

/** Validates canvas areas. */
function validateAreas(values: unknown[]): SchemaArea[] | string {
  for (let index: number = 0; index < values.length; index += 1) {
    const item: Record<string, unknown> | null = objectValue(values[index]);

    if (
      !item ||
      !stringProperties(item, ["id", "title", "color"]) ||
      !numberProperties(item, ["x", "y", "width", "height"]) ||
      typeof item.locked !== "boolean"
    ) {
      return `areas[${index}] does not match the current area format.`;
    }
  }

  return values as SchemaArea[];
}

/** Validates tables, fields, and indexes. */
function validateTables(values: unknown[]): SchemaTable[] | string {
  for (
    let tableIndex: number = 0;
    tableIndex < values.length;
    tableIndex += 1
  ) {
    const table: Record<string, unknown> | null = objectValue(
      values[tableIndex],
    );

    if (
      !table ||
      !stringProperties(table, ["id", "name", "color", "comment"]) ||
      !numberProperties(table, ["x", "y", "width"]) ||
      typeof table.collapsed !== "boolean" ||
      typeof table.locked !== "boolean" ||
      !Array.isArray(table.fields) ||
      !Array.isArray(table.indexes)
    )
      return `tables[${tableIndex}] does not match the current table format.`;

    for (
      let fieldIndex: number = 0;
      fieldIndex < table.fields.length;
      fieldIndex += 1
    ) {
      const field: Record<string, unknown> | null = objectValue(
        table.fields[fieldIndex],
      );

      if (
        !field ||
        !stringProperties(field, [
          "id",
          "name",
          "type",
          "comment",
          "defaultValue",
        ]) ||
        !booleanProperties(field, ["primary", "nullable", "unique"]) ||
        (field.autoIncrement !== undefined &&
          typeof field.autoIncrement !== "boolean") ||
        (field.unsigned !== undefined && typeof field.unsigned !== "boolean") ||
        (field.checkExpression !== undefined &&
          typeof field.checkExpression !== "string")
      )
        return `tables[${tableIndex}].fields[${fieldIndex}] does not match the current field format.`;
    }

    const fieldIds: Set<string> = new Set(
      (table.fields as SchemaField[]).map((field: SchemaField) => field.id),
    );
    for (
      let indexIndex: number = 0;
      indexIndex < table.indexes.length;
      indexIndex += 1
    ) {
      const item: Record<string, unknown> | null = objectValue(
        table.indexes[indexIndex],
      );

      if (
        !item ||
        !stringProperties(item, ["id", "name"]) ||
        typeof item.unique !== "boolean" ||
        !stringArray(item.fieldIds, false)
      )
        return `tables[${tableIndex}].indexes[${indexIndex}] does not match the current index format.`;

      if (
        (item.fieldIds as string[]).some(
          (fieldId: string) => !fieldIds.has(fieldId),
        )
      ) {
        return `tables[${tableIndex}].indexes[${indexIndex}].fieldIds references a missing field.`;
      }
    }
  }

  return values as SchemaTable[];
}

/** Validates relationships and their endpoint references. */
function validateRelations(
  values: unknown[],
  tables: SchemaTable[],
): SchemaRelation[] | string {
  const tableMap: Map<string, SchemaTable> = new Map(
    tables.map((table: SchemaTable) => [table.id, table]),
  );
  for (let index: number = 0; index < values.length; index += 1) {
    const item: Record<string, unknown> | null = objectValue(values[index]);

    if (
      !item ||
      !stringProperties(item, [
        "id",
        "sourceTableId",
        "targetTableId",
        "constraintName",
      ]) ||
      !stringArray(item.sourceFieldIds, false) ||
      !stringArray(item.targetFieldIds, false) ||
      !CARDINALITIES.includes(item.cardinality as RelationCardinality) ||
      !FOREIGN_KEY_ACTIONS.includes(item.onDelete as ForeignKeyAction) ||
      !FOREIGN_KEY_ACTIONS.includes(item.onUpdate as ForeignKeyAction)
    )
      return `relations[${index}] does not match the current relationship format.`;

    const source: SchemaTable | undefined = tableMap.get(
      item.sourceTableId as string,
    );
    const target: SchemaTable | undefined = tableMap.get(
      item.targetTableId as string,
    );

    if (!source || !target)
      return `relations[${index}] references a missing table.`;

    const sourceIds: string[] = item.sourceFieldIds as string[];
    const targetIds: string[] = item.targetFieldIds as string[];

    if (sourceIds.length !== targetIds.length)
      return `relations[${index}] must contain equally sized field arrays.`;

    if (
      sourceIds.some(
        (fieldId: string) =>
          !source.fields.some((field: SchemaField) => field.id === fieldId),
      )
    ) {
      return `relations[${index}].sourceFieldIds references a missing source field.`;
    }

    if (
      targetIds.some(
        (fieldId: string) =>
          !target.fields.some((field: SchemaField) => field.id === fieldId),
      )
    ) {
      return `relations[${index}].targetFieldIds references a missing target field.`;
    }
  }

  return values as SchemaRelation[];
}

function failure(error: string): SchemaValidationResult {
  return { diagram: null, error };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredArrays(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  const missing: string | undefined = keys.find(
    (key: string) => !Array.isArray(value[key]),
  );

  return missing ? `${missing} must be an array.` : null;
}

function stringProperties(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every((key: string) => typeof value[key] === "string");
}

function numberProperties(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every(
    (key: string) =>
      typeof value[key] === "number" && Number.isFinite(value[key]),
  );
}

function booleanProperties(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every((key: string) => typeof value[key] === "boolean");
}

function nullableNumbers(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every(
    (key: string) =>
      value[key] === null ||
      (typeof value[key] === "number" && Number.isFinite(value[key])),
  );
}

function stringArray(value: unknown, allowEmpty: boolean): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item: unknown) => typeof item === "string")
  );
}
