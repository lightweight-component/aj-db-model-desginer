<script setup lang="ts">
import { computed, ref } from "vue";
import { useSchemaStore } from "../stores/schema";
import type {
  ForeignKeyAction,
  RelationCardinality,
  SchemaField,
} from "../types/schema";
import { typesForDialect } from "../utils/dialects";

const schema = useSchemaStore();
const selectedTable = computed(() => schema.selectedTable);
const selectedRelation = computed(() => schema.selectedRelation);
const selectedArea = computed(() => schema.selectedArea);
const selectedNote = computed(() => schema.selectedNote);
const sourceRelationTable = computed(() =>
  schema.tables.find(
    (table) => table.id === selectedRelation.value?.sourceTableId,
  ),
);
const targetRelationTable = computed(() =>
  schema.tables.find(
    (table) => table.id === selectedRelation.value?.targetTableId,
  ),
);
const pairSourceId = ref<string>("");
const pairTargetId = ref<string>("");
const typeOptions = computed<string[]>(() => [
  ...typesForDialect(schema.dialect),
  ...schema.enums.map((item) => item.name),
  ...schema.customTypes.map((item) => item.name),
]);

/** Reads an input value with an explicit string fallback. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

/** Changes the selected table name. */
function updateTableName(event: Event): void {
  if (!selectedTable.value) return;

  schema.updateTable(selectedTable.value.id, {
    name: inputValue(event).trim() || "untitled_table",
  });
}

/** Changes one named field property on the selected table. */
function updateField(
  field: SchemaField,
  key:
    | "name"
    | "type"
    | "nullable"
    | "primary"
    | "unique"
    | "defaultValue"
    | "comment"
    | "checkExpression",
  event: Event,
): void {
  if (!selectedTable.value) return;

  const target = event.target as HTMLInputElement;
  const value: string | boolean =
    key === "nullable" || key === "primary" || key === "unique"
      ? target.checked
      : target.value;
  schema.updateField(selectedTable.value.id, field.id, { [key]: value });
}

/** Updates a selected field boolean property from a View UI Plus switch. */
function updateFieldBoolean(
  field: SchemaField,
  key: "nullable" | "primary" | "unique" | "autoIncrement" | "unsigned",
  value: boolean,
): void {
  if (selectedTable.value)
    schema.updateField(selectedTable.value.id, field.id, { [key]: value });
}

/** Updates a selected table property from a textual control. */
function updateTableProperty(key: "comment" | "color", event: Event): void {
  if (!selectedTable.value) return;

  schema.updateTable(selectedTable.value.id, { [key]: inputValue(event) });
}

/** Updates a selected table color from the View UI Plus picker. */
function updateTableColor(color: string): void {
  if (selectedTable.value)
    schema.updateTable(selectedTable.value.id, { color });
}

/** Updates a selected table boolean property. */
function updateTableFlag(key: "collapsed" | "locked", event: Event): void {
  if (!selectedTable.value) return;

  schema.updateTable(selectedTable.value.id, {
    [key]: (event.target as HTMLInputElement).checked,
  });
}

/** Updates a selected table boolean property from a View UI Plus switch. */
function updateTableFlagValue(
  key: "collapsed" | "locked",
  value: boolean,
): void {
  if (selectedTable.value)
    schema.updateTable(selectedTable.value.id, { [key]: value });
}

/** Updates the selected table width within the supported visual range. */
function updateTableWidth(event: Event): void {
  if (!selectedTable.value) return;

  schema.updateTable(selectedTable.value.id, {
    width: Number(inputValue(event)),
  });
}

/** Resolves one index field id to its current field name. */
function indexFieldName(fieldId: string): string {
  return (
    selectedTable.value?.fields.find(
      (field: SchemaField) => field.id === fieldId,
    )?.name ?? "Missing field"
  );
}

/**
 * Updates a textual or color property on the selected area.
 *
 * @param key target property
 * @param event input change event
 */
function updateAreaProperty(key: "title" | "color", event: Event): void {
  if (!selectedArea.value) return;

  const value: string = inputValue(event);
  schema.updateArea(selectedArea.value.id, {
    [key]: key === "title" ? value.trim() || "Untitled area" : value,
  });
}

/** Updates a selected area color from the View UI Plus picker. */
function updateAreaColor(color: string): void {
  if (selectedArea.value) schema.updateArea(selectedArea.value.id, { color });
}

/**
 * Updates the selected area's locked state.
 *
 * @param event checkbox change event
 */
function updateAreaLocked(event: Event): void {
  if (!selectedArea.value) return;

  schema.updateArea(selectedArea.value.id, {
    locked: (event.target as HTMLInputElement).checked,
  });
}

/** Updates the selected area locked state from a View UI Plus switch. */
function updateAreaLockedValue(value: boolean): void {
  if (selectedArea.value)
    schema.updateArea(selectedArea.value.id, { locked: value });
}

/** Updates a textual or color property on the selected note. */
function updateNoteProperty(
  key: "title" | "text" | "color",
  event: Event,
): void {
  if (!selectedNote.value) return;

  const target: HTMLInputElement | HTMLTextAreaElement = event.target as
    HTMLInputElement | HTMLTextAreaElement;
  schema.updateNote(selectedNote.value.id, {
    [key]:
      key === "title" ? target.value.trim() || "Untitled note" : target.value,
  });
}

/** Updates a selected note color from the View UI Plus picker. */
function updateNoteColor(color: string): void {
  if (selectedNote.value) schema.updateNote(selectedNote.value.id, { color });
}

/** Updates the selected note's locked state. */
function updateNoteLocked(event: Event): void {
  if (!selectedNote.value) return;

  schema.updateNote(selectedNote.value.id, {
    locked: (event.target as HTMLInputElement).checked,
  });
}

/** Updates the selected note locked state from a View UI Plus switch. */
function updateNoteLockedValue(value: boolean): void {
  if (selectedNote.value)
    schema.updateNote(selectedNote.value.id, { locked: value });
}

/** Changes the cardinality of the active relationship. */
function updateCardinality(cardinality: RelationCardinality): void {
  if (!selectedRelation.value) return;

  schema.updateRelation(selectedRelation.value.id, { cardinality });
}

/** Updates the SQL action used after a related parent row changes. */
function updateForeignKeyAction(
  key: "onDelete" | "onUpdate",
  action: ForeignKeyAction,
): void {
  if (!selectedRelation.value) return;

  schema.updateRelation(selectedRelation.value.id, { [key]: action });
}

/** Adds the next available field pair to a composite relationship. */
function addCompositePair(): void {
  if (
    !selectedRelation.value ||
    !sourceRelationTable.value ||
    !targetRelationTable.value
  )
    return;

  const source: SchemaField | undefined = sourceRelationTable.value.fields.find(
    (field: SchemaField) =>
      !selectedRelation.value?.sourceFieldIds.includes(field.id),
  );
  const target: SchemaField | undefined = targetRelationTable.value.fields.find(
    (field: SchemaField) =>
      !selectedRelation.value?.targetFieldIds.includes(field.id),
  );

  if (!source || !target) return;

  schema.addRelationPair(selectedRelation.value.id, source.id, target.id);
}

/** Adds the explicitly selected source/target pair to the composite key. */
function addSelectedCompositePair(): void {
  if (!selectedRelation.value || !pairSourceId.value || !pairTargetId.value)
    return;

  schema.addRelationPair(
    selectedRelation.value.id,
    pairSourceId.value,
    pairTargetId.value,
  );
  pairSourceId.value = "";
  pairTargetId.value = "";
}

/** Switches source and target sides for a relationship. */
function swapRelation(): void {
  if (!selectedRelation.value) return;

  schema.updateRelation(selectedRelation.value.id, {
    sourceTableId: selectedRelation.value.targetTableId,
    sourceFieldIds: selectedRelation.value.targetFieldIds,
    targetTableId: selectedRelation.value.sourceTableId,
    targetFieldIds: selectedRelation.value.sourceFieldIds,
  });
}

/** Resolves a field id to a readable table-field label. */
function fieldName(tableId: string, fieldId: string): string {
  return (
    schema.tables
      .find((table) => table.id === tableId)
      ?.fields.find((field: SchemaField) => field.id === fieldId)?.name ??
    "Missing field"
  );
}
</script>

<template>
  <aside class="schema-inspector">
    <template v-if="selectedTable">
      <header class="schema-inspector__header">
        <div>
          <small>TABLE</small>
          <h2>Table details</h2>
        </div>
        <span class="table-header-actions"
          ><button
            type="button"
            @click="schema.duplicateTable(selectedTable.id)"
          >
            Duplicate</button
          ><button
            type="button"
            class="danger-button"
            @click="schema.deleteTable(selectedTable.id)"
          >
            Delete
          </button></span
        >
      </header>
      <label class="form-field"
        ><span>Table name</span
        ><input :value="selectedTable.name" @change="updateTableName"
      /></label>
      <label class="form-field"
        ><span>Description</span
        ><input
          :value="selectedTable.comment"
          @change="updateTableProperty('comment', $event)"
      /></label>
      <label class="form-field"
        ><span>Table width</span
        ><input
          type="number"
          min="220"
          max="560"
          step="10"
          :value="selectedTable.width"
          aria-label="Table width"
          @change="updateTableWidth"
      /></label>
      <div class="table-options">
        <label
          >Color
          <ColorPicker
            :model-value="selectedTable.color"
            size="small"
            @on-change="updateTableColor" /></label
        ><label
          >Collapsed
          <Switch
            :model-value="selectedTable.collapsed"
            size="small"
            @on-change="updateTableFlagValue('collapsed', $event)" /></label
        ><label
          >Locked
          <Switch
            :model-value="selectedTable.locked"
            size="small"
            @on-change="updateTableFlagValue('locked', $event)"
        /></label>
      </div>
      <div v-if="schema.selectedTableIds.length > 1" class="bulk-table-actions">
        <strong>{{ schema.selectedTableIds.length }} tables selected</strong
        ><button type="button" @click="schema.setSelectedTablesLocked(true)">
          Lock all</button
        ><button type="button" @click="schema.setSelectedTablesLocked(false)">
          Unlock all</button
        ><button
          type="button"
          class="danger-button"
          @click="schema.deleteSelectedTables"
        >
          Delete all
        </button>
      </div>
      <section class="schema-inspector__section">
        <div class="section-title">
          <h3>Fields</h3>
          <button type="button" @click="schema.addField(selectedTable.id)">
            + Add
          </button>
        </div>
        <article
          v-for="(field, index) in selectedTable.fields"
          :key="field.id"
          class="field-editor"
        >
          <div class="field-editor__row">
            <input
              :value="field.name"
              aria-label="Field name"
              @change="updateField(field, 'name', $event)"
            /><button
              type="button"
              class="icon-button"
              :disabled="index === 0"
              @click="schema.moveField(selectedTable.id, field.id, -1)"
            >
              ↑</button
            ><button
              type="button"
              class="icon-button"
              :disabled="index === selectedTable.fields.length - 1"
              @click="schema.moveField(selectedTable.id, field.id, 1)"
            >
              ↓</button
            ><button
              type="button"
              class="icon-button"
              :disabled="selectedTable.fields.length === 1"
              @click="schema.deleteField(selectedTable.id, field.id)"
            >
              ×
            </button>
          </div>
          <Select
            :model-value="field.type"
            filterable
            allow-create
            size="small"
            aria-label="Field type"
            @on-change="
              schema.updateField(selectedTable.id, field.id, { type: $event })
            "
            ><Option v-for="type in typeOptions" :key="type" :value="type">{{
              type
            }}</Option></Select
          >
          <input
            :value="field.defaultValue"
            placeholder="Default value"
            @change="updateField(field, 'defaultValue', $event)"
          />
          <input
            :value="field.checkExpression"
            placeholder="CHECK expression, e.g. amount >= 0"
            @change="updateField(field, 'checkExpression', $event)"
          />
          <input
            :value="field.comment"
            placeholder="Field comment"
            @change="updateField(field, 'comment', $event)"
          />
          <div class="field-editor__checks">
            <label
              >PK
              <Switch
                :model-value="field.primary"
                size="small"
                @on-change="updateFieldBoolean(field, 'primary', $event)"
            /></label>
            <label
              >Unique
              <Switch
                :model-value="field.unique"
                size="small"
                @on-change="updateFieldBoolean(field, 'unique', $event)"
            /></label>
            <label
              >Nullable
              <Switch
                :model-value="field.nullable"
                size="small"
                @on-change="updateFieldBoolean(field, 'nullable', $event)"
            /></label>
            <label
              >Auto increment
              <Switch
                :model-value="field.autoIncrement"
                size="small"
                @on-change="updateFieldBoolean(field, 'autoIncrement', $event)"
            /></label>
            <label
              >Unsigned
              <Switch
                :model-value="field.unsigned"
                size="small"
                @on-change="updateFieldBoolean(field, 'unsigned', $event)"
            /></label>
          </div>
        </article>
      </section>
      <section class="schema-inspector__section">
        <div class="section-title">
          <h3>Indexes</h3>
          <span
            ><button
              type="button"
              @click="schema.addIndex(selectedTable.id, false)"
            >
              + Index</button
            ><button
              type="button"
              @click="schema.addIndex(selectedTable.id, true)"
            >
              + Unique
            </button></span
          >
        </div>
        <article
          v-for="index in selectedTable.indexes"
          :key="index.id"
          class="index-editor"
        >
          <div class="index-editor__header">
            <input
              :value="index.name"
              aria-label="Index name"
              @change="
                schema.updateIndex(selectedTable.id, index.id, {
                  name: inputValue($event),
                })
              "
            /><label
              >Unique
              <Switch
                :model-value="index.unique"
                size="small"
                @on-change="
                  schema.updateIndex(selectedTable.id, index.id, {
                    unique: $event,
                  })
                " /></label
            ><button
              type="button"
              class="icon-button"
              @click="schema.deleteIndex(selectedTable.id, index.id)"
            >
              ×
            </button>
          </div>
          <div class="index-editor__fields">
            <label v-for="field in selectedTable.fields" :key="field.id"
              >{{ field.name
              }}<Switch
                :model-value="index.fieldIds.includes(field.id)"
                size="small"
                :disabled="
                  index.fieldIds.length === 1 &&
                  index.fieldIds.includes(field.id)
                "
                @on-change="
                  schema.toggleIndexField(selectedTable.id, index.id, field.id)
                "
            /></label>
          </div>
          <ol class="index-editor__order">
            <li v-for="(fieldId, fieldIndex) in index.fieldIds" :key="fieldId">
              <code>{{ fieldIndex + 1 }}. {{ indexFieldName(fieldId) }}</code
              ><span
                ><button
                  type="button"
                  class="icon-button"
                  :disabled="fieldIndex === 0"
                  @click="
                    schema.moveIndexField(
                      selectedTable.id,
                      index.id,
                      fieldId,
                      -1,
                    )
                  "
                >
                  ↑</button
                ><button
                  type="button"
                  class="icon-button"
                  :disabled="fieldIndex === index.fieldIds.length - 1"
                  @click="
                    schema.moveIndexField(
                      selectedTable.id,
                      index.id,
                      fieldId,
                      1,
                    )
                  "
                >
                  ↓
                </button></span
              >
            </li>
          </ol>
        </article>
      </section>
    </template>
    <template v-else-if="selectedRelation">
      <header class="schema-inspector__header">
        <div>
          <small>RELATIONSHIP</small>
          <h2>Relation details</h2>
        </div>
        <button
          type="button"
          class="danger-button"
          @click="schema.deleteRelation(selectedRelation.id)"
        >
          Delete
        </button>
      </header>
      <label class="form-field"
        ><span>Cardinality</span
        ><Select
          :model-value="selectedRelation.cardinality"
          size="small"
          @on-change="updateCardinality"
          ><Option value="many-to-one">Many to one</Option
          ><Option value="one-to-many">One to many</Option
          ><Option value="one-to-one">One to one</Option></Select
        ></label
      >
      <label class="form-field"
        ><span>Constraint name</span
        ><input
          :value="selectedRelation.constraintName"
          placeholder="Auto-generated when empty"
          @change="
            schema.updateRelation(selectedRelation.id, {
              constraintName: inputValue($event),
            })
          "
      /></label>
      <div class="foreign-key-actions">
        <label
          >On delete
          <Select
            :model-value="selectedRelation.onDelete"
            size="small"
            @on-change="updateForeignKeyAction('onDelete', $event)"
            ><Option value="NO ACTION">NO ACTION</Option
            ><Option value="RESTRICT">RESTRICT</Option
            ><Option value="CASCADE">CASCADE</Option
            ><Option value="SET NULL">SET NULL</Option
            ><Option value="SET DEFAULT">SET DEFAULT</Option></Select
          ></label
        ><label
          >On update
          <Select
            :model-value="selectedRelation.onUpdate"
            size="small"
            @on-change="updateForeignKeyAction('onUpdate', $event)"
            ><Option value="NO ACTION">NO ACTION</Option
            ><Option value="RESTRICT">RESTRICT</Option
            ><Option value="CASCADE">CASCADE</Option
            ><Option value="SET NULL">SET NULL</Option
            ><Option value="SET DEFAULT">SET DEFAULT</Option></Select
          ></label
        >
      </div>
      <section class="schema-inspector__section">
        <div class="section-title">
          <h3>Field pairs</h3>
          <button type="button" @click="swapRelation">Swap direction</button>
        </div>
        <div
          v-for="(sourceId, index) in selectedRelation.sourceFieldIds"
          :key="`${sourceId}:${selectedRelation.targetFieldIds[index]}`"
          class="relation-pair"
        >
          <code>{{ fieldName(selectedRelation.sourceTableId, sourceId) }}</code
          ><span>→</span
          ><code>{{
            fieldName(
              selectedRelation.targetTableId,
              selectedRelation.targetFieldIds[index],
            )
          }}</code
          ><button
            type="button"
            class="icon-button"
            :disabled="selectedRelation.sourceFieldIds.length === 1"
            @click="schema.deleteRelationPair(selectedRelation.id, index)"
          >
            ×
          </button>
        </div>
        <div class="relation-pair">
          <Select v-model="pairSourceId" size="small" placeholder="Source field"
            ><Option
              v-for="field in sourceRelationTable?.fields"
              :key="field.id"
              :value="field.id"
              >{{ field.name }}</Option
            ></Select
          ><span>→</span
          ><Select
            v-model="pairTargetId"
            size="small"
            placeholder="Target field"
            ><Option
              v-for="field in targetRelationTable?.fields"
              :key="field.id"
              :value="field.id"
              >{{ field.name }}</Option
            ></Select
          ><button
            type="button"
            class="icon-button"
            @click="addSelectedCompositePair"
          >
            +
          </button>
        </div>
      </section>
    </template>
    <template v-else-if="selectedArea">
      <header class="schema-inspector__header">
        <div>
          <small>AREA</small>
          <h2>Area details</h2>
        </div>
        <button
          type="button"
          class="danger-button"
          @click="schema.deleteArea(selectedArea.id)"
        >
          Delete
        </button>
      </header>
      <label class="form-field"
        ><span>Title</span
        ><input
          :value="selectedArea.title"
          aria-label="Area title property"
          @change="updateAreaProperty('title', $event)"
      /></label>
      <div class="table-options">
        <label
          >Color
          <ColorPicker
            :model-value="selectedArea.color"
            size="small"
            @on-change="updateAreaColor" /></label
        ><label
          >Locked
          <Switch
            :model-value="selectedArea.locked"
            size="small"
            @on-change="updateAreaLockedValue"
        /></label>
      </div>
      <section class="schema-inspector__section">
        <div class="section-title"><h3>Geometry</h3></div>
        <div class="area-geometry">
          <span>X {{ Math.round(selectedArea.x) }}</span
          ><span>Y {{ Math.round(selectedArea.y) }}</span
          ><span>W {{ Math.round(selectedArea.width) }}</span
          ><span>H {{ Math.round(selectedArea.height) }}</span>
        </div>
      </section>
    </template>
    <template v-else-if="selectedNote">
      <header class="schema-inspector__header">
        <div>
          <small>NOTE</small>
          <h2>Note details</h2>
        </div>
        <button
          type="button"
          class="danger-button"
          @click="schema.deleteNote(selectedNote.id)"
        >
          Delete
        </button>
      </header>
      <label class="form-field"
        ><span>Title</span
        ><input
          :value="selectedNote.title"
          aria-label="Note title property"
          @change="updateNoteProperty('title', $event)"
      /></label>
      <label class="form-field"
        ><span>Content</span
        ><textarea
          :value="selectedNote.text"
          aria-label="Note content property"
          @change="updateNoteProperty('text', $event)"
        />
      </label>
      <div class="table-options">
        <label
          >Color
          <ColorPicker
            :model-value="selectedNote.color"
            size="small"
            @on-change="updateNoteColor" /></label
        ><label
          >Locked
          <Switch
            :model-value="selectedNote.locked"
            size="small"
            @on-change="updateNoteLockedValue"
        /></label>
      </div>
      <section class="schema-inspector__section">
        <div class="section-title"><h3>Geometry</h3></div>
        <div class="area-geometry">
          <span>X {{ Math.round(selectedNote.x) }}</span
          ><span>Y {{ Math.round(selectedNote.y) }}</span
          ><span>W {{ Math.round(selectedNote.width) }}</span
          ><span>H {{ Math.round(selectedNote.height) }}</span>
        </div>
      </section>
    </template>
    <div v-else class="schema-inspector__empty">
      <strong>Select an element</strong
      ><span>Click a table, relationship, area, or note to edit it.</span>
    </div>
  </aside>
</template>
