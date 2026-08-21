<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useSchemaStore } from "../stores/schema";
import type {
  DiagramPoint,
  DiagramRect,
  ElementReference,
  SchemaArea as SchemaAreaModel,
  SchemaDiagram,
  SchemaField,
  SchemaNote as SchemaNoteModel,
  SchemaRelation,
  SchemaTable as SchemaTableModel,
} from "../types/schema";
import { exportDbml, parseDbml } from "../utils/dbml";
import {
  downloadBlob,
  downloadJpeg,
  downloadPng,
  downloadWebp,
  exportMarkdown,
  exportMermaid,
  exportSvg,
} from "../utils/exchange";
import { parseSqlDdl } from "../utils/sqlImport";
import { showFeedback } from "../utils/feedback";
import SchemaArea from "./SchemaArea.vue";
import SchemaNote from "./SchemaNote.vue";
import SchemaTable from "./SchemaTable.vue";

interface DragState {
  kind: "table" | "note" | "area";
  ids: string[];
  lastPoint: DiagramPoint;
}

interface PanState {
  start: DiagramPoint;
  origin: DiagramPoint;
}

interface SelectionState {
  start: DiagramPoint;
  end: DiagramPoint;
  additive: boolean;
}

interface RelationDragState {
  pointerId: number;
  sourceTableId: string;
  sourceFieldId: string;
  pointer: DiagramPoint;
  targetTableId: string | null;
  targetFieldId: string | null;
  targetError: string | null;
}

type AreaResizeDirection =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface AreaResizeState {
  areaId: string;
  direction: AreaResizeDirection;
  start: DiagramPoint;
  original: DiagramRect;
}

interface NoteResizeState {
  noteId: string;
  direction: AreaResizeDirection;
  start: DiagramPoint;
  original: DiagramRect;
}

interface RenderableRelation {
  relation: SchemaRelation;
  paths: string[];
  label: string;
  labelPoint: DiagramPoint;
}

const schema = useSchemaStore();
const canvasRef = ref<HTMLElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const dbmlInput = ref<HTMLInputElement | null>(null);
const sqlInput = ref<HTMLInputElement | null>(null);
const zoom = ref<number>(1);
const pan = ref<DiagramPoint>({ x: 0, y: 0 });
const canvasSize = ref<DiagramPoint>({ x: 0, y: 0 });
const isFullscreen = ref<boolean>(false);
const spacePressed = ref<boolean>(false);
const drag = ref<DragState | null>(null);
const panning = ref<PanState | null>(null);
const selection = ref<SelectionState | null>(null);
const relationMode = ref<boolean>(false);
const relationDrag = ref<RelationDragState | null>(null);
const areaResize = ref<AreaResizeState | null>(null);
const noteResize = ref<NoteResizeState | null>(null);
const message = ref<string>("");
const minimapScale: number = 0.08;
const gridSize: number = 24;
let canvasResizeObserver: ResizeObserver | null = null;

/** Publishes feedback both as a transient toast and the accessible canvas status. */
function notify(content: string, isError: boolean = false): void {
  message.value = content;
  showFeedback(content, isError);
}

const linkSourceKey = computed<string | null>(() =>
  relationDrag.value
    ? `${relationDrag.value.sourceTableId}:${relationDrag.value.sourceFieldId}`
    : null,
);
const linkTargetKey = computed<string | null>(() =>
  relationDrag.value?.targetTableId && relationDrag.value.targetFieldId
    ? `${relationDrag.value.targetTableId}:${relationDrag.value.targetFieldId}`
    : null,
);
const linkTargetValid = computed<boolean>(
  () => relationDrag.value?.targetError === null,
);
const relationPreviewPath = computed<string | null>(() => {
  if (!relationDrag.value) return null;

  const source: DiagramPoint | null = fieldAnchor(
    relationDrag.value.sourceTableId,
    relationDrag.value.sourceFieldId,
    relationDrag.value.pointer.x,
  );

  if (!source) 
    return null;

  const middleX: number = (source.x + relationDrag.value.pointer.x) / 2;

  return `M ${source.x} ${source.y} H ${middleX} V ${relationDrag.value.pointer.y} H ${relationDrag.value.pointer.x}`;
});
const relations = computed<RenderableRelation[]>(() =>
  schema.relations.map((relation: SchemaRelation) => toRenderableRelation(relation))
    .filter(
      (relation: RenderableRelation | null): relation is RenderableRelation =>
        relation !== null,
    ),
);
const selectionStyle = computed<Record<string, string> | null>(() => {
  if (!selection.value) return null;

  const left: number = Math.min(selection.value.start.x, selection.value.end.x);
  const top: number = Math.min(selection.value.start.y, selection.value.end.y);
  const width: number = Math.abs(
    selection.value.start.x - selection.value.end.x,
  );
  const height: number = Math.abs(
    selection.value.start.y - selection.value.end.y,
  );

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
});
const minimapViewportStyle = computed<Record<string, string>>(() => ({
  left: `${(-pan.value.x / zoom.value) * minimapScale}px`,
  top: `${(-pan.value.y / zoom.value) * minimapScale}px`,
  width: `${(canvasSize.value.x / zoom.value) * minimapScale}px`,
  height: `${(canvasSize.value.y / zoom.value) * minimapScale}px`,
}));

/** Converts browser coordinates to the unscaled diagram coordinate system. */
function toDiagramPoint(event: PointerEvent | WheelEvent): DiagramPoint {
  const bounds: DOMRect | undefined = canvasRef.value?.getBoundingClientRect();

  if (!bounds) return { x: 0, y: 0 };

  return {
    x: (event.clientX - bounds.left - pan.value.x) / zoom.value,
    y: (event.clientY - bounds.top - pan.value.y) / zoom.value,
  };
}

/** Adds a new table at the centre of the current viewport. */
function addTable(): void {
  const canvas: HTMLElement | null = canvasRef.value;

  if (!canvas) return;

  schema.addTable(
    snapPoint({
      x: (canvas.clientWidth / 2 - pan.value.x) / zoom.value - 130,
      y: (canvas.clientHeight / 2 - pan.value.y) / zoom.value - 80,
    }),
  );
}

/** Snaps a diagram point to the visible grid when the option is enabled. */
function snapPoint(point: DiagramPoint): DiagramPoint {
  return schema.editorSettings.snapToGrid
    ? {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    }
    : point;
}

/** Starts a single history operation then tracks the table with Pointer Events. */
function beginDrag(event: PointerEvent, tableId: string): void {
  if (event.button !== 0) return;

  const table: SchemaTableModel | undefined = schema.tables.find(
    (item: SchemaTableModel) => item.id === tableId,
  );

  if (!table) return;

  if (table.locked) return;

  if (!schema.selectedTableIds.includes(tableId)) schema.selectTable(tableId);

  const point: DiagramPoint = toDiagramPoint(event);
  schema.moveSelectedElements({ x: 0, y: 0 }, true);
  drag.value = { kind: "table", ids: [tableId], lastPoint: point };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/** Starts panning when the user drags an empty part of the canvas. */
function beginPan(event: PointerEvent): void {
  if (event.button === 0 && !spacePressed.value) {
    const point: DiagramPoint = toDiagramPoint(event);
    selection.value = {
      start: point,
      end: point,
      additive: event.ctrlKey || event.metaKey,
    };
    canvasRef.value?.setPointerCapture(event.pointerId);

    return;
  }

  if (
    event.button !== 1 &&
    event.button !== 2 &&
    !(event.button === 0 && spacePressed.value)
  )
    return;

  panning.value = {
    start: { x: event.clientX, y: event.clientY },
    origin: { ...pan.value },
  };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/** Moves either the current table or the diagram viewport. */
function handlePointerMove(event: PointerEvent): void {
  if (relationDrag.value) {
    relationDrag.value.pointer = toDiagramPoint(event);
    updateRelationTarget(event);

    return;
  }

  if (areaResize.value) {
    resizeSelectedArea(toDiagramPoint(event));

    return;
  }

  if (noteResize.value) {
    resizeSelectedNote(toDiagramPoint(event));

    return;
  }

  if (drag.value) {
    const point: DiagramPoint = toDiagramPoint(event);
    const delta: DiagramPoint = {
      x: point.x - drag.value.lastPoint.x,
      y: point.y - drag.value.lastPoint.y,
    };
    schema.moveSelectedElements(delta);
    drag.value.lastPoint = point;

    return;
  }

  if (selection.value) {
    selection.value.end = toDiagramPoint(event);

    return;
  }

  if (!panning.value) return;

  pan.value = {
    x: panning.value.origin.x + event.clientX - panning.value.start.x,
    y: panning.value.origin.y + event.clientY - panning.value.start.y,
  };
}

/** Adds a note at the centre of the viewport. */
function addNote(): void {
  const canvas: HTMLElement | null = canvasRef.value;
  if (!canvas) return;
  schema.addNote(
    snapPoint({
      x: (canvas.clientWidth / 2 - pan.value.x) / zoom.value - 100,
      y: (canvas.clientHeight / 2 - pan.value.y) / zoom.value - 60,
    }),
  );
}

/** Adds a visual grouping area at the centre of the viewport. */
function addArea(): void {
  const canvas: HTMLElement | null = canvasRef.value;
  if (!canvas) return;
  schema.addArea(
    snapPoint({
      x: (canvas.clientWidth / 2 - pan.value.x) / zoom.value - 180,
      y: (canvas.clientHeight / 2 - pan.value.y) / zoom.value - 120,
    }),
  );
}

/** Begins moving a note and any other selected movable elements. */
function beginNoteDrag(event: PointerEvent, noteId: string): void {
  if (event.button !== 0) return;
  const note: SchemaNoteModel | undefined = schema.notes.find(
    (item: SchemaNoteModel) => item.id === noteId,
  );
  if (!note || note.locked) return;
  if (
    !schema.selectedElements.some(
      (element: ElementReference) =>
        element.type === "note" && element.id === noteId,
    )
  )
    schema.selectElement({ type: "note", id: noteId });
  schema.moveSelectedElements({ x: 0, y: 0 }, true);
  drag.value = {
    kind: "note",
    ids: [noteId],
    lastPoint: toDiagramPoint(event),
  };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/** Starts an undoable note resize gesture from one corner. */
function beginNoteResize(
  event: PointerEvent,
  noteId: string,
  direction: AreaResizeDirection,
): void {
  if (event.button !== 0) return;
  const note: SchemaNoteModel | undefined = schema.notes.find(
    (item: SchemaNoteModel) => item.id === noteId,
  );
  if (!note || note.locked) return;
  const original: DiagramRect = {
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
  };
  schema.selectElement({ type: "note", id: noteId });
  schema.resizeNote(noteId, original, true);
  noteResize.value = {
    noteId,
    direction,
    start: toDiagramPoint(event),
    original,
  };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/** Applies the active note corner resize with readable minimum dimensions. */
function resizeSelectedNote(point: DiagramPoint): void {
  const active: NoteResizeState | null = noteResize.value;
  if (!active) return;
  const minimumWidth: number = 120;
  const minimumHeight: number = 88;
  const deltaX: number = point.x - active.start.x;
  const deltaY: number = point.y - active.start.y;
  const rect: DiagramRect = { ...active.original };
  if (active.direction.includes("right"))
    rect.width = Math.max(minimumWidth, active.original.width + deltaX);
  else {
    rect.width = Math.max(minimumWidth, active.original.width - deltaX);
    rect.x = active.original.x + active.original.width - rect.width;
  }
  if (active.direction.includes("bottom"))
    rect.height = Math.max(minimumHeight, active.original.height + deltaY);
  else {
    rect.height = Math.max(minimumHeight, active.original.height - deltaY);
    rect.y = active.original.y + active.original.height - rect.height;
  }
  schema.resizeNote(active.noteId, rect);
}

/**
 * Begins moving an area and any other selected movable elements.
 *
 * @param event primary pointer event
 * @param areaId target area identifier
 */
function beginAreaDrag(event: PointerEvent, areaId: string): void {
  if (event.button !== 0) return;

  const area: SchemaAreaModel | undefined = schema.areas.find(
    (item: SchemaAreaModel) => item.id === areaId,
  );

  if (!area || area.locked) return;

  if (
    !schema.selectedElements.some(
      (element: ElementReference) =>
        element.type === "area" && element.id === areaId,
    )
  )
    schema.selectElement({ type: "area", id: areaId });

  schema.moveSelectedElements({ x: 0, y: 0 }, true);
  drag.value = {
    kind: "area",
    ids: [areaId],
    lastPoint: toDiagramPoint(event),
  };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/**
 * Starts an undoable resize gesture from one area corner.
 *
 * @param event primary pointer event
 * @param areaId target area identifier
 * @param direction active resize corner
 */
function beginAreaResize(
  event: PointerEvent,
  areaId: string,
  direction: AreaResizeDirection,
): void {
  if (event.button !== 0) return;

  const area: SchemaAreaModel | undefined = schema.areas.find(
    (item: SchemaAreaModel) => item.id === areaId,
  );

  if (!area || area.locked) return;

  const original: DiagramRect = {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  };
  schema.selectElement({ type: "area", id: areaId });
  schema.resizeArea(areaId, original, true);
  areaResize.value = {
    areaId,
    direction,
    start: toDiagramPoint(event),
    original,
  };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/**
 * Applies the active corner resize with a minimum area size.
 *
 * @param point current diagram-space pointer position
 */
function resizeSelectedArea(point: DiagramPoint): void {
  const active: AreaResizeState | null = areaResize.value;

  if (!active) return;

  const minimumSize: number = 120;
  const deltaX: number = point.x - active.start.x;
  const deltaY: number = point.y - active.start.y;
  const rect: DiagramRect = { ...active.original };

  if (active.direction.includes("right"))
    rect.width = Math.max(minimumSize, active.original.width + deltaX);
  else {
    rect.width = Math.max(minimumSize, active.original.width - deltaX);
    rect.x = active.original.x + active.original.width - rect.width;
  }

  if (active.direction.includes("bottom"))
    rect.height = Math.max(minimumSize, active.original.height + deltaY);
  else {
    rect.height = Math.max(minimumSize, active.original.height - deltaY);
    rect.y = active.original.y + active.original.height - rect.height;
  }

  schema.resizeArea(active.areaId, rect);
}

/** Imports CREATE TABLE DDL for the currently selected database dialect. */
async function importSql(event: Event): Promise<void> {
  const input: HTMLInputElement = event.target as HTMLInputElement;
  const file: File | undefined = input.files?.[0];
  if (!file) return;
  try {
    schema.replaceDiagram(parseSqlDdl(await file.text(), schema.dialect));
    schema.autoArrange();
    fitView();
    notify("SQL DDL imported.");
  } catch (error: unknown) {
    notify(
      error instanceof Error
        ? `SQL import failed: ${error.message}`
        : "SQL import failed.",
      true,
    );
  }
  input.value = "";
}

/** Builds a serializable model snapshot for document and diagram exports. */
function exportDiagram(): SchemaDiagram {
  return {
    dialect: schema.dialect,
    enums: schema.enums,
    customTypes: schema.customTypes,
    notes: schema.notes,
    areas: schema.areas,
    tables: schema.tables,
    relations: schema.relations,
    name: schema.diagramName,
  };
}

/** Exports a standalone SVG snapshot of all visible diagram objects. */
function downloadSvg(): void {
  downloadBlob(
    new Blob([exportSvg(exportDiagram())], {
      type: "image/svg+xml;charset=utf-8",
    }),
    `${downloadName()}.svg`,
  );
}

/** Rasterizes the standalone SVG snapshot into the selected image format. */
async function exportRaster(format: "png" | "jpeg" | "webp"): Promise<void> {
  const svg: string = exportSvg(exportDiagram());

  try {
    if (format === "png") await downloadPng(svg, `${downloadName()}.png`);
    else if (format === "jpeg")
      await downloadJpeg(svg, `${downloadName()}.jpeg`);
    else await downloadWebp(svg, `${downloadName()}.webp`);
  } catch (error: unknown) {
    notify(
      error instanceof Error
        ? error.message
        : `${format.toUpperCase()} export failed.`,
      true,
    );
  }
}

/** Exports the current logical schema as a Markdown document. */
function downloadMarkdown(): void {
  downloadBlob(
    new Blob([exportMarkdown(exportDiagram())], {
      type: "text/markdown;charset=utf-8",
    }),
    `${downloadName()}.md`,
  );
}

/** Exports the logical entity relationships as Mermaid ER source. */
function downloadMermaid(): void {
  downloadBlob(
    new Blob([exportMermaid(exportDiagram())], {
      type: "text/plain;charset=utf-8",
    }),
    `${downloadName()}.mmd`,
  );
}

/** Ends a drag or pan gesture. */
function endPointerGesture(event: PointerEvent): void {
  if (relationDrag.value) {
    finishRelationDrag();

    if (canvasRef.value?.hasPointerCapture(event.pointerId))
      canvasRef.value.releasePointerCapture(event.pointerId);

    return;
  }

  if (selection.value) {
    const start: DiagramPoint = selection.value.start;
    const end: DiagramPoint = selection.value.end;
    schema.selectElements(
      schema.elementsInRect({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
      }),
      selection.value.additive,
    );
  }

  drag.value = null;
  panning.value = null;
  selection.value = null;
  areaResize.value = null;
  noteResize.value = null;

  if (canvasRef.value?.hasPointerCapture(event.pointerId))
    canvasRef.value.releasePointerCapture(event.pointerId);
}

/** Zooms towards the current cursor position while retaining that diagram location. */
function handleWheel(event: WheelEvent): void {
  const before: DiagramPoint = toDiagramPoint(event);
  const nextZoom: number = Math.min(
    1.8,
    Math.max(0.45, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)),
  );
  zoom.value = nextZoom;
  pan.value = {
    x:
      event.clientX -
      (canvasRef.value?.getBoundingClientRect().left ?? 0) -
      before.x * nextZoom,
    y:
      event.clientY -
      (canvasRef.value?.getBoundingClientRect().top ?? 0) -
      before.y * nextZoom,
  };
}

/** Changes zoom around the visible canvas centre. */
function setZoom(nextZoom: number): void {
  const canvas: HTMLElement | null = canvasRef.value;

  if (!canvas) return;

  const boundedZoom: number = Math.min(1.8, Math.max(0.45, nextZoom));
  const centre: DiagramPoint = {
    x: (canvas.clientWidth / 2 - pan.value.x) / zoom.value,
    y: (canvas.clientHeight / 2 - pan.value.y) / zoom.value,
  };
  zoom.value = boundedZoom;
  pan.value = {
    x: canvas.clientWidth / 2 - centre.x * boundedZoom,
    y: canvas.clientHeight / 2 - centre.y * boundedZoom,
  };
}

/** Restores the default canvas transform. */
function resetView(): void {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}

/** Enters or exits browser fullscreen for the canvas workspace. */
async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await canvasRef.value?.requestFullscreen();
}

/** Synchronizes the fullscreen button label with browser state. */
function handleFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === canvasRef.value;
}

/** Centres the canvas on the diagram coordinate clicked in the minimap. */
function navigateMinimap(event: PointerEvent): void {
  const canvas: HTMLElement | null = canvasRef.value;
  const bounds: DOMRect = (
    event.currentTarget as HTMLElement
  ).getBoundingClientRect();

  if (!canvas) return;

  const target: DiagramPoint = {
    x: (event.clientX - bounds.left) / minimapScale,
    y: (event.clientY - bounds.top) / minimapScale,
  };
  pan.value = {
    x: canvas.clientWidth / 2 - target.x * zoom.value,
    y: canvas.clientHeight / 2 - target.y * zoom.value,
  };
}

/**
 * Starts a relationship gesture from a field endpoint.
 *
 * @param event primary pointer event used for capture
 * @param tableId source table identifier
 * @param fieldId source field identifier
 */
function beginRelationDrag(
  event: PointerEvent,
  tableId: string,
  fieldId: string,
): void {
  if (!relationMode.value || event.button !== 0) return;

  relationDrag.value = {
    pointerId: event.pointerId,
    sourceTableId: tableId,
    sourceFieldId: fieldId,
    pointer: toDiagramPoint(event),
    targetTableId: null,
    targetFieldId: null,
    targetError: "Select a target field.",
  };
  notify("Drag to a compatible target field.");
  canvasRef.value?.setPointerCapture(event.pointerId);
}

/**
 * Updates the hovered relationship target beneath a captured pointer.
 *
 * @param event active pointer event
 */
function updateRelationTarget(event: PointerEvent): void {
  if (!relationDrag.value) return;

  const element: Element | null = document.elementFromPoint(
    event.clientX,
    event.clientY,
  );
  const fieldElement: HTMLElement | null =
    element?.closest<HTMLElement>("[data-table-id][data-field-id]") ?? null;
  const tableId: string | null = fieldElement?.dataset.tableId ?? null;
  const fieldId: string | null = fieldElement?.dataset.fieldId ?? null;

  relationDrag.value.targetTableId = tableId;
  relationDrag.value.targetFieldId = fieldId;
  relationDrag.value.targetError =
    tableId && fieldId
      ? schema.relationError(
        relationDrag.value.sourceTableId,
        relationDrag.value.sourceFieldId,
        tableId,
        fieldId,
      )
      : "Select a target field.";
}

/** Completes the active relationship gesture when its target is valid. */
function finishRelationDrag(): void {
  const active: RelationDragState | null = relationDrag.value;

  if (!active) return;

  if (active.targetTableId && active.targetFieldId && !active.targetError) {
    const error: string | null = schema.addRelation(
      active.sourceTableId,
      active.sourceFieldId,
      active.targetTableId,
      active.targetFieldId,
    );
    notify(error ?? "Relationship created.", Boolean(error));
  } else if (active.targetTableId && active.targetFieldId)
    notify(active.targetError ?? "Relationship could not be created.", true);
  else notify("Relationship creation cancelled.");

  relationDrag.value = null;
  relationMode.value = false;
}

/** Enables or cancels the relationship drag tool. */
function toggleRelationMode(): void {
  relationMode.value = !relationMode.value;
  relationDrag.value = null;
}

/**
 * Resolves a field row anchor on the side nearest the supplied horizontal point.
 *
 * @param tableId table containing the field
 * @param fieldId field whose row supplies the anchor
 * @param towardX horizontal point used to choose the table side
 * @returns diagram-space endpoint or null when the field no longer exists
 */
function fieldAnchor(
  tableId: string,
  fieldId: string,
  towardX: number,
): DiagramPoint | null {
  const table: SchemaTableModel | undefined = schema.tables.find(
    (item: SchemaTableModel) => item.id === tableId,
  );
  const fieldIndex: number =
    table?.fields.findIndex((field: SchemaField) => field.id === fieldId) ?? -1;

  if (!table || fieldIndex < 0) return null;

  return {
    x: towardX >= table.x + table.width / 2 ? table.x + table.width : table.x,
    y: table.y + 73 + fieldIndex * 35,
  };
}

/** Downloads the current schema in the editor JSON format. */
function downloadJson(): void {
  const blob: Blob = new Blob([schema.exportJson()], {
    type: "application/json",
  });
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement("a");
  anchor.href = url;
  anchor.download = `${downloadName()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Imports a user-selected JSON diagram. */
async function importJson(event: Event): Promise<void> {
  const file: File | undefined = (event.target as HTMLInputElement).files?.[0];

  if (!file) return;

  const result: string | null = schema.importJson(await file.text());
  notify(result ?? "Diagram loaded.", Boolean(result));
  (event.target as HTMLInputElement).value = "";
}

/** Downloads the current diagram as portable DBML text. */
function downloadDbml(): void {
  const blob: Blob = new Blob(
    [
      exportDbml({
        dialect: schema.dialect,
        enums: schema.enums,
        customTypes: schema.customTypes,
        notes: schema.notes,
        areas: schema.areas,
        tables: schema.tables,
        relations: schema.relations,
      }),
    ],
    { type: "text/plain;charset=utf-8" },
  );
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement("a");
  anchor.href = url;
  anchor.download = `${downloadName()}.dbml`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Replaces the diagram with the supported Table and Ref subset from a DBML file. */
async function importDbml(event: Event): Promise<void> {
  const input: HTMLInputElement = event.target as HTMLInputElement;
  const file: File | undefined = input.files?.[0];

  if (!file) return;

  try {
    schema.replaceDiagram(parseDbml(await file.text()));
    schema.autoArrange();
    fitView();
    notify("DBML diagram imported.");
  } catch (error: unknown) {
    notify(
      error instanceof Error
        ? `DBML import failed: ${error.message}`
        : "DBML import failed.",
      true,
    );
  }

  input.value = "";
}

/** Saves the schema to browser-local storage. */
function saveLocal(): void {
  const error: string | null = schema.saveLocalDraft();
  notify(error ?? "Local draft saved.", Boolean(error));
}

/** Returns a filesystem-safe document name for downloads. */
function downloadName(): string {
  return (
    schema.diagramName.trim().replace(/[<>:"/\\|?*]+/g, "-") ||
    "database-schema"
  );
}

/** Loads a browser-local schema draft. */
function loadLocal(): void {
  const error: string | null = schema.loadLocalDraft();
  notify(error ?? "Local draft loaded.", Boolean(error));
}

/** Fits every movable diagram object into the visible canvas with a small margin. */
function fitView(): void {
  const canvas: HTMLElement | null = canvasRef.value;
  const bounds: DiagramRect[] = [
    ...schema.tables.map((table: SchemaTableModel): DiagramRect => ({
      x: table.x,
      y: table.y,
      width: table.width,
      height: 49 + table.fields.length * 35,
    })),
    ...schema.areas.map((area: SchemaAreaModel): DiagramRect => ({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    })),
    ...schema.notes.map((note: SchemaNoteModel): DiagramRect => ({
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
    })),
  ];

  if (!canvas || bounds.length === 0) return;

  const minX: number = Math.min(...bounds.map((rect: DiagramRect) => rect.x));
  const minY: number = Math.min(...bounds.map((rect: DiagramRect) => rect.y));
  const maxX: number = Math.max(
    ...bounds.map((rect: DiagramRect) => rect.x + rect.width),
  );
  const maxY: number = Math.max(
    ...bounds.map((rect: DiagramRect) => rect.y + rect.height),
  );
  zoom.value = Math.min(
    1.3,
    Math.max(
      0.45,
      Math.min(
        (canvas.clientWidth - 100) / Math.max(1, maxX - minX),
        (canvas.clientHeight - 100) / Math.max(1, maxY - minY),
      ),
    ),
  );
  pan.value = {
    x: (canvas.clientWidth - (maxX + minX) * zoom.value) / 2,
    y: (canvas.clientHeight - (maxY + minY) * zoom.value) / 2,
  };
}

/** Centers one requested object in the visible canvas and restores a readable zoom. */
function revealElement(reference: ElementReference): void {
  const canvas: HTMLElement | null = canvasRef.value;

  if (!canvas) return;

  let rect: DiagramRect | null = null;

  if (reference.type === "table") {
    const table: SchemaTableModel | undefined = schema.tables.find(
      (item: SchemaTableModel) => item.id === reference.id,
    );

    if (table)
      rect = {
        x: table.x,
        y: table.y,
        width: table.width,
        height: 49 + table.fields.length * 35,
      };
  } else if (reference.type === "area") {
    const area: SchemaAreaModel | undefined = schema.areas.find(
      (item: SchemaAreaModel) => item.id === reference.id,
    );

    if (area)
      rect = { x: area.x, y: area.y, width: area.width, height: area.height };
  } else if (reference.type === "note") {
    const note: SchemaNoteModel | undefined = schema.notes.find(
      (item: SchemaNoteModel) => item.id === reference.id,
    );

    if (note)
      rect = { x: note.x, y: note.y, width: note.width, height: note.height };
  } else {
    const relation: SchemaRelation | undefined = schema.relations.find(
      (item: SchemaRelation) => item.id === reference.id,
    );
    const source: SchemaTableModel | undefined = schema.tables.find(
      (table: SchemaTableModel) => table.id === relation?.sourceTableId,
    );
    const target: SchemaTableModel | undefined = schema.tables.find(
      (table: SchemaTableModel) => table.id === relation?.targetTableId,
    );

    if (source && target) {
      const left: number = Math.min(source.x, target.x);
      const top: number = Math.min(source.y, target.y);
      const right: number = Math.max(
        source.x + source.width,
        target.x + target.width,
      );
      const bottom: number = Math.max(
        source.y + 49 + source.fields.length * 35,
        target.y + 49 + target.fields.length * 35,
      );
      rect = { x: left, y: top, width: right - left, height: bottom - top };
    }
  }

  if (!rect) return;

  zoom.value = Math.max(0.8, zoom.value);
  pan.value = {
    x: canvas.clientWidth / 2 - (rect.x + rect.width / 2) * zoom.value,
    y: canvas.clientHeight / 2 - (rect.y + rect.height / 2) * zoom.value,
  };
}

/** Handles standard editing shortcuts without hijacking text inputs. */
function handleKeydown(event: KeyboardEvent): void {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;

  if (event.code === "Space") {
    event.preventDefault();
    spacePressed.value = true;
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? schema.redo() : schema.undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveLocal();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    schema.selectElements(
      [
        ...schema.areas.map((area: SchemaAreaModel): ElementReference => ({
          type: "area",
          id: area.id,
        })),
        ...schema.tables.map((table: SchemaTableModel): ElementReference => ({
          type: "table",
          id: table.id,
        })),
        ...schema.notes.map((note: SchemaNoteModel): ElementReference => ({
          type: "note",
          id: note.id,
        })),
      ],
      false,
    );
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    const count: number = schema.copySelectedElements();
    notify(
      count > 0
        ? `${count} element${count === 1 ? "" : "s"} copied.`
        : "Select a table, area, or note to copy.",
      count === 0,
    );
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    const pasted: ElementReference[] = schema.pasteSelectedElements();
    notify(
      pasted.length > 0
        ? `${pasted.length} element${pasted.length === 1 ? "" : "s"} pasted.`
        : "Nothing has been copied.",
      pasted.length === 0,
    );
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "0") {
    event.preventDefault();
    resetView();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    schema.deleteSelectedElements();
    return;
  }
  if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    const step: number = event.shiftKey ? 10 : 1;
    const delta: DiagramPoint = {
      x:
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0,
      y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
    };
    schema.moveSelectedElements(delta, true);
    return;
  }
  if (event.key === "Escape") {
    relationMode.value = false;
    relationDrag.value = null;
    selection.value = null;
    schema.selectElements([], false);
    return;
  }
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    setZoom(zoom.value * 1.1);
    return;
  }
  if (event.key === "-") {
    event.preventDefault();
    setZoom(zoom.value * 0.9);
    return;
  }
  if (event.key.toLowerCase() === "f") fitView();
}

/** Ends temporary spacebar panning mode. */
function handleKeyup(event: KeyboardEvent): void {
  if (event.code === "Space") spacePressed.value = false;
}

/** Resolves a stored relationship into its current SVG geometry. */
function toRenderableRelation(
  relation: SchemaRelation,
): RenderableRelation | null {
  const sourceTable: SchemaTableModel | undefined = schema.tables.find(
    (table: SchemaTableModel) => table.id === relation.sourceTableId,
  );
  const targetTable: SchemaTableModel | undefined = schema.tables.find(
    (table: SchemaTableModel) => table.id === relation.targetTableId,
  );
  const sourceIndex: number =
    sourceTable?.fields.findIndex(
      (field: SchemaField) => field.id === relation.sourceFieldIds[0],
    ) ?? -1;
  const targetIndex: number =
    targetTable?.fields.findIndex(
      (field: SchemaField) => field.id === relation.targetFieldIds[0],
    ) ?? -1;

  if (!sourceTable || !targetTable || sourceIndex < 0 || targetIndex < 0)
    return null;

  const sourceOnLeft: boolean = sourceTable.x <= targetTable.x;
  const start: DiagramPoint = {
    x: sourceTable.x + (sourceOnLeft ? sourceTable.width : 0),
    y: sourceTable.y + 73 + sourceIndex * 35,
  };
  const end: DiagramPoint = {
    x: targetTable.x + (sourceOnLeft ? 0 : targetTable.width),
    y: targetTable.y + 73 + targetIndex * 35,
  };
  const peerRelations: SchemaRelation[] = schema.relations.filter(
    (item: SchemaRelation) =>
      (item.sourceTableId === relation.sourceTableId &&
        item.targetTableId === relation.targetTableId) ||
      (item.sourceTableId === relation.targetTableId &&
        item.targetTableId === relation.sourceTableId),
  );
  const peerIndex: number = peerRelations.findIndex(
    (item: SchemaRelation) => item.id === relation.id,
  );
  const laneOffset: number = (peerIndex - (peerRelations.length - 1) / 2) * 22;
  const middleX: number = (start.x + end.x) / 2 + laneOffset;

  const paths: string[] = relation.sourceFieldIds.map((sourceFieldId: string, index: number) => {
      const sourceFieldIndex: number = sourceTable.fields.findIndex(
        (field: SchemaField) => field.id === sourceFieldId,
      );
      const targetFieldIndex: number = targetTable.fields.findIndex(
        (field: SchemaField) => field.id === relation.targetFieldIds[index],
      );
      const sourceY: number = sourceTable.y + 73 + sourceFieldIndex * 35;
      const targetY: number = targetTable.y + 73 + targetFieldIndex * 35;

      if (schema.editorSettings.relationRouteStyle === "straight")
        return `M ${start.x} ${sourceY} L ${end.x} ${targetY}`;

      if (schema.editorSettings.relationRouteStyle === "curved")
        return `M ${start.x} ${sourceY} C ${middleX} ${sourceY}, ${middleX} ${targetY}, ${end.x} ${targetY}`;

      return `M ${start.x} ${sourceY} H ${middleX} V ${targetY} H ${end.x}`;
    },
  );

  return {
    relation,
    paths,
    label:
      relation.cardinality === "many-to-one"
        ? "N : 1"
        : relation.cardinality === "one-to-many"
          ? "1 : N"
          : "1 : 1",
    labelPoint: { x: middleX, y: (start.y + end.y) / 2 },
  };
}

onBeforeUnmount(() => {
  drag.value = null;
  panning.value = null;
  relationDrag.value = null;
  areaResize.value = null;
  noteResize.value = null;
  canvasResizeObserver?.disconnect();
});

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  canvasResizeObserver = new ResizeObserver(
    (entries: ResizeObserverEntry[]) => {
      const bounds: DOMRectReadOnly | undefined = entries[0]?.contentRect;
      if (bounds) 
        canvasSize.value = { x: bounds.width, y: bounds.height };
    },
  );

  if (canvasRef.value) 
  canvasResizeObserver.observe(canvasRef.value);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("keyup", handleKeyup);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});

watch(
  () => schema.navigationRequest.sequence,
  (): void => {
    const reference: ElementReference | null =
      schema.navigationRequest.reference;
    if (reference) revealElement(reference);
  },
);
</script>

<template>
  <section ref="canvasRef" class="schema-canvas" :class="{
    'is-pan-ready': spacePressed,
    'is-panning': panning,
    'is-grid-hidden': !schema.editorSettings.gridVisible,
  }" @pointerdown.self="beginPan" @pointermove="handlePointerMove" @pointerup="endPointerGesture"
    @pointercancel="endPointerGesture" @wheel.prevent="handleWheel" @contextmenu.prevent>
    <div class="schema-canvas__layer" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
      <svg class="schema-canvas__relations" width="2200" height="1400" aria-label="Database table relationships">
        <g v-for="item in relations" :key="item.relation.id" class="schema-relation" :class="{
          'is-selected': schema.selectedRelationId === item.relation.id,
        }" @click.stop="schema.selectRelation(item.relation.id)">
          <path v-for="path in item.paths" :key="path" :d="path" class="schema-relation__hit" />
          <path v-for="path in item.paths" :key="`${path}:line`" :d="path" class="schema-relation__line" />
          <text v-if="schema.editorSettings.showCardinality" :x="item.labelPoint.x" :y="item.labelPoint.y - 7"
            text-anchor="middle">
            {{ item.label }}
          </text>
        </g>
        <path v-if="relationPreviewPath" :d="relationPreviewPath" class="schema-relation__preview" />
      </svg>
      <SchemaArea v-for="area in schema.areas" :key="area.id" :area="area" :selected="schema.selectedAreaId === area.id"
        @select="
          (areaId, additive) =>
            schema.selectElement({ type: 'area', id: areaId }, additive)
        " @drag-start="beginAreaDrag" @resize-start="beginAreaResize"
        @update="(areaId, title) => schema.updateArea(areaId, { title })" />
      <div v-if="selectionStyle" class="schema-canvas__selection" :style="selectionStyle" />
      <SchemaTable v-for="table in schema.tables" :key="table.id" :table="table"
        :selected="schema.selectedTableIds.includes(table.id)" :linking="relationMode" :link-source-key="linkSourceKey"
        :link-target-key="linkTargetKey" :link-target-valid="linkTargetValid" @select="schema.selectTable"
        @drag-start="beginDrag" @relation-drag-start="beginRelationDrag" @field-drop="schema.moveFieldTo" />
      <SchemaNote v-for="note in schema.notes" :key="note.id" :note="note" :selected="schema.selectedNoteId === note.id"
        @select="
          (noteId, additive) =>
            schema.selectElement({ type: 'note', id: noteId }, additive)
        " @drag-start="beginNoteDrag" @resize-start="beginNoteResize"
        @update="(noteId, values) => schema.updateNote(noteId, values)" />
    </div>
    <div v-if="
      schema.tables.length === 0 &&
      schema.notes.length === 0 &&
      schema.areas.length === 0
    " class="schema-canvas__empty">
      <strong>Start with a blank canvas</strong>
      <span>Add a table, note, or area from the toolbar below.</span>
      <button type="button" @click="addTable">Add first table</button>
    </div>
    <div class="schema-canvas__toolbar">
      <button type="button" @click="addTable">+ Add table</button>
      <button type="button" @click="addNote">+ Note</button>
      <button type="button" @click="addArea">+ Area</button>
      <button type="button" :class="{ 'is-active': relationMode }" @click="toggleRelationMode">
        {{
          relationMode
            ? relationDrag
              ? "Drag to target field"
              : "Drag from source field"
            : "Create relation"
        }}
      </button>
      <button type="button" @click="schema.autoArrange">Auto arrange</button>
      <button type="button" @click="fitView">Fit view</button>
      <button type="button" :class="{ 'is-active': schema.editorSettings.gridVisible }" @click="
        schema.setEditorSettings({
          gridVisible: !schema.editorSettings.gridVisible,
        })
        ">
        Grid
      </button>
      <button type="button" :class="{ 'is-active': schema.editorSettings.snapToGrid }" @click="
        schema.setEditorSettings({
          snapToGrid: !schema.editorSettings.snapToGrid,
        })
        ">
        Snap
      </button>
      <button type="button" @click="
        schema.setEditorSettings({
          relationRouteStyle:
            schema.editorSettings.relationRouteStyle === 'orthogonal'
              ? 'straight'
              : schema.editorSettings.relationRouteStyle === 'straight'
                ? 'curved'
                : 'orthogonal',
        })
        ">
        Route: {{ schema.editorSettings.relationRouteStyle }}
      </button>
      <button type="button" :class="{ 'is-active': schema.editorSettings.showCardinality }" @click="
        schema.setEditorSettings({
          showCardinality: !schema.editorSettings.showCardinality,
        })
        ">
        Cardinality
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out (-)" @click="setZoom(zoom * 0.9)">
        −
      </button>
      <button type="button" aria-label="Reset zoom" title="Reset view (Ctrl+0)" @click="resetView">
        {{ Math.round(zoom * 100) }}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in (+)" @click="setZoom(zoom * 1.1)">
        +
      </button>
      <button type="button" @click="toggleFullscreen">
        {{ isFullscreen ? "Exit fullscreen" : "Fullscreen" }}
      </button>
      <button type="button" :disabled="schema.selectedTableIds.length < 2" @click="schema.arrangeSelected('left')">
        Align left
      </button>
      <button type="button" :disabled="schema.selectedTableIds.length < 2" @click="schema.arrangeSelected('top')">
        Align top
      </button>
      <button type="button" :disabled="schema.selectedTableIds.length < 3"
        @click="schema.arrangeSelected('horizontal')">
        Distribute
      </button>
      <button type="button" :disabled="!schema.canUndo" @click="schema.undo">
        Undo
      </button>
      <button type="button" :disabled="!schema.canRedo" @click="schema.redo">
        Redo
      </button>
      <button type="button" @click="saveLocal">Save local</button>
      <button type="button" @click="loadLocal">Load local</button>
      <button type="button" @click="downloadJson">Export JSON</button>
      <button type="button" @click="importInput?.click()">Import JSON</button>
      <button type="button" @click="downloadDbml">Export DBML</button>
      <button type="button" @click="dbmlInput?.click()">Import DBML</button>
      <button type="button" @click="sqlInput?.click()">Import SQL</button>
      <button type="button" @click="downloadSvg">Export SVG</button>
      <button type="button" @click="exportRaster('png')">Export PNG</button>
      <button type="button" @click="exportRaster('jpeg')">Export JPEG</button>
      <button type="button" @click="exportRaster('webp')">Export WebP</button>
      <button type="button" @click="downloadMarkdown">Export Markdown</button>
      <button type="button" @click="downloadMermaid">Export Mermaid</button>
    </div>
    <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importJson" />
    <input ref="dbmlInput" class="visually-hidden" type="file" accept=".dbml,text/plain" @change="importDbml" />
    <input ref="sqlInput" class="visually-hidden" type="file" accept=".sql,text/plain" @change="importSql" />
    <aside class="schema-minimap" aria-label="Diagram minimap" title="Click to navigate"
      @pointerdown.stop="navigateMinimap">
      <span v-for="area in schema.areas" :key="`area:${area.id}`" class="schema-minimap__area" :style="{
        left: `${area.x * minimapScale}px`,
        top: `${area.y * minimapScale}px`,
        width: `${area.width * minimapScale}px`,
        height: `${area.height * minimapScale}px`,
        borderColor: area.color,
      }" />
      <i v-for="table in schema.tables" :key="table.id"
        :class="{ 'is-selected': schema.selectedTableIds.includes(table.id) }" :style="{
          left: `${table.x * minimapScale}px`,
          top: `${table.y * minimapScale}px`,
          width: `${table.width * minimapScale}px`,
          height: `${Math.max(8, (49 + table.fields.length * 35) * minimapScale)}px`,
          background: table.color,
        }" />
      <span v-for="note in schema.notes" :key="`note:${note.id}`" class="schema-minimap__note" :style="{
        left: `${note.x * minimapScale}px`,
        top: `${note.y * minimapScale}px`,
        width: `${note.width * minimapScale}px`,
        height: `${note.height * minimapScale}px`,
        background: note.color,
      }" />
      <b class="schema-minimap__viewport" :style="minimapViewportStyle" />
    </aside>
    <p v-if="message" class="schema-canvas__message">{{ message }}</p>
  </section>
</template>
