<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useSchemaStore } from "../stores/schema";
import type { SchemaDiagram } from "../types/schema";
import { exportDbml, parseDbml } from "../utils/dbml";

const emit = defineEmits<{ close: []; applied: [] }>();
const schema = useSchemaStore();
const draft = ref<string>("");
const error = ref<string>("");
const applying = ref<boolean>(false);
let updateTimer: ReturnType<typeof setTimeout> | null = null;

/** Returns the active canvas as supported DBML text. */
const canvasDbml = computed<string>(() =>
  exportDbml({
    formatVersion: 2,
    name: schema.diagramName,
    dialect: schema.dialect,
    enums: schema.enums,
    customTypes: schema.customTypes,
    notes: schema.notes,
    areas: schema.areas,
    tables: schema.tables,
    relations: schema.relations,
  }),
);

/** Schedules a DBML-to-canvas update after a short typing pause. */
function updateDraft(event: Event): void {
  draft.value = (event.target as HTMLTextAreaElement).value;
  error.value = "";
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(applyDraft, 350);
}

/** Applies valid DBML while retaining the document title and visual preferences. */
function applyDraft(): void {
  try {
    const parsed: SchemaDiagram = parseDbml(draft.value);
    applying.value = true;
    schema.replaceDiagram({
      ...parsed,
      name: schema.diagramName,
      settings: { ...schema.editorSettings },
    });
    emit("applied");
    nextTick((): void => {
      applying.value = false;
    });
  } catch (exception: unknown) {
    error.value =
      exception instanceof Error
        ? exception.message
        : "DBML could not be parsed.";
  }
}

/** Copies the current canvas source into the editable document. */
function resetDraft(): void {
  draft.value = canvasDbml.value;
  error.value = "";
}

watch(
  canvasDbml,
  (value: string): void => {
    if (!applying.value) draft.value = value;
  },
  { immediate: true },
);
onBeforeUnmount((): void => {
  if (updateTimer) clearTimeout(updateTimer);
});
</script>

<template>
  <Modal
    :model-value="true"
    title="Live DBML editor"
    width="900"
    :footer-hide="true"
    :mask-closable="true"
    class-name="dbml-editor-modal"
    :styles="{ top: '4vh', height: '92vh', margin: '0 auto' }"
    @on-cancel="emit('close')"
  >
    <section class="dbml-editor" aria-label="Live DBML editor">
      <header>
        <div>
          <small>LIVE DBML</small>
          <h2>DBML editor</h2>
        </div>
        <div>
          <button type="button" @click="resetDraft">Reset to canvas</button
          ><button
            type="button"
            aria-label="Close DBML editor"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </header>
      <p>
        Valid edits apply to the canvas after a short pause. DBML imports
        tables, relationships, enums, and custom types.
      </p>
      <textarea
        :value="draft"
        aria-label="DBML source"
        spellcheck="false"
        @input="updateDraft"
      />
      <output v-if="error" class="dbml-editor__error">{{ error }}</output>
    </section>
  </Modal>
</template>
