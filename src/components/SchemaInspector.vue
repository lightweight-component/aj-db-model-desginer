<script setup lang="ts">
import { computed, ref } from "vue";
import { useSchemaStore } from "../stores/schema";
import type { ForeignKeyAction, RelationCardinality, SchemaField } from "../types/schema";
import { typesForDialect } from "../utils/dialects";

const schema = useSchemaStore();
const selectedTable = computed(() => schema.selectedTable);
const selectedRelation = computed(() => schema.selectedRelation);
const selectedArea = computed(() => schema.selectedArea);
const selectedNote = computed(() => schema.selectedNote);
const sourceRelationTable = computed(() => schema.tables.find((table) => table.id === selectedRelation.value?.sourceTableId));
const targetRelationTable = computed(() => schema.tables.find((table) => table.id === selectedRelation.value?.targetTableId));
const pairSourceId = ref<string>("");
const pairTargetId = ref<string>("");
const typeOptions = computed<string[]>(() => [...typesForDialect(schema.dialect), ...schema.enums.map((item) => item.name), ...schema.customTypes.map((item) => item.name)]);

/** Reads an input value with an explicit string fallback. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

/** Changes the selected table name. */
function updateTableName(event: Event): void {
  if (!selectedTable.value)
    return;

  schema.updateTable(selectedTable.value.id, { name: inputValue(event).trim() || "untitled_table" });
}

/** Changes one named field property on the selected table. */
function updateField(field: SchemaField, key: "name" | "type" | "nullable" | "primary" | "unique" | "defaultValue" | "comment", event: Event): void {
  if (!selectedTable.value)
    return;

  const target = event.target as HTMLInputElement;
  const value: string | boolean = key === "nullable" || key === "primary" || key === "unique" ? target.checked : target.value;
  schema.updateField(selectedTable.value.id, field.id, { [key]: value });
}

/** Updates a selected table property from a textual control. */
function updateTableProperty(key: "comment" | "color", event: Event): void {
  if (!selectedTable.value)
    return;

  schema.updateTable(selectedTable.value.id, { [key]: inputValue(event) });
}

/** Updates a selected table boolean property. */
function updateTableFlag(key: "collapsed" | "locked", event: Event): void {
  if (!selectedTable.value)
    return;

  schema.updateTable(selectedTable.value.id, { [key]: (event.target as HTMLInputElement).checked });
}

/** Updates the selected table width within the supported visual range. */
function updateTableWidth(event: Event): void {
  if (!selectedTable.value)
    return;

  schema.updateTable(selectedTable.value.id, { width: Number(inputValue(event)) });
}

/** Resolves one index field id to its current field name. */
function indexFieldName(fieldId: string): string {
  return selectedTable.value?.fields.find((field: SchemaField) => field.id === fieldId)?.name ?? "Missing field";
}

/**
 * Updates a textual or color property on the selected area.
 *
 * @param key target property
 * @param event input change event
 */
function updateAreaProperty(key: "title" | "color", event: Event): void {
  if (!selectedArea.value)
    return;

  const value: string = inputValue(event);
  schema.updateArea(selectedArea.value.id, { [key]: key === "title" ? value.trim() || "Untitled area" : value });
}

/**
 * Updates the selected area's locked state.
 *
 * @param event checkbox change event
 */
function updateAreaLocked(event: Event): void {
  if (!selectedArea.value)
    return;

  schema.updateArea(selectedArea.value.id, { locked: (event.target as HTMLInputElement).checked });
}

/** Updates a textual or color property on the selected note. */
function updateNoteProperty(key: "title" | "text" | "color", event: Event): void {
  if (!selectedNote.value)
    return;

  const target: HTMLInputElement | HTMLTextAreaElement = event.target as HTMLInputElement | HTMLTextAreaElement;
  schema.updateNote(selectedNote.value.id, { [key]: key === "title" ? target.value.trim() || "Untitled note" : target.value });
}

/** Updates the selected note's locked state. */
function updateNoteLocked(event: Event): void {
  if (!selectedNote.value)
    return;

  schema.updateNote(selectedNote.value.id, { locked: (event.target as HTMLInputElement).checked });
}

/** Changes the cardinality of the active relationship. */
function updateCardinality(event: Event): void {
  if (!selectedRelation.value)
    return;

  const cardinality: RelationCardinality = inputValue(event) as RelationCardinality;
  schema.updateRelation(selectedRelation.value.id, { cardinality });
}

/** Updates the SQL action used after a related parent row changes. */
function updateForeignKeyAction(key: "onDelete" | "onUpdate", event: Event): void {
  if (!selectedRelation.value)
    return;

  schema.updateRelation(selectedRelation.value.id, { [key]: inputValue(event) as ForeignKeyAction });
}

/** Adds the next available field pair to a composite relationship. */
function addCompositePair(): void {
  if (!selectedRelation.value || !sourceRelationTable.value || !targetRelationTable.value)
    return;

  const source: SchemaField | undefined = sourceRelationTable.value.fields.find((field: SchemaField) => !selectedRelation.value?.sourceFieldIds.includes(field.id));
  const target: SchemaField | undefined = targetRelationTable.value.fields.find((field: SchemaField) => !selectedRelation.value?.targetFieldIds.includes(field.id));

  if (!source || !target)
    return;

  schema.addRelationPair(selectedRelation.value.id, source.id, target.id);
}

/** Adds the explicitly selected source/target pair to the composite key. */
function addSelectedCompositePair(): void {
  if (!selectedRelation.value || !pairSourceId.value || !pairTargetId.value)
    return;

  schema.addRelationPair(selectedRelation.value.id, pairSourceId.value, pairTargetId.value);
  pairSourceId.value = "";
  pairTargetId.value = "";
}

/** Switches source and target sides for a relationship. */
function swapRelation(): void {
  if (!selectedRelation.value)
    return;

  schema.updateRelation(selectedRelation.value.id, { sourceTableId: selectedRelation.value.targetTableId, sourceFieldIds: selectedRelation.value.targetFieldIds, targetTableId: selectedRelation.value.sourceTableId, targetFieldIds: selectedRelation.value.sourceFieldIds });
}

/** Resolves a field id to a readable table-field label. */
function fieldName(tableId: string, fieldId: string): string {
  return schema.tables.find((table) => table.id === tableId)?.fields.find((field: SchemaField) => field.id === fieldId)?.name ?? "Missing field";
}
</script>

<template>
  <aside class="schema-inspector">
    <template v-if="selectedTable">
      <header class="schema-inspector__header">
        <div><small>TABLE</small><h2>Table details</h2></div>
        <span class="table-header-actions"><button type="button" @click="schema.duplicateTable(selectedTable.id)">Duplicate</button><button type="button" class="danger-button" @click="schema.deleteTable(selectedTable.id)">Delete</button></span>
      </header>
      <label class="form-field"><span>Table name</span><input :value="selectedTable.name" @change="updateTableName" /></label>
      <label class="form-field"><span>Description</span><input :value="selectedTable.comment" @change="updateTableProperty('comment', $event)" /></label>
      <label class="form-field"><span>Table width</span><input type="number" min="220" max="560" step="10" :value="selectedTable.width" aria-label="Table width" @change="updateTableWidth" /></label>
      <div class="table-options"><label>Color <input type="color" :value="selectedTable.color" @change="updateTableProperty('color', $event)" /></label><label><input type="checkbox" :checked="selectedTable.collapsed" @change="updateTableFlag('collapsed', $event)" />Collapsed</label><label><input type="checkbox" :checked="selectedTable.locked" @change="updateTableFlag('locked', $event)" />Locked</label></div>
      <div v-if="schema.selectedTableIds.length > 1" class="bulk-table-actions"><strong>{{ schema.selectedTableIds.length }} tables selected</strong><button type="button" @click="schema.setSelectedTablesLocked(true)">Lock all</button><button type="button" @click="schema.setSelectedTablesLocked(false)">Unlock all</button><button type="button" class="danger-button" @click="schema.deleteSelectedTables">Delete all</button></div>
      <section class="schema-inspector__section">
        <div class="section-title"><h3>Fields</h3><button type="button" @click="schema.addField(selectedTable.id)">+ Add</button></div>
        <article v-for="(field, index) in selectedTable.fields" :key="field.id" class="field-editor">
          <div class="field-editor__row"><input :value="field.name" aria-label="Field name" @change="updateField(field, 'name', $event)" /><button type="button" class="icon-button" :disabled="index === 0" @click="schema.moveField(selectedTable.id, field.id, -1)">↑</button><button type="button" class="icon-button" :disabled="index === selectedTable.fields.length - 1" @click="schema.moveField(selectedTable.id, field.id, 1)">↓</button><button type="button" class="icon-button" :disabled="selectedTable.fields.length === 1" @click="schema.deleteField(selectedTable.id, field.id)">×</button></div>
          <input :value="field.type" :list="`field-types-${field.id}`" aria-label="Field type" @change="updateField(field, 'type', $event)" />
          <datalist :id="`field-types-${field.id}`"><option v-for="type in typeOptions" :key="type" :value="type" /></datalist>
          <input :value="field.defaultValue" placeholder="Default value" @change="updateField(field, 'defaultValue', $event)" />
          <input :value="field.comment" placeholder="Field comment" @change="updateField(field, 'comment', $event)" />
          <div class="field-editor__checks">
            <label><input type="checkbox" :checked="field.primary" @change="updateField(field, 'primary', $event)" />PK</label>
            <label><input type="checkbox" :checked="field.unique" @change="updateField(field, 'unique', $event)" />Unique</label>
            <label><input type="checkbox" :checked="field.nullable" @change="updateField(field, 'nullable', $event)" />Nullable</label>
          </div>
        </article>
      </section>
      <section class="schema-inspector__section">
        <div class="section-title"><h3>Indexes</h3><span><button type="button" @click="schema.addIndex(selectedTable.id, false)">+ Index</button><button type="button" @click="schema.addIndex(selectedTable.id, true)">+ Unique</button></span></div>
        <article v-for="index in selectedTable.indexes" :key="index.id" class="index-editor">
          <div class="index-editor__header"><input :value="index.name" aria-label="Index name" @change="schema.updateIndex(selectedTable.id, index.id, { name: inputValue($event) })" /><label><input type="checkbox" :checked="index.unique" @change="schema.updateIndex(selectedTable.id, index.id, { unique: ($event.target as HTMLInputElement).checked })" />Unique</label><button type="button" class="icon-button" @click="schema.deleteIndex(selectedTable.id, index.id)">×</button></div>
          <div class="index-editor__fields">
            <label v-for="field in selectedTable.fields" :key="field.id"><input type="checkbox" :checked="index.fieldIds.includes(field.id)" :disabled="index.fieldIds.length === 1 && index.fieldIds.includes(field.id)" @change="schema.toggleIndexField(selectedTable.id, index.id, field.id)" />{{ field.name }}</label>
          </div>
          <ol class="index-editor__order"><li v-for="(fieldId, fieldIndex) in index.fieldIds" :key="fieldId"><code>{{ fieldIndex + 1 }}. {{ indexFieldName(fieldId) }}</code><span><button type="button" class="icon-button" :disabled="fieldIndex === 0" @click="schema.moveIndexField(selectedTable.id, index.id, fieldId, -1)">↑</button><button type="button" class="icon-button" :disabled="fieldIndex === index.fieldIds.length - 1" @click="schema.moveIndexField(selectedTable.id, index.id, fieldId, 1)">↓</button></span></li></ol>
        </article>
      </section>
    </template>
    <template v-else-if="selectedRelation">
      <header class="schema-inspector__header"><div><small>RELATIONSHIP</small><h2>Relation details</h2></div><button type="button" class="danger-button" @click="schema.deleteRelation(selectedRelation.id)">Delete</button></header>
      <label class="form-field"><span>Cardinality</span><select :value="selectedRelation.cardinality" @change="updateCardinality"><option value="many-to-one">Many to one</option><option value="one-to-many">One to many</option><option value="one-to-one">One to one</option></select></label>
      <label class="form-field"><span>Constraint name</span><input :value="selectedRelation.constraintName" placeholder="Auto-generated when empty" @change="schema.updateRelation(selectedRelation.id, { constraintName: inputValue($event) })" /></label>
      <div class="foreign-key-actions"><label>On delete <select :value="selectedRelation.onDelete" @change="updateForeignKeyAction('onDelete', $event)"><option>NO ACTION</option><option>RESTRICT</option><option>CASCADE</option><option>SET NULL</option><option>SET DEFAULT</option></select></label><label>On update <select :value="selectedRelation.onUpdate" @change="updateForeignKeyAction('onUpdate', $event)"><option>NO ACTION</option><option>RESTRICT</option><option>CASCADE</option><option>SET NULL</option><option>SET DEFAULT</option></select></label></div>
      <section class="schema-inspector__section"><div class="section-title"><h3>Field pairs</h3><button type="button" @click="swapRelation">Swap direction</button></div><div v-for="(sourceId, index) in selectedRelation.sourceFieldIds" :key="`${sourceId}:${selectedRelation.targetFieldIds[index]}`" class="relation-pair"><code>{{ fieldName(selectedRelation.sourceTableId, sourceId) }}</code><span>→</span><code>{{ fieldName(selectedRelation.targetTableId, selectedRelation.targetFieldIds[index]) }}</code><button type="button" class="icon-button" :disabled="selectedRelation.sourceFieldIds.length === 1" @click="schema.deleteRelationPair(selectedRelation.id, index)">×</button></div><div class="relation-pair"><select v-model="pairSourceId"><option value="">Source field</option><option v-for="field in sourceRelationTable?.fields" :key="field.id" :value="field.id">{{ field.name }}</option></select><span>→</span><select v-model="pairTargetId"><option value="">Target field</option><option v-for="field in targetRelationTable?.fields" :key="field.id" :value="field.id">{{ field.name }}</option></select><button type="button" class="icon-button" @click="addSelectedCompositePair">+</button></div></section>
    </template>
    <template v-else-if="selectedArea">
      <header class="schema-inspector__header"><div><small>AREA</small><h2>Area details</h2></div><button type="button" class="danger-button" @click="schema.deleteArea(selectedArea.id)">Delete</button></header>
      <label class="form-field"><span>Title</span><input :value="selectedArea.title" aria-label="Area title property" @change="updateAreaProperty('title', $event)" /></label>
      <div class="table-options"><label>Color <input type="color" :value="selectedArea.color" aria-label="Area color" @change="updateAreaProperty('color', $event)" /></label><label><input type="checkbox" :checked="selectedArea.locked" aria-label="Area locked property" @change="updateAreaLocked" />Locked</label></div>
      <section class="schema-inspector__section"><div class="section-title"><h3>Geometry</h3></div><div class="area-geometry"><span>X {{ Math.round(selectedArea.x) }}</span><span>Y {{ Math.round(selectedArea.y) }}</span><span>W {{ Math.round(selectedArea.width) }}</span><span>H {{ Math.round(selectedArea.height) }}</span></div></section>
    </template>
    <template v-else-if="selectedNote">
      <header class="schema-inspector__header"><div><small>NOTE</small><h2>Note details</h2></div><button type="button" class="danger-button" @click="schema.deleteNote(selectedNote.id)">Delete</button></header>
      <label class="form-field"><span>Title</span><input :value="selectedNote.title" aria-label="Note title property" @change="updateNoteProperty('title', $event)" /></label>
      <label class="form-field"><span>Content</span><textarea :value="selectedNote.text" aria-label="Note content property" @change="updateNoteProperty('text', $event)" /></label>
      <div class="table-options"><label>Color <input type="color" :value="selectedNote.color" aria-label="Note color" @change="updateNoteProperty('color', $event)" /></label><label><input type="checkbox" :checked="selectedNote.locked" aria-label="Note locked property" @change="updateNoteLocked" />Locked</label></div>
      <section class="schema-inspector__section"><div class="section-title"><h3>Geometry</h3></div><div class="area-geometry"><span>X {{ Math.round(selectedNote.x) }}</span><span>Y {{ Math.round(selectedNote.y) }}</span><span>W {{ Math.round(selectedNote.width) }}</span><span>H {{ Math.round(selectedNote.height) }}</span></div></section>
    </template>
    <div v-else class="schema-inspector__empty"><strong>Select an element</strong><span>Click a table, relationship, area, or note to edit it.</span></div>
  </aside>
</template>
