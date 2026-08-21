<script setup lang="ts">
import { computed, ref } from "vue";
import { schemaTemplates } from "../data/schemaTemplates";
import type { SchemaTemplate } from "../data/schemaTemplates";

const emit = defineEmits<{ close: []; select: [template: SchemaTemplate] }>();
const selectedId = ref<string>("saas");
const templates = schemaTemplates();
const selectedTemplate = computed<SchemaTemplate>(
  (): SchemaTemplate =>
    templates.find(
      (template: SchemaTemplate): boolean => template.id === selectedId.value,
    ) as SchemaTemplate,
);

/** Selects the active card in the starter template library. */
function selectTemplate(template: SchemaTemplate): void {
  selectedId.value = template.id;
}

/** Sends the currently selected template to the document owner. */
function createFromTemplate(): void {
  emit("select", selectedTemplate.value);
}
</script>

<template>
  <Modal
    :model-value="true"
    title="Template library"
    width="760"
    ok-text="Create from template"
    cancel-text="Cancel"
    @on-ok="createFromTemplate"
    @on-cancel="emit('close')"
  >
    <p class="template-library__intro">
      Start with a working data model. Templates create a new document and
      replace the active diagram.
    </p>
    <div class="template-library__grid">
      <button
        v-for="template in templates"
        :key="template.id"
        type="button"
        class="template-library__card"
        :class="{ 'is-selected': selectedId === template.id }"
        @click="selectTemplate(template)"
      >
        <span>{{ template.category }}</span>
        <strong>{{ template.name }}</strong>
        <small>{{ template.description }}</small>
        <em
          >{{ template.diagram.tables.length }} tables ·
          {{ template.diagram.relations.length }} relations ·
          {{ template.diagram.dialect }}</em
        >
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.template-library__intro {
  margin: 0 0 15px;
  color: #65708b;
}
.template-library__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.template-library__card {
  display: grid;
  min-height: 156px;
  align-content: start;
  gap: 8px;
  border: 1px solid #e1e6f0;
  border-radius: 10px;
  padding: 14px;
  background: #fbfcff;
  color: #2f3b53;
  text-align: left;
}
.template-library__card:hover,
.template-library__card.is-selected {
  border-color: #6578ed;
  background: #f0f3ff;
  box-shadow: 0 0 0 2px rgba(101, 120, 237, 0.12);
}
.template-library__card span {
  color: #6677cf;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.template-library__card strong {
  font-size: 15px;
}
.template-library__card small {
  color: #68748d;
  font-size: 12px;
  line-height: 1.5;
}
.template-library__card em {
  margin-top: auto;
  color: #74809a;
  font-size: 10px;
  font-style: normal;
}
@media (max-width: 600px) {
  .template-library__grid {
    grid-template-columns: 1fr;
  }
}
</style>
