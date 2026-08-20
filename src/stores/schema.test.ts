import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { SchemaTable } from "../types/schema";
import { useSchemaStore } from "./schema";

describe("schema store", () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  /**
   * Verifies that a newly created table can be restored through history.
   */
  it("adds a table and restores it with undo and redo", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const initialCount: number = schema.tables.length;

    schema.addTable({ x: 320, y: 240 });

    expect(schema.tables).toHaveLength(initialCount + 1);
    expect(schema.canUndo).toBe(true);

    schema.undo();

    expect(schema.tables).toHaveLength(initialCount);
    expect(schema.canRedo).toBe(true);

    schema.redo();

    expect(schema.tables).toHaveLength(initialCount + 1);
  });

  /**
   * Verifies that deleting a table also removes its connected relationships.
   */
  it("removes connected relationships when deleting a table", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];

    expect(schema.relations.some((relation) => relation.sourceTableId === table.id || relation.targetTableId === table.id)).toBe(true);

    schema.deleteTable(table.id);

    expect(schema.tables.some((item) => item.id === table.id)).toBe(false);
    expect(schema.relations.some((relation) => relation.sourceTableId === table.id || relation.targetTableId === table.id)).toBe(false);
  });

  /**
   * Verifies that a JSON exchange document preserves the diagram model.
   */
  it("exports and imports a diagram", (): void => {
    const source: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const exported: string = source.exportJson();
    const targetPinia = createPinia();

    setActivePinia(targetPinia);

    const target: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const error: string | null = target.importJson(exported);

    expect(error).toBeNull();
    expect(target.tables).toEqual(source.tables);
    expect(target.relations).toEqual(source.relations);
  });

  /**
   * Verifies relationship type validation, duplicate detection, and cardinality inference.
   */
  it("validates and creates field relationships", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const users: SchemaTable = schema.tables.find((table: SchemaTable) => table.name === "users") as SchemaTable;
    const orders: SchemaTable = schema.tables.find((table: SchemaTable) => table.name === "orders") as SchemaTable;
    const userId = users.fields.find((field) => field.name === "id");
    const userEmail = users.fields.find((field) => field.name === "email");
    const orderId = orders.fields.find((field) => field.name === "id");
    const orderUserId = orders.fields.find((field) => field.name === "user_id");
    const orderTotal = orders.fields.find((field) => field.name === "total");

    expect(userId && orderId && userEmail && orderUserId && orderTotal).toBeTruthy();
    expect(schema.relationError(orders.id, orderTotal?.id as string, users.id, userEmail?.id as string)).toContain("Incompatible");
    expect(schema.relationError(orders.id, orderUserId?.id as string, users.id, userId?.id as string)).toContain("already exists");
    expect(schema.relationError(users.id, userId?.id as string, orders.id, orderUserId?.id as string)).toContain("already exists");

    const error: string | null = schema.addRelation(orders.id, orderId?.id as string, users.id, userId?.id as string);

    expect(error).toBeNull();
    expect(schema.selectedRelation?.cardinality).toBe("one-to-one");
  });

  /**
   * Verifies unified mixed selection and movement for tables and areas.
   */
  it("moves selected tables and areas as one undoable operation", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];
    const area = schema.addArea({ x: 40, y: 60 });
    const originalTableX: number = table.x;

    schema.selectTable(table.id, true);
    schema.moveSelectedElements({ x: 25, y: 15 }, true);

    expect(schema.selectedElements).toEqual(expect.arrayContaining([{ type: "area", id: area.id }, { type: "table", id: table.id }]));
    expect(area.x).toBe(65);
    expect(table.x).toBe(originalTableX + 25);

    schema.undo();

    expect(schema.areas[0].x).toBe(40);
    expect(schema.tables[0].x).toBe(originalTableX);
  });

  /**
   * Verifies that marquee selection returns unified table and area references.
   */
  it("collects tables and areas inside a selection rectangle", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];
    const area = schema.addArea({ x: 20, y: 30 });
    const references = schema.elementsInRect({ x: 0, y: 0, width: 500, height: 500 });

    expect(references).toEqual(expect.arrayContaining([{ type: "table", id: table.id }, { type: "area", id: area.id }]));
  });

  /**
   * Verifies area resizing, locking, deletion, and history restoration.
   */
  it("completes the area editing lifecycle", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const area = schema.addArea({ x: 100, y: 120 });

    schema.resizeArea(area.id, { x: 90, y: 100, width: 420, height: 280 }, true);
    expect(area).toMatchObject({ x: 90, y: 100, width: 420, height: 280 });

    schema.updateArea(area.id, { locked: true });
    schema.moveSelectedElements({ x: 50, y: 50 }, true);
    expect(area).toMatchObject({ x: 90, y: 100 });

    schema.deleteArea(area.id);
    expect(schema.areas).toHaveLength(0);

    schema.undo();
    expect(schema.areas).toHaveLength(1);
  });

  /**
   * Verifies note creation, mixed movement, resizing, locking, deletion, and history.
   */
  it("completes the note editing lifecycle", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];
    const note = schema.addNote({ x: 80, y: 90 });
    const originalTableX: number = table.x;

    expect(schema.selectedNoteId).toBe(note.id);
    expect(note).toMatchObject({ width: 210, height: 120, locked: false });

    schema.selectTable(table.id, true);
    schema.moveSelectedElements({ x: 20, y: 15 }, true);

    expect(note).toMatchObject({ x: 100, y: 105 });
    expect(table.x).toBe(originalTableX + 20);

    schema.resizeNote(note.id, { x: 90, y: 95, width: 260, height: 160 }, true);
    expect(note).toMatchObject({ x: 90, y: 95, width: 260, height: 160 });

    schema.updateNote(note.id, { locked: true });
    schema.moveSelectedElements({ x: 50, y: 50 }, true);
    expect(note).toMatchObject({ x: 90, y: 95 });

    schema.deleteNote(note.id);
    expect(schema.notes).toHaveLength(0);

    schema.undo();
    expect(schema.notes).toHaveLength(1);
  });

  /**
   * Verifies that marquee selection includes notes using their stored dimensions.
   */
  it("collects notes inside a selection rectangle", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const note = schema.addNote({ x: 30, y: 40 });
    const references = schema.elementsInRect({ x: 0, y: 0, width: 300, height: 220 });

    expect(references).toContainEqual({ type: "note", id: note.id });
  });

  /**
   * Verifies table width bounds, composite primary keys, and absolute field sorting.
   */
  it("edits advanced table properties", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];
    const secondFieldId: string = table.fields[1].id;

    schema.updateTable(table.id, { width: 900 });
    expect(table.width).toBe(560);

    schema.updateField(table.id, secondFieldId, { primary: true, nullable: true });
    expect(table.fields[1]).toMatchObject({ primary: true, nullable: false });

    schema.moveFieldTo(table.id, secondFieldId, 0);
    expect(table.fields[0].id).toBe(secondFieldId);
  });

  /**
   * Verifies composite index membership, ordering, and cleanup after field deletion.
   */
  it("manages composite indexes through the full lifecycle", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const table: SchemaTable = schema.tables[0];
    const firstFieldId: string = table.fields[0].id;
    const secondFieldId: string = table.fields[1].id;

    schema.addIndex(table.id, false);
    const index = table.indexes[0];
    schema.toggleIndexField(table.id, index.id, secondFieldId);
    expect(index.fieldIds).toEqual([firstFieldId, secondFieldId]);

    schema.moveIndexField(table.id, index.id, secondFieldId, -1);
    expect(index.fieldIds).toEqual([secondFieldId, firstFieldId]);

    schema.updateIndex(table.id, index.id, { unique: true });
    expect(index.unique).toBe(true);

    schema.deleteField(table.id, secondFieldId);
    expect(table.indexes[0].fieldIds).toEqual([firstFieldId]);
  });

  /**
   * Verifies duplication remaps nested identities and bulk locking is undoable.
   */
  it("duplicates and batch-locks selected tables", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const source: SchemaTable = schema.tables[0];
    schema.addIndex(source.id, true);
    const duplicate = schema.duplicateTable(source.id);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.width).toBe(source.width);
    expect(duplicate?.fields.map((field) => field.id)).not.toEqual(source.fields.map((field) => field.id));
    expect(duplicate?.indexes[0].fieldIds[0]).toBe(duplicate?.fields[0].id);

    schema.selectTable(source.id, true);
    schema.setSelectedTablesLocked(true);
    expect(source.locked).toBe(true);
    expect(duplicate?.locked).toBe(true);

    schema.undo();
    expect(schema.tables.every((table: SchemaTable) => !table.locked)).toBe(true);
  });

  /**
   * Verifies navigation requests select targets and repeat for the same object.
   */
  it("publishes repeatable element location requests", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const first: SchemaTable = schema.tables[0];
    const second: SchemaTable = schema.tables[1];

    schema.locateElement({ type: "table", id: first.id });
    const firstSequence: number = schema.navigationRequest.sequence;
    schema.locateElement({ type: "table", id: first.id });

    expect(schema.navigationRequest.sequence).toBe(firstSequence + 1);
    expect(schema.selectedTableIds).toEqual([first.id]);

    schema.locateElement({ type: "table", id: second.id }, true);
    expect(schema.selectedTableIds).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  /**
   * Verifies clipboard paste remaps tables, fields, indexes, and internal relations.
   */
  it("copies and pastes a connected table selection", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const originalTableIds: Set<string> = new Set(schema.tables.map((table: SchemaTable) => table.id));
    const initialRelationCount: number = schema.relations.length;
    schema.selectElements(schema.tables.map((table: SchemaTable) => ({ type: "table", id: table.id })), false);

    expect(schema.copySelectedElements()).toBe(2);

    const pasted = schema.pasteSelectedElements({ x: 50, y: 40 });
    const pastedTables: SchemaTable[] = schema.tables.filter((table: SchemaTable) => !originalTableIds.has(table.id));

    expect(pasted).toHaveLength(2);
    expect(pastedTables).toHaveLength(2);
    expect(schema.relations).toHaveLength(initialRelationCount + 1);
    expect(schema.relations.at(-1)?.sourceTableId).toBe(pastedTables.find((table: SchemaTable) => table.name.startsWith("orders"))?.id);
    expect(schema.relations.at(-1)?.targetFieldIds[0]).toBe(pastedTables.find((table: SchemaTable) => table.name.startsWith("users"))?.fields[0].id);

    schema.undo();
    expect(schema.tables).toHaveLength(2);
    expect(schema.relations).toHaveLength(initialRelationCount);
  });

  /**
   * Verifies copied areas and notes receive fresh identities and unlocked offsets.
   */
  it("copies and pastes mixed canvas annotations", (): void => {
    const schema: ReturnType<typeof useSchemaStore> = useSchemaStore();
    const area = schema.addArea({ x: 10, y: 20 });
    const note = schema.addNote({ x: 30, y: 40 });
    schema.updateArea(area.id, { locked: true });
    schema.updateNote(note.id, { locked: true });
    schema.selectElements([{ type: "area", id: area.id }, { type: "note", id: note.id }], false);
    schema.copySelectedElements();
    schema.pasteSelectedElements();

    expect(schema.areas).toHaveLength(2);
    expect(schema.notes).toHaveLength(2);
    expect(schema.areas[1]).toMatchObject({ x: 42, y: 52, locked: false });
    expect(schema.notes[1]).toMatchObject({ x: 62, y: 72, locked: false });
  });
});
