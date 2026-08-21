<script setup lang="ts">
import type { SchemaField, SchemaTable } from "../types/schema";

interface Props {
  table: SchemaTable;
  selected: boolean;
  linking: boolean;
  linkSourceKey: string | null;
  linkTargetKey: string | null;
  linkTargetValid: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  select: [tableId: string, additive: boolean];
  dragStart: [event: PointerEvent, tableId: string];
  relationDragStart: [event: PointerEvent, tableId: string, fieldId: string];
  fieldDrop: [tableId: string, fieldId: string, targetIndex: number];
}>();

let draggedFieldId: string | null = null;

/** Remembers the field being reordered within this table. */
function beginFieldDrag(fieldId: string): void {
  draggedFieldId = fieldId;
}

/** Clears an unfinished native field drag. */
function endFieldDrag(): void {
  draggedFieldId = null;
}

/** Completes drag-and-drop field sorting at the hovered row. */
function dropField(targetIndex: number): void {
  if (!draggedFieldId)
    return;

  emit("fieldDrop", props.table.id, draggedFieldId, targetIndex);
  draggedFieldId = null;
}

/** Returns a stable key that identifies a relationship endpoint. */
function fieldKey(field: SchemaField): string {
  return `${props.table.id}:${field.id}`;
}

/** Begins dragging without allowing the canvas panning handler to run. */
function handlePointerDown(event: PointerEvent): void {
  const additive: boolean = event.ctrlKey || event.metaKey;

  if (additive || !props.selected)
    emit("select", props.table.id, additive);

  if (props.linking)
    return;

  emit("dragStart", event, props.table.id);
}

/**
 * Starts either table movement or relationship linking from a field row.
 *
 * @param event active primary pointer event
 * @param field field under the pointer
 */
function handleFieldPointerDown(event: PointerEvent, field: SchemaField): void {
  if (!props.linking) {
    const additive: boolean = event.ctrlKey || event.metaKey;

    if (additive || !props.selected)
      emit("select", props.table.id, additive);

    return;
  }

  emit("relationDragStart", event, props.table.id, field.id);
}
</script>

<template>
  <article class="schema-table" :class="{ 'is-selected': selected }"
    :style="{ left: `${table.x}px`, top: `${table.y}px`, width: `${table.width}px`, '--table-color': table.color }"
    @pointerdown.stop="handlePointerDown">
    <header class="schema-table__header">
      <span class="schema-table__dot" />
      <strong>{{ table.name }}</strong>
      <small>{{ table.fields.length }} fields</small>
    </header>
    <button v-if="!table.collapsed" v-for="(field, index) in table.fields" :key="field.id" class="schema-table__field"
      :class="{
        'is-link-source': linkSourceKey === fieldKey(field),
        'is-link-target': linkTargetKey === fieldKey(field),
        'is-link-target-valid': linkTargetKey === fieldKey(field) && linkTargetValid,
        'is-link-target-invalid': linkTargetKey === fieldKey(field) && !linkTargetValid,
        'is-linking': linking,
      }" :data-table-id="table.id" :data-field-id="field.id" type="button" :draggable="!linking && !table.locked"
      @dragstart.stop="beginFieldDrag(field.id)" @dragend="endFieldDrag" @dragover.prevent @drop.stop="dropField(index)"
      @pointerdown.stop="handleFieldPointerDown($event, field)">
      <span class="schema-table__field-name">
        <b v-if="field.primary">PK</b>
        <b v-else-if="field.unique">UQ</b>
        {{ field.name }}
      </span>
      <code>{{ field.type }}</code>
    </button>
  </article>
</template>
