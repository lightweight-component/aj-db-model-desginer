<script setup lang="ts">
import type { SchemaArea } from "../types/schema";

type ResizeDirection = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const props = defineProps<{
  area: SchemaArea;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [areaId: string, additive: boolean];
  dragStart: [event: PointerEvent, areaId: string];
  resizeStart: [event: PointerEvent, areaId: string, direction: ResizeDirection];
  update: [areaId: string, title: string];
}>();

/**
 * Selects the area and begins movement when it is unlocked.
 *
 * @param event active pointer event
 * @param area target area model
 */
function beginDrag(event: PointerEvent, area: SchemaArea): void {
  const additive: boolean = event.ctrlKey || event.metaKey;

  if (additive || !props.selected)
    emit("select", area.id, additive);

  if (area.locked)
    return;

  emit("dragStart", event, area.id);
}
</script>

<template>
  <article
    class="schema-area"
    :class="{ 'is-selected': selected, 'is-locked': area.locked }"
    :style="{ left: `${area.x}px`, top: `${area.y}px`, width: `${area.width}px`, height: `${area.height}px`, '--area-color': area.color }"
    @pointerdown.stop="beginDrag($event, area)"
  >
    <header>
      <button class="schema-area__drag-handle" type="button" aria-label="Move area" @pointerdown.stop="beginDrag($event, area)">⠿</button>
      <input
        :value="area.title"
        aria-label="Area title"
        @pointerdown.stop="emit('select', area.id, false)"
        @change="emit('update', area.id, ($event.target as HTMLInputElement).value)"
      />
      <span v-if="area.locked" aria-label="Area locked">Locked</span>
    </header>
    <template v-if="selected && !area.locked">
      <button class="schema-area__resize is-top-left" type="button" aria-label="Resize area top left" @pointerdown.stop="emit('resizeStart', $event, area.id, 'top-left')" />
      <button class="schema-area__resize is-top-right" type="button" aria-label="Resize area top right" @pointerdown.stop="emit('resizeStart', $event, area.id, 'top-right')" />
      <button class="schema-area__resize is-bottom-left" type="button" aria-label="Resize area bottom left" @pointerdown.stop="emit('resizeStart', $event, area.id, 'bottom-left')" />
      <button class="schema-area__resize is-bottom-right" type="button" aria-label="Resize area bottom right" @pointerdown.stop="emit('resizeStart', $event, area.id, 'bottom-right')" />
    </template>
  </article>
</template>
