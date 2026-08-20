import { graphlib, layout } from "@dagrejs/dagre";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { DatabaseDialect, DiagramPoint, DiagramRect, ElementReference, RelationCardinality, SchemaArea, SchemaCustomType, SchemaDiagram, SchemaEnum, SchemaField, SchemaIndex, SchemaNote, SchemaRelation, SchemaTable } from "../types/schema";
import { typeBase } from "../utils/dialects";

const DEFAULT_TABLE_WIDTH: number = 260;
const TABLE_HEADER_HEIGHT: number = 49;
const TABLE_FIELD_HEIGHT: number = 35;
const LOCAL_DRAFT_KEY: string = "aj-db-model-designer:draft:v1";

interface SchemaClipboard {
  tables: SchemaTable[];
  areas: SchemaArea[];
  notes: SchemaNote[];
  relations: SchemaRelation[];
}

/** Creates an id without coupling the editor model to a UI library. */
function createId(): string { return crypto.randomUUID(); }

/** Creates the conventional first field used by a new table. */
function createDefaultField(): SchemaField { return { id: createId(), name: "id", type: "INTEGER", primary: true, nullable: false, unique: true, comment: "", defaultValue: "" }; }

/** Creates an editable starter diagram containing one relationship. */
function createInitialDiagram(): SchemaDiagram {
  const userId: SchemaField = createDefaultField();
  const orderId: SchemaField = createDefaultField();
  const orderUserId: SchemaField = { id: createId(), name: "user_id", type: "INTEGER", primary: false, nullable: false, unique: false, comment: "", defaultValue: "" };
  const users: SchemaTable = { id: createId(), name: "users", x: 160, y: 140, width: DEFAULT_TABLE_WIDTH, color: "#5f6ee8", comment: "Application users", collapsed: false, locked: false, indexes: [], fields: [userId, { id: createId(), name: "email", type: "VARCHAR(255)", primary: false, nullable: false, unique: true, comment: "", defaultValue: "" }, { id: createId(), name: "created_at", type: "TIMESTAMP", primary: false, nullable: false, unique: false, comment: "", defaultValue: "CURRENT_TIMESTAMP" }] };
  const orders: SchemaTable = { id: createId(), name: "orders", x: 560, y: 300, width: DEFAULT_TABLE_WIDTH, color: "#20a67a", comment: "Customer orders", collapsed: false, locked: false, indexes: [], fields: [orderId, orderUserId, { id: createId(), name: "total", type: "DECIMAL(10,2)", primary: false, nullable: false, unique: false, comment: "", defaultValue: "0" }] };

  return { dialect: "mysql", enums: [], customTypes: [], notes: [], areas: [], tables: [users, orders], relations: [{ id: createId(), sourceTableId: orders.id, sourceFieldIds: [orderUserId.id], targetTableId: users.id, targetFieldIds: [userId.id], cardinality: "many-to-one", constraintName: "fk_orders_users", onDelete: "NO ACTION", onUpdate: "NO ACTION" }] };
}

/**
 * Creates a mutable snapshot used by undo and persistence.
 *
 * @param value serializable value whose reactive Vue proxies must be removed
 * @returns detached serializable data
 */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Returns the visual height used by both Dagre and marquee selection. */
function tableHeight(table: SchemaTable): number { return TABLE_HEADER_HEIGHT + table.fields.length * TABLE_FIELD_HEIGHT; }

/**
 * Maps concrete database types to relationship-compatible families.
 *
 * @param type database field type
 * @returns normalized compatibility family
 */
function relationshipTypeFamily(type: string): string {
  const base: string = typeBase(type);
  const families: Record<string, string[]> = {
    integer: ["TINYINT", "SMALLINT", "INT", "INTEGER", "BIGINT"],
    decimal: ["DECIMAL", "NUMERIC", "REAL", "FLOAT", "DOUBLE", "DOUBLE PRECISION"],
    text: ["CHAR", "VARCHAR", "NVARCHAR", "TEXT"],
    boolean: ["BOOLEAN", "BIT"],
    date: ["DATE", "TIME", "DATETIME", "DATETIME2", "DATETIMEOFFSET", "TIMESTAMP", "TIMESTAMPTZ"],
    binary: ["BLOB", "BYTEA", "VARBINARY"],
    json: ["JSON", "JSONB"],
    uuid: ["UUID", "UNIQUEIDENTIFIER"],
  };

  for (const [family, members] of Object.entries(families))
    if (members.includes(base))
      return family;

  return base;
}

/**
 * Infers relationship cardinality from endpoint uniqueness.
 *
 * @param source source field
 * @param target target field
 * @returns cardinality from source to target
 */
function inferCardinality(source: SchemaField, target: SchemaField): RelationCardinality {
  const sourceUnique: boolean = source.primary || source.unique;
  const targetUnique: boolean = target.primary || target.unique;

  if (sourceUnique && targetUnique)
    return "one-to-one";

  if (sourceUnique)
    return "one-to-many";

  return "many-to-one";
}

/** Validates a parsed JSON document before it replaces the active schema. */
function isSchemaDiagram(value: unknown): value is SchemaDiagram {
  if (!value || typeof value !== "object")
    return false;

  const diagram: Partial<SchemaDiagram> = value as Partial<SchemaDiagram>;

  if (!Array.isArray(diagram.tables) || !Array.isArray(diagram.relations))
    return false;

  return diagram.tables.every((table: unknown) => {
    const item: Partial<SchemaTable> = table as Partial<SchemaTable>;

    return Boolean(table) && typeof item.id === "string" && typeof item.name === "string" && typeof item.x === "number" && typeof item.y === "number" && typeof item.color === "string" && Array.isArray(item.fields);
  }) && diagram.relations.every((relation: unknown) => {
    const item: Partial<SchemaRelation> = relation as Partial<SchemaRelation>;

    return Boolean(relation) && typeof item.id === "string" && typeof item.sourceTableId === "string" && typeof item.targetTableId === "string" && Array.isArray(item.sourceFieldIds) && Array.isArray(item.targetFieldIds) && item.sourceFieldIds.length === item.targetFieldIds.length;
  });
}

/** Owns the schema diagram and every user-visible editing command. */
export const useSchemaStore = defineStore("schema", () => {
  const initial: SchemaDiagram = createInitialDiagram();
  const dialect = ref<DatabaseDialect>(initial.dialect);
  const enums = ref<SchemaEnum[]>(initial.enums);
  const customTypes = ref<SchemaCustomType[]>(initial.customTypes);
  const notes = ref<SchemaNote[]>(initial.notes);
  const areas = ref<SchemaArea[]>(initial.areas);
  const tables = ref<SchemaTable[]>(initial.tables);
  const relations = ref<SchemaRelation[]>(initial.relations);
  const selectedElements = ref<ElementReference[]>(tables.value[0] ? [{ type: "table", id: tables.value[0].id }] : []);
  const navigationRequest = ref<{ reference: ElementReference | null; sequence: number }>({ reference: null, sequence: 0 });
  const clipboard = ref<SchemaClipboard | null>(null);
  const undoStack = ref<SchemaDiagram[]>([]);
  const redoStack = ref<SchemaDiagram[]>([]);
  const selectedTableIds = computed<string[]>(() => selectedElements.value.filter((element: ElementReference) => element.type === "table").map((element: ElementReference) => element.id));
  const selectedRelationId = computed<string | null>(() => selectedElements.value.find((element: ElementReference) => element.type === "relation")?.id ?? null);
  const selectedAreaId = computed<string | null>(() => selectedElements.value.find((element: ElementReference) => element.type === "area")?.id ?? null);
  const selectedNoteId = computed<string | null>(() => selectedElements.value.find((element: ElementReference) => element.type === "note")?.id ?? null);
  const selectedTable = computed<SchemaTable | undefined>(() => tables.value.find((table: SchemaTable) => table.id === selectedTableIds.value[0]));
  const selectedRelation = computed<SchemaRelation | undefined>(() => relations.value.find((relation: SchemaRelation) => relation.id === selectedRelationId.value));
  const selectedArea = computed<SchemaArea | undefined>(() => areas.value.find((area: SchemaArea) => area.id === selectedAreaId.value));
  const selectedNote = computed<SchemaNote | undefined>(() => notes.value.find((note: SchemaNote) => note.id === selectedNoteId.value));
  const canUndo = computed<boolean>(() => undoStack.value.length > 0);
  const canRedo = computed<boolean>(() => redoStack.value.length > 0);

  /** Returns the complete serializable diagram. */
  function currentDiagram(): SchemaDiagram { return { dialect: dialect.value, enums: enums.value, customTypes: customTypes.value, notes: notes.value, areas: areas.value, tables: tables.value, relations: relations.value }; }

  /** Records the current diagram before a user command mutates it. */
  function commit(): void { undoStack.value.push(snapshot(currentDiagram())); redoStack.value = []; }

  /** Restores a snapshot into reactive editor state. */
  function apply(diagram: SchemaDiagram): void { const copy: SchemaDiagram = snapshot(diagram); dialect.value = copy.dialect ?? "mysql"; enums.value = copy.enums ?? []; customTypes.value = copy.customTypes ?? []; notes.value = (copy.notes ?? []).map((note: SchemaNote, index: number) => ({ ...note, width: note.width ?? 210, height: note.height ?? 120, title: note.title ?? `note_${index + 1}`, text: note.text ?? "", locked: note.locked ?? false })); areas.value = (copy.areas ?? []).map((area: SchemaArea) => ({ ...area, locked: area.locked ?? false })); tables.value = copy.tables.map((table: SchemaTable) => ({ ...table, width: table.width ?? DEFAULT_TABLE_WIDTH, indexes: (table.indexes ?? []).map((index: SchemaIndex) => ({ ...index, fieldIds: index.fieldIds.filter((fieldId: string) => table.fields.some((field: SchemaField) => field.id === fieldId) ) })) })); relations.value = copy.relations.map((relation: SchemaRelation) => ({ ...relation, constraintName: relation.constraintName ?? "", onDelete: relation.onDelete ?? "NO ACTION", onUpdate: relation.onUpdate ?? "NO ACTION" })); selectedElements.value = tables.value[0] ? [{ type: "table", id: tables.value[0].id }] : []; }

  /** Replaces the active diagram as one undoable import operation. */
  function replaceDiagram(diagram: SchemaDiagram): void { commit(); apply(diagram); }

  /** Switches the active database type catalogue without rewriting custom field types. */
  function setDialect(nextDialect: DatabaseDialect): void { if (dialect.value === nextDialect) return; commit(); dialect.value = nextDialect; }

  /** Adds a reusable enum with an editable name and initial value. */
  function addEnum(): void { commit(); enums.value.push({ id: createId(), name: `enum_${enums.value.length + 1}`, values: ["value"] }); }

  /** Updates enum metadata while retaining fields that refer to its name. */
  function updateEnum(enumId: string, values: Partial<Omit<SchemaEnum, "id">>): void { const item: SchemaEnum | undefined = enums.value.find((entry: SchemaEnum) => entry.id === enumId); if (!item) return; commit(); Object.assign(item, values); }

  /** Removes a reusable enum definition without rewriting existing fields. */
  function deleteEnum(enumId: string): void { if (!enums.value.some((item: SchemaEnum) => item.id === enumId)) return; commit(); enums.value = enums.value.filter((item: SchemaEnum) => item.id !== enumId); }

  /** Adds a reusable custom type with an editable base type. */
  function addCustomType(): void { commit(); customTypes.value.push({ id: createId(), name: `type_${customTypes.value.length + 1}`, baseType: "VARCHAR(255)" }); }

  /** Updates a custom type definition. */
  function updateCustomType(typeId: string, values: Partial<Omit<SchemaCustomType, "id">>): void { const item: SchemaCustomType | undefined = customTypes.value.find((entry: SchemaCustomType) => entry.id === typeId); if (!item) return; commit(); Object.assign(item, values); }

  /** Removes a custom type definition without rewriting existing fields. */
  function deleteCustomType(typeId: string): void { if (!customTypes.value.some((item: SchemaCustomType) => item.id === typeId)) return; commit(); customTypes.value = customTypes.value.filter((item: SchemaCustomType) => item.id !== typeId); }

  /** Adds and selects a writable annotation at a diagram coordinate. */
  function addNote(position: DiagramPoint): SchemaNote { const note: SchemaNote = { id: createId(), x: position.x, y: position.y, width: 210, height: 120, title: `note_${notes.value.length + 1}`, text: "New note", color: "#fff2a8", locked: false }; commit(); notes.value.push(note); selectedElements.value = [{ type: "note", id: note.id }]; return note; }

  /** Updates annotation text or styling. */
  function updateNote(noteId: string, values: Partial<Omit<SchemaNote, "id">>): void { const note: SchemaNote | undefined = notes.value.find((item: SchemaNote) => item.id === noteId); if (!note) return; commit(); Object.assign(note, values); }

  /** Moves one note, committing only once at the beginning of a drag. */
  function moveNote(noteId: string, delta: DiagramPoint, withHistory: boolean = false): void { const note: SchemaNote | undefined = notes.value.find((item: SchemaNote) => item.id === noteId); if (!note || note.locked) return; if (withHistory) commit(); note.x += delta.x; note.y += delta.y; }

  /** Resizes and repositions a note as one optional history operation. */
  function resizeNote(noteId: string, rect: DiagramRect, withHistory: boolean = false): void { const note: SchemaNote | undefined = notes.value.find((item: SchemaNote) => item.id === noteId); if (!note || note.locked) return; if (withHistory) commit(); Object.assign(note, rect); }

  /** Deletes a note and removes it from the unified selection. */
  function deleteNote(noteId: string): void { if (!notes.value.some((note: SchemaNote) => note.id === noteId)) return; commit(); notes.value = notes.value.filter((note: SchemaNote) => note.id !== noteId); selectedElements.value = selectedElements.value.filter((element: ElementReference) => !(element.type === "note" && element.id === noteId)); }

  /**
   * Adds and selects a visual area at a diagram coordinate.
   *
   * @param position initial top-left diagram coordinate
   * @returns newly created area
   */
  function addArea(position: DiagramPoint): SchemaArea {
    const area: SchemaArea = { id: createId(), x: position.x, y: position.y, width: 360, height: 240, title: "New area", color: "#b9d7ff", locked: false };
    commit();
    areas.value.push(area);
    selectedElements.value = [{ type: "area", id: area.id }];

    return area;
  }

  /** Updates a visual area. */
  function updateArea(areaId: string, values: Partial<Omit<SchemaArea, "id">>): void { const area: SchemaArea | undefined = areas.value.find((item: SchemaArea) => item.id === areaId); if (!area) return; commit(); Object.assign(area, values); }

  /** Moves one visual area, committing only once at the beginning of a drag. */
  function moveArea(areaId: string, delta: DiagramPoint, withHistory: boolean = false): void { const area: SchemaArea | undefined = areas.value.find((item: SchemaArea) => item.id === areaId); if (!area) return; if (withHistory) commit(); area.x += delta.x; area.y += delta.y; }

  /**
   * Resizes and repositions an area as one optional history operation.
   *
   * @param areaId target area identifier
   * @param rect replacement rectangle
   * @param withHistory whether to record the state before mutation
   */
  function resizeArea(areaId: string, rect: DiagramRect, withHistory: boolean = false): void {
    const area: SchemaArea | undefined = areas.value.find((item: SchemaArea) => item.id === areaId);

    if (!area || area.locked)
      return;

    if (withHistory)
      commit();

    Object.assign(area, rect);
  }

  /**
   * Deletes an area and removes it from the unified selection.
   *
   * @param areaId target area identifier
   */
  function deleteArea(areaId: string): void {
    if (!areas.value.some((area: SchemaArea) => area.id === areaId))
      return;

    commit();
    areas.value = areas.value.filter((area: SchemaArea) => area.id !== areaId);
    selectedElements.value = selectedElements.value.filter((element: ElementReference) => !(element.type === "area" && element.id === areaId));
  }

  /**
   * Moves every selected movable canvas object by one shared delta.
   *
   * @param delta diagram-space movement delta
   * @param withHistory whether to record the state before movement
   */
  function moveSelectedElements(delta: DiagramPoint, withHistory: boolean = false): void {
    if (withHistory)
      commit();

    selectedElements.value.forEach((element: ElementReference) => {
      if (element.type === "table") {
        const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === element.id);

        if (!table || table.locked)
          return;

        table.x += delta.x;
        table.y += delta.y;
      } else if (element.type === "area") {
        const area: SchemaArea | undefined = areas.value.find((item: SchemaArea) => item.id === element.id);

        if (!area || area.locked)
          return;

        area.x += delta.x;
        area.y += delta.y;
      } else if (element.type === "note") {
        const note: SchemaNote | undefined = notes.value.find((item: SchemaNote) => item.id === element.id);

        if (!note || note.locked)
          return;

        note.x += delta.x;
        note.y += delta.y;
      }
    });
  }

  /** Adds a table at the supplied diagram coordinate. */
  function addTable(position: DiagramPoint): SchemaTable { commit(); const table: SchemaTable = { id: createId(), name: `table_${tables.value.length + 1}`, x: position.x, y: position.y, width: DEFAULT_TABLE_WIDTH, color: "#d37834", comment: "", collapsed: false, locked: false, indexes: [], fields: [createDefaultField()] }; tables.value.push(table); selectedElements.value = [{ type: "table", id: table.id }]; return table; }

  /** Updates table metadata or its diagram position. */
  function updateTable(tableId: string, values: Partial<Omit<SchemaTable, "id" | "fields">>, withHistory: boolean = true): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); if (!table) return; if (withHistory) commit(); Object.assign(table, values, values.width === undefined ? {} : { width: Math.min(560, Math.max(220, values.width)) }); }

  /** Duplicates a table with fresh field and index identities. */
  function duplicateTable(tableId: string): SchemaTable | null { const source: SchemaTable | undefined = tables.value.find((table: SchemaTable) => table.id === tableId); if (!source) return null; const fieldIds: Map<string, string> = new Map<string, string>(); const fields: SchemaField[] = source.fields.map((field: SchemaField) => { const id: string = createId(); fieldIds.set(field.id, id); return { ...field, id }; }); const table: SchemaTable = { ...snapshot(source), id: createId(), name: `${source.name}_copy`, x: source.x + 40, y: source.y + 40, locked: false, fields, indexes: source.indexes.map((index: SchemaIndex) => ({ ...index, id: createId(), fieldIds: index.fieldIds.map((fieldId: string) => fieldIds.get(fieldId)).filter((fieldId: string | undefined): fieldId is string => Boolean(fieldId)) })) }; commit(); tables.value.push(table); selectedElements.value = [{ type: "table", id: table.id }]; return table; }

  /** Applies one locked state to all selected tables as a single history command. */
  function setSelectedTablesLocked(locked: boolean): void { const selected: SchemaTable[] = tables.value.filter((table: SchemaTable) => selectedTableIds.value.includes(table.id)); if (selected.length === 0 || selected.every((table: SchemaTable) => table.locked === locked)) return; commit(); selected.forEach((table: SchemaTable) => table.locked = locked); }

  /** Copies selected movable elements and internal table relationships into memory. */
  function copySelectedElements(): number { const tableIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "table").map((element: ElementReference) => element.id)); const areaIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "area").map((element: ElementReference) => element.id)); const noteIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "note").map((element: ElementReference) => element.id)); const next: SchemaClipboard = { tables: snapshot(tables.value.filter((table: SchemaTable) => tableIds.has(table.id))), areas: snapshot(areas.value.filter((area: SchemaArea) => areaIds.has(area.id))), notes: snapshot(notes.value.filter((note: SchemaNote) => noteIds.has(note.id))), relations: snapshot(relations.value.filter((relation: SchemaRelation) => tableIds.has(relation.sourceTableId) && tableIds.has(relation.targetTableId))) }; const count: number = next.tables.length + next.areas.length + next.notes.length; if (count > 0) clipboard.value = next; return count; }

  /** Pastes copied elements with fresh nested identities and selects the result. */
  function pasteSelectedElements(offset: DiagramPoint = { x: 32, y: 32 }): ElementReference[] { const source: SchemaClipboard | null = clipboard.value; if (!source) return []; const tableIds: Map<string, string> = new Map<string, string>(); const fieldIds: Map<string, string> = new Map<string, string>(); const pastedTables: SchemaTable[] = source.tables.map((table: SchemaTable) => { const tableId: string = createId(); tableIds.set(table.id, tableId); const fields: SchemaField[] = table.fields.map((field: SchemaField) => { const fieldId: string = createId(); fieldIds.set(field.id, fieldId); return { ...field, id: fieldId }; }); return { ...snapshot(table), id: tableId, name: `${table.name}_copy`, x: table.x + offset.x, y: table.y + offset.y, locked: false, fields, indexes: table.indexes.map((index: SchemaIndex) => ({ ...index, id: createId(), fieldIds: index.fieldIds.map((fieldId: string) => fieldIds.get(fieldId)).filter((fieldId: string | undefined): fieldId is string => Boolean(fieldId)) })) }; }); const pastedAreas: SchemaArea[] = source.areas.map((area: SchemaArea) => ({ ...snapshot(area), id: createId(), x: area.x + offset.x, y: area.y + offset.y, locked: false })); const pastedNotes: SchemaNote[] = source.notes.map((note: SchemaNote) => ({ ...snapshot(note), id: createId(), x: note.x + offset.x, y: note.y + offset.y, locked: false })); const pastedRelations: SchemaRelation[] = source.relations.map((relation: SchemaRelation) => ({ ...snapshot(relation), id: createId(), sourceTableId: tableIds.get(relation.sourceTableId) as string, sourceFieldIds: relation.sourceFieldIds.map((fieldId: string) => fieldIds.get(fieldId) as string), targetTableId: tableIds.get(relation.targetTableId) as string, targetFieldIds: relation.targetFieldIds.map((fieldId: string) => fieldIds.get(fieldId) as string) })); const references: ElementReference[] = [...pastedAreas.map((area: SchemaArea): ElementReference => ({ type: "area", id: area.id })), ...pastedTables.map((table: SchemaTable): ElementReference => ({ type: "table", id: table.id })), ...pastedNotes.map((note: SchemaNote): ElementReference => ({ type: "note", id: note.id }))]; commit(); tables.value.push(...pastedTables); areas.value.push(...pastedAreas); notes.value.push(...pastedNotes); relations.value.push(...pastedRelations); selectedElements.value = references; return references; }

  /** Moves one or more selected tables by a diagram-space delta. */
  function moveTables(tableIds: string[], delta: DiagramPoint, withHistory: boolean = false): void { if (withHistory) commit(); const moved: Set<string> = new Set(tableIds); tables.value.forEach((table: SchemaTable) => { if (!moved.has(table.id)) return; table.x += delta.x; table.y += delta.y; }); }

  /** Deletes a table and every relationship connected to it. */
  function deleteTable(tableId: string): void { if (!tables.value.some((table: SchemaTable) => table.id === tableId)) return; commit(); tables.value = tables.value.filter((table: SchemaTable) => table.id !== tableId); relations.value = relations.value.filter((relation: SchemaRelation) => relation.sourceTableId !== tableId && relation.targetTableId !== tableId); selectedElements.value = selectedElements.value.filter((element: ElementReference) => !(element.type === "table" && element.id === tableId)); }

  /** Deletes every currently selected table in one undoable command. */
  function deleteSelectedTables(): void { if (selectedTableIds.value.length === 0) return; commit(); const ids: Set<string> = new Set(selectedTableIds.value); tables.value = tables.value.filter((table: SchemaTable) => !ids.has(table.id)); relations.value = relations.value.filter((relation: SchemaRelation) => !ids.has(relation.sourceTableId) && !ids.has(relation.targetTableId)); selectedElements.value = selectedElements.value.filter((element: ElementReference) => element.type !== "table" || !ids.has(element.id)); }

  /** Aligns or evenly distributes selected tables using their diagram coordinates. */
  function arrangeSelected(mode: "left" | "right" | "top" | "bottom" | "horizontal" | "vertical"): void { const selected: SchemaTable[] = tables.value.filter((table: SchemaTable) => selectedTableIds.value.includes(table.id)); if (selected.length < 2) return; commit(); if (mode === "left") selected.forEach((table: SchemaTable) => table.x = Math.min(...selected.map((item: SchemaTable) => item.x))); else if (mode === "right") selected.forEach((table: SchemaTable) => table.x = Math.max(...selected.map((item: SchemaTable) => item.x))); else if (mode === "top") selected.forEach((table: SchemaTable) => table.y = Math.min(...selected.map((item: SchemaTable) => item.y))); else if (mode === "bottom") selected.forEach((table: SchemaTable) => table.y = Math.max(...selected.map((item: SchemaTable) => item.y))); else { const key: "x" | "y" = mode === "horizontal" ? "x" : "y"; const ordered: SchemaTable[] = [...selected].sort((left: SchemaTable, right: SchemaTable) => left[key] - right[key]); const start: number = ordered[0][key]; const end: number = ordered[ordered.length - 1][key]; ordered.forEach((table: SchemaTable, index: number) => table[key] = start + (end - start) * index / (ordered.length - 1)); } }

  /** Adds a field to the chosen table. */
  function addField(tableId: string): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); if (!table) return; commit(); table.fields.push({ id: createId(), name: `field_${table.fields.length + 1}`, type: "VARCHAR(255)", primary: false, nullable: true, unique: false, comment: "", defaultValue: "" }); }

  /** Updates a field while preserving its identity and position. */
  function updateField(tableId: string, fieldId: string, values: Partial<Omit<SchemaField, "id">>): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); const field: SchemaField | undefined = table?.fields.find((item: SchemaField) => item.id === fieldId); if (!field) return; commit(); Object.assign(field, values); if (field.primary) field.nullable = false; }

  /** Reorders a field; relationships remain valid because they retain field ids. */
  function moveField(tableId: string, fieldId: string, offset: number): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); const index: number = table?.fields.findIndex((field: SchemaField) => field.id === fieldId) ?? -1; if (!table || index < 0 || index + offset < 0 || index + offset >= table.fields.length) return; commit(); const [field]: SchemaField[] = table.fields.splice(index, 1); table.fields.splice(index + offset, 0, field); }

  /** Moves a field to an absolute position for drag-and-drop sorting. */
  function moveFieldTo(tableId: string, fieldId: string, targetIndex: number): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); const sourceIndex: number = table?.fields.findIndex((field: SchemaField) => field.id === fieldId) ?? -1; if (!table || sourceIndex < 0) return; const boundedTarget: number = Math.min(table.fields.length - 1, Math.max(0, targetIndex)); if (sourceIndex === boundedTarget) return; commit(); const [field]: SchemaField[] = table.fields.splice(sourceIndex, 1); table.fields.splice(boundedTarget, 0, field); }

  /** Adds an index using the table's first field as an editable starting point. */
  function addIndex(tableId: string, unique: boolean): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); if (!table || table.fields.length === 0) return; commit(); table.indexes.push({ id: createId(), name: `${unique ? "uq" : "idx"}_${table.name}_${table.fields[0].name}`, fieldIds: [table.fields[0].id], unique }); }

  /** Updates index metadata such as its name or field set. */
  function updateIndex(tableId: string, indexId: string, values: Partial<Omit<SchemaIndex, "id">>): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); const index: SchemaIndex | undefined = table?.indexes.find((item: SchemaIndex) => item.id === indexId); if (!table || !index) return; const fieldIds: string[] | undefined = values.fieldIds ? [...new Set(values.fieldIds)].filter((fieldId: string) => table.fields.some((field: SchemaField) => field.id === fieldId)) : undefined; if (fieldIds && fieldIds.length === 0) return; commit(); Object.assign(index, values, fieldIds ? { fieldIds } : {}); }

  /** Adds or removes one field from a composite index. */
  function toggleIndexField(tableId: string, indexId: string, fieldId: string): void { const index: SchemaIndex | undefined = tables.value.find((table: SchemaTable) => table.id === tableId)?.indexes.find((item: SchemaIndex) => item.id === indexId); if (!index) return; const fieldIds: string[] = index.fieldIds.includes(fieldId) ? index.fieldIds.filter((id: string) => id !== fieldId) : [...index.fieldIds, fieldId]; if (fieldIds.length === 0) return; updateIndex(tableId, indexId, { fieldIds }); }

  /** Reorders one field inside a composite index. */
  function moveIndexField(tableId: string, indexId: string, fieldId: string, offset: number): void { const index: SchemaIndex | undefined = tables.value.find((table: SchemaTable) => table.id === tableId)?.indexes.find((item: SchemaIndex) => item.id === indexId); const sourceIndex: number = index?.fieldIds.indexOf(fieldId) ?? -1; const targetIndex: number = sourceIndex + offset; if (!index || sourceIndex < 0 || targetIndex < 0 || targetIndex >= index.fieldIds.length) return; commit(); const [id]: string[] = index.fieldIds.splice(sourceIndex, 1); index.fieldIds.splice(targetIndex, 0, id); }

  /** Deletes an ordinary or unique index. */
  function deleteIndex(tableId: string, indexId: string): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); if (!table) return; commit(); table.indexes = table.indexes.filter((index: SchemaIndex) => index.id !== indexId); }

  /** Removes a field and all invalidated relation pairs. */
  function deleteField(tableId: string, fieldId: string): void { const table: SchemaTable | undefined = tables.value.find((item: SchemaTable) => item.id === tableId); if (!table || table.fields.length === 1) return; commit(); table.fields = table.fields.filter((field: SchemaField) => field.id !== fieldId); table.indexes = table.indexes.map((index: SchemaIndex) => ({ ...index, fieldIds: index.fieldIds.filter((id: string) => id !== fieldId) })).filter((index: SchemaIndex) => index.fieldIds.length > 0); relations.value = relations.value.map((relation: SchemaRelation) => { const pairs: Array<[string, string]> = relation.sourceFieldIds.map((sourceId: string, index: number): [string, string] => [sourceId, relation.targetFieldIds[index]]).filter((pair: [string, string]) => !(relation.sourceTableId === tableId && pair[0] === fieldId) && !(relation.targetTableId === tableId && pair[1] === fieldId)); relation.sourceFieldIds = pairs.map((pair: [string, string]) => pair[0]); relation.targetFieldIds = pairs.map((pair: [string, string]) => pair[1]); return relation; }).filter((relation: SchemaRelation) => relation.sourceFieldIds.length > 0); }

  /**
   * Validates whether two fields can form a new relationship.
   *
   * @param sourceTableId source table identifier
   * @param sourceFieldId source field identifier
   * @param targetTableId target table identifier
   * @param targetFieldId target field identifier
   * @returns null when valid or a user-facing validation message
   */
  function relationError(sourceTableId: string, sourceFieldId: string, targetTableId: string, targetFieldId: string): string | null {
    const sourceTable: SchemaTable | undefined = tables.value.find((table: SchemaTable) => table.id === sourceTableId);
    const targetTable: SchemaTable | undefined = tables.value.find((table: SchemaTable) => table.id === targetTableId);
    const sourceField: SchemaField | undefined = sourceTable?.fields.find((field: SchemaField) => field.id === sourceFieldId);
    const targetField: SchemaField | undefined = targetTable?.fields.find((field: SchemaField) => field.id === targetFieldId);

    if (!sourceField || !targetField)
      return "The relationship endpoint no longer exists.";

    if (sourceTableId === targetTableId && sourceFieldId === targetFieldId)
      return "A field cannot be related to itself.";

    if (relationshipTypeFamily(sourceField.type) !== relationshipTypeFamily(targetField.type))
      return `Incompatible field types: ${sourceField.type} and ${targetField.type}.`;

    const duplicate: boolean = relations.value.some((relation: SchemaRelation) => {
      return relation.sourceFieldIds.some((fieldId: string, index: number) => {
        const sameDirection: boolean = relation.sourceTableId === sourceTableId && fieldId === sourceFieldId && relation.targetTableId === targetTableId && relation.targetFieldIds[index] === targetFieldId;
        const reverseDirection: boolean = relation.sourceTableId === targetTableId && fieldId === targetFieldId && relation.targetTableId === sourceTableId && relation.targetFieldIds[index] === sourceFieldId;

        return sameDirection || reverseDirection;
      });
    });

    if (duplicate)
      return "This relationship already exists.";

    return null;
  }

  /**
   * Connects two compatible fields with an inferred relationship.
   *
   * @param sourceTableId source table identifier
   * @param sourceFieldId source field identifier
   * @param targetTableId target table identifier
   * @param targetFieldId target field identifier
   * @returns null when created or a validation message
   */
  function addRelation(sourceTableId: string, sourceFieldId: string, targetTableId: string, targetFieldId: string): string | null {
    const error: string | null = relationError(sourceTableId, sourceFieldId, targetTableId, targetFieldId);

    if (error)
      return error;

    const sourceField: SchemaField = tables.value.find((table: SchemaTable) => table.id === sourceTableId)?.fields.find((field: SchemaField) => field.id === sourceFieldId) as SchemaField;
    const targetField: SchemaField = tables.value.find((table: SchemaTable) => table.id === targetTableId)?.fields.find((field: SchemaField) => field.id === targetFieldId) as SchemaField;
    const relation: SchemaRelation = {
      id: createId(),
      sourceTableId,
      sourceFieldIds: [sourceFieldId],
      targetTableId,
      targetFieldIds: [targetFieldId],
      cardinality: inferCardinality(sourceField, targetField),
      constraintName: "",
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    };
    commit();
    relations.value.push(relation);
    selectedElements.value = [{ type: "relation", id: relation.id }];

    return null;
  }

  /** Adds a source/target field pair to a composite foreign key. */
  function addRelationPair(relationId: string, sourceFieldId: string, targetFieldId: string): void { const relation: SchemaRelation | undefined = relations.value.find((item: SchemaRelation) => item.id === relationId); if (!relation || relation.sourceFieldIds.includes(sourceFieldId) || relation.targetFieldIds.includes(targetFieldId)) return; commit(); relation.sourceFieldIds.push(sourceFieldId); relation.targetFieldIds.push(targetFieldId); }

  /** Removes one pair from a composite foreign key. */
  function deleteRelationPair(relationId: string, index: number): void { const relation: SchemaRelation | undefined = relations.value.find((item: SchemaRelation) => item.id === relationId); if (!relation || relation.sourceFieldIds.length <= 1 || index < 0 || index >= relation.sourceFieldIds.length) return; commit(); relation.sourceFieldIds.splice(index, 1); relation.targetFieldIds.splice(index, 1); }

  /** Deletes a selected relationship. */
  function deleteRelation(relationId: string): void { if (!relations.value.some((relation: SchemaRelation) => relation.id === relationId)) return; commit(); relations.value = relations.value.filter((relation: SchemaRelation) => relation.id !== relationId); selectedElements.value = selectedElements.value.filter((element: ElementReference) => !(element.type === "relation" && element.id === relationId)); }

  /** Updates a relationship while preserving a reversible history entry. */
  function updateRelation(relationId: string, values: Partial<Omit<SchemaRelation, "id">>): void { const relation: SchemaRelation | undefined = relations.value.find((item: SchemaRelation) => item.id === relationId); if (!relation) return; commit(); Object.assign(relation, values); }

  /** Repositions tables using their actual foreign-key graph through Dagre. */
  function autoArrange(): void { if (tables.value.length === 0) return; commit(); const graph = new graphlib.Graph(); graph.setGraph({ rankdir: "LR", nodesep: 74, ranksep: 150, marginx: 80, marginy: 80 }); graph.setDefaultEdgeLabel(() => ({})); tables.value.forEach((table: SchemaTable) => graph.setNode(table.id, { width: table.width, height: tableHeight(table) })); relations.value.forEach((relation: SchemaRelation) => graph.setEdge(relation.targetTableId, relation.sourceTableId)); layout(graph); tables.value.forEach((table: SchemaTable) => { const node: { x: number; y: number; width: number; height: number } = graph.node(table.id); table.x = Math.round(node.x - node.width / 2); table.y = Math.round(node.y - node.height / 2); }); }

  /** Moves one history entry from undo to redo. */
  function undo(): void { const previous: SchemaDiagram | undefined = undoStack.value.pop(); if (!previous) return; redoStack.value.push(snapshot(currentDiagram())); apply(previous); }

  /** Moves one history entry from redo back to undo. */
  function redo(): void { const next: SchemaDiagram | undefined = redoStack.value.pop(); if (!next) return; undoStack.value.push(snapshot(currentDiagram())); apply(next); }

  /**
   * Selects one canvas element through the unified selection model.
   *
   * @param reference target element or null to clear selection
   * @param additive whether to toggle the element without clearing others
   */
  function selectElement(reference: ElementReference | null, additive: boolean = false): void {
    if (!reference) {
      selectedElements.value = [];

      return;
    }

    if (!additive || reference.type === "relation") {
      selectedElements.value = [reference];

      return;
    }

    const exists: boolean = selectedElements.value.some((element: ElementReference) => element.type === reference.type && element.id === reference.id);
    selectedElements.value = exists
      ? selectedElements.value.filter((element: ElementReference) => element.type !== reference.type || element.id !== reference.id)
      : [...selectedElements.value.filter((element: ElementReference) => element.type !== "relation"), reference];
  }

  /**
   * Replaces or augments selection with multiple canvas elements.
   *
   * @param references elements found by marquee selection
   * @param additive whether to retain the current non-relation selection
   */
  function selectElements(references: ElementReference[], additive: boolean): void {
    const base: ElementReference[] = additive ? selectedElements.value.filter((element: ElementReference) => element.type !== "relation") : [];
    const unique: Map<string, ElementReference> = new Map<string, ElementReference>();

    [...base, ...references].forEach((element: ElementReference) => unique.set(`${element.type}:${element.id}`, element));
    selectedElements.value = [...unique.values()];
  }

  /** Selects one table, optionally retaining existing selection. */
  function selectTable(tableId: string | null, additive: boolean = false): void { selectElement(tableId ? { type: "table", id: tableId } : null, additive); }

  /** Replaces or augments table selection with a marquee result. */
  function selectTables(tableIds: string[], additive: boolean): void { selectElements(tableIds.map((id: string) => ({ type: "table", id })), additive); }

  /** Selects a relation and clears other element selection. */
  function selectRelation(relationId: string | null): void { selectElement(relationId ? { type: "relation", id: relationId } : null); }

  /** Selects an element and asks the canvas to reveal it, including repeated requests. */
  function locateElement(reference: ElementReference, additive: boolean = false): void { selectElement(reference, additive); navigationRequest.value = { reference, sequence: navigationRequest.value.sequence + 1 }; }

  /**
   * Returns movable elements fully covered by a diagram-space rectangle.
   *
   * @param rect marquee rectangle
   * @returns unified references for covered objects
   */
  function elementsInRect(rect: DiagramRect): ElementReference[] {
    const tableReferences: ElementReference[] = tables.value.filter((table: SchemaTable) => table.x >= rect.x && table.y >= rect.y && table.x + table.width <= rect.x + rect.width && table.y + tableHeight(table) <= rect.y + rect.height).map((table: SchemaTable) => ({ type: "table", id: table.id }));
    const areaReferences: ElementReference[] = areas.value.filter((area: SchemaArea) => area.x >= rect.x && area.y >= rect.y && area.x + area.width <= rect.x + rect.width && area.y + area.height <= rect.y + rect.height).map((area: SchemaArea) => ({ type: "area", id: area.id }));
    const noteReferences: ElementReference[] = notes.value.filter((note: SchemaNote) => note.x >= rect.x && note.y >= rect.y && note.x + note.width <= rect.x + rect.width && note.y + note.height <= rect.y + rect.height).map((note: SchemaNote) => ({ type: "note", id: note.id }));

    return [...areaReferences, ...tableReferences, ...noteReferences];
  }

  /**
   * Deletes all selected canvas elements as one history entry.
   */
  function deleteSelectedElements(): void {
    if (selectedElements.value.length === 0)
      return;

    const tableIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "table").map((element: ElementReference) => element.id));
    const relationIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "relation").map((element: ElementReference) => element.id));
    const areaIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "area").map((element: ElementReference) => element.id));
    const noteIds: Set<string> = new Set(selectedElements.value.filter((element: ElementReference) => element.type === "note").map((element: ElementReference) => element.id));
    commit();
    tables.value = tables.value.filter((table: SchemaTable) => !tableIds.has(table.id));
    areas.value = areas.value.filter((area: SchemaArea) => !areaIds.has(area.id));
    notes.value = notes.value.filter((note: SchemaNote) => !noteIds.has(note.id));
    relations.value = relations.value.filter((relation: SchemaRelation) => !relationIds.has(relation.id) && !tableIds.has(relation.sourceTableId) && !tableIds.has(relation.targetTableId));
    selectedElements.value = [];
  }

  /** Produces an exchangeable JSON representation. */
  function exportJson(): string { return JSON.stringify(snapshot(currentDiagram()), null, 2); }

  /** Parses and loads a validated diagram JSON document. */
  function importJson(source: string): string | null { try { const diagram: unknown = JSON.parse(source); if (!isSchemaDiagram(diagram)) return "JSON does not match the schema diagram format."; commit(); apply(diagram); return null; } catch { return "The selected file is not valid JSON."; } }

  /** Saves the current diagram as a browser-local draft. */
  function saveLocalDraft(): void { window.localStorage.setItem(LOCAL_DRAFT_KEY, exportJson()); }

  /** Loads the browser-local draft. */
  function loadLocalDraft(): string | null { const source: string | null = window.localStorage.getItem(LOCAL_DRAFT_KEY); if (!source) return "No local draft has been saved in this browser."; return importJson(source); }

  return { dialect, enums, customTypes, notes, areas, tables, relations, selectedElements, navigationRequest, selectedTableIds, selectedRelationId, selectedAreaId, selectedNoteId, selectedTable, selectedRelation, selectedArea, selectedNote, canUndo, canRedo, setDialect, addEnum, updateEnum, deleteEnum, addCustomType, updateCustomType, deleteCustomType, addNote, updateNote, moveNote, resizeNote, deleteNote, addArea, updateArea, moveArea, resizeArea, deleteArea, moveSelectedElements, addTable, updateTable, duplicateTable, setSelectedTablesLocked, copySelectedElements, pasteSelectedElements, moveTables, deleteTable, deleteSelectedTables, deleteSelectedElements, arrangeSelected, addField, updateField, moveField, moveFieldTo, addIndex, updateIndex, toggleIndexField, moveIndexField, deleteIndex, deleteField, relationError, addRelation, addRelationPair, deleteRelationPair, deleteRelation, updateRelation, autoArrange, undo, redo, selectElement, selectElements, selectTable, selectTables, selectRelation, locateElement, elementsInRect, exportJson, importJson, replaceDiagram, saveLocalDraft, loadLocalDraft };
});
