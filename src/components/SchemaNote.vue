<script setup lang="ts">
import type { SchemaNote } from "../types/schema";

defineProps<{ note: SchemaNote; selected: boolean }>();
const emit = defineEmits<{
  select: [noteId: string, additive: boolean];
  dragStart: [event: PointerEvent, noteId: string];
  resizeStart: [event: PointerEvent, noteId: string, direction: "top-left" | "top-right" | "bottom-left" | "bottom-right"];
  update: [noteId: string, values: Partial<Pick<SchemaNote, "title" | "text">>];
}>();

/** Selects the note while preserving modifier-assisted mixed selection. */
function selectNote(event: PointerEvent, note: SchemaNote, selected: boolean): void {
  const additive: boolean = event.ctrlKey || event.metaKey;

  if (additive || !selected)
    emit("select", note.id, additive);
}

/** Starts a note drag without clearing an existing mixed selection. */
function beginDrag(event: PointerEvent, note: SchemaNote, selected: boolean): void {
  selectNote(event, note, selected);

  if (!note.locked)
    emit("dragStart", event, note.id);
}
</script>

<template>
  <article class="schema-note" :class="{ 'is-selected': selected, 'is-locked': note.locked }"
    :style="{ left: `${note.x}px`, top: `${note.y}px`, width: `${note.width}px`, height: `${note.height}px`, background: note.color }"
    @pointerdown.stop="selectNote($event, note, selected)">
    <header>
      <button type="button" class="schema-note__drag-handle" :disabled="note.locked" aria-label="Move note"
        @pointerdown.stop="beginDrag($event, note, selected)">⠿</button>
      <input :value="note.title" aria-label="Note title" @pointerdown.stop
        @change="emit('update', note.id, { title: ($event.target as HTMLInputElement).value })" />
      <span v-if="note.locked">Locked</span>
    </header>
    <textarea :value="note.text" aria-label="Note text" @pointerdown.stop="selectNote($event, note, selected)"
      @change="emit('update', note.id, { text: ($event.target as HTMLTextAreaElement).value })" />
    <template v-if="selected && !note.locked">
      <button type="button" class="schema-note__resize is-top-left" aria-label="Resize note top left"
        @pointerdown.stop="emit('resizeStart', $event, note.id, 'top-left')" />
      <button type="button" class="schema-note__resize is-top-right" aria-label="Resize note top right"
        @pointerdown.stop="emit('resizeStart', $event, note.id, 'top-right')" />
      <button type="button" class="schema-note__resize is-bottom-left" aria-label="Resize note bottom left"
        @pointerdown.stop="emit('resizeStart', $event, note.id, 'bottom-left')" />
      <button type="button" class="schema-note__resize is-bottom-right" aria-label="Resize note bottom right"
        @pointerdown.stop="emit('resizeStart', $event, note.id, 'bottom-right')" />
    </template>
  </article>
</template>
