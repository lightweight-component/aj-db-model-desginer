<script setup lang="ts">
import { computed, ref } from "vue";
import { useSchemaStore } from "../stores/schema";
import type { CanvasElementType, ElementReference, SchemaArea, SchemaNote, SchemaRelation, SchemaTable } from "../types/schema";

type NavigatorFilter = "all" | CanvasElementType;

interface NavigatorItem {
  reference: ElementReference;
  title: string;
  detail: string;
  searchable: string;
}

const schema = useSchemaStore();
const query = ref<string>("");
const filter = ref<NavigatorFilter>("all");
const filters: Array<{ value: NavigatorFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "table", label: "Tables" },
  { value: "relation", label: "Relations" },
  { value: "area", label: "Areas" },
  { value: "note", label: "Notes" },
];

const items = computed<NavigatorItem[]>(() => {
  const tables: NavigatorItem[] = schema.tables.map((table: SchemaTable) => ({ reference: { type: "table", id: table.id }, title: table.name, detail: `${table.fields.length} fields`, searchable: `${table.name} ${table.comment} ${table.fields.map((field) => `${field.name} ${field.type}`).join(" ")}` }));
  const relations: NavigatorItem[] = schema.relations.map((relation: SchemaRelation) => { const source: SchemaTable | undefined = schema.tables.find((table: SchemaTable) => table.id === relation.sourceTableId); const target: SchemaTable | undefined = schema.tables.find((table: SchemaTable) => table.id === relation.targetTableId); const title: string = `${source?.name ?? "Missing table"} → ${target?.name ?? "Missing table"}`; return { reference: { type: "relation", id: relation.id }, title, detail: relation.cardinality, searchable: `${title} ${relation.constraintName} ${relation.cardinality}` }; });
  const areas: NavigatorItem[] = schema.areas.map((area: SchemaArea) => ({ reference: { type: "area", id: area.id }, title: area.title, detail: `${Math.round(area.width)} × ${Math.round(area.height)}`, searchable: area.title }));
  const notes: NavigatorItem[] = schema.notes.map((note: SchemaNote) => ({ reference: { type: "note", id: note.id }, title: note.title, detail: note.text.trim().slice(0, 48) || "Empty note", searchable: `${note.title} ${note.text}` }));
  const normalizedQuery: string = query.value.trim().toLowerCase();

  return [...tables, ...relations, ...areas, ...notes].filter((item: NavigatorItem) => (filter.value === "all" || item.reference.type === filter.value) && (!normalizedQuery || item.searchable.toLowerCase().includes(normalizedQuery)));
});
const selectableItems = computed<NavigatorItem[]>(() => items.value.filter((item: NavigatorItem) => item.reference.type !== "relation"));

/** Returns the current count for one navigator filter. */
function count(type: NavigatorFilter): number {
  if (type === "all")
    return schema.tables.length + schema.relations.length + schema.areas.length + schema.notes.length;

  if (type === "table")
    return schema.tables.length;

  if (type === "relation")
    return schema.relations.length;

  if (type === "area")
    return schema.areas.length;

  return schema.notes.length;
}

/** Checks whether a navigator row belongs to the unified selection. */
function isSelected(reference: ElementReference): boolean {
  return schema.selectedElements.some((element: ElementReference) => element.type === reference.type && element.id === reference.id);
}

/** Locates one row and preserves selection when a platform modifier is held. */
function locateItem(event: MouseEvent, reference: ElementReference): void {
  schema.locateElement(reference, event.ctrlKey || event.metaKey);
}

/** Selects every visible movable result for batch operations. */
function selectVisible(): void {
  schema.selectElements(selectableItems.value.map((item: NavigatorItem) => item.reference), false);
}
</script>

<template>
  <aside class="schema-navigator">
    <header><small>DIAGRAM</small><h2>Objects</h2><span>{{ count("all") }}</span></header>
    <label class="schema-navigator__search"><span class="visually-hidden">Search diagram objects</span><input v-model="query" type="search" placeholder="Search names, fields, types…" aria-label="Search diagram objects" /></label>
    <nav class="schema-navigator__filters" aria-label="Diagram object filters"><button v-for="item in filters" :key="item.value" type="button" :class="{ 'is-active': filter === item.value }" @click="filter = item.value"><span>{{ item.label }}</span><b>{{ count(item.value) }}</b></button></nav>
    <div class="schema-navigator__batch"><span>{{ schema.selectedElements.length }} selected</span><button type="button" :disabled="selectableItems.length === 0" @click="selectVisible">Select shown</button><button type="button" :disabled="schema.selectedElements.length === 0" @click="schema.selectElements([], false)">Clear</button><button type="button" class="is-danger" :disabled="schema.selectedElements.length === 0" @click="schema.deleteSelectedElements">Delete</button></div>
    <div class="schema-navigator__list">
      <button v-for="item in items" :key="`${item.reference.type}:${item.reference.id}`" type="button" class="schema-navigator__item" :class="{ 'is-selected': isSelected(item.reference) }" @click="locateItem($event, item.reference)"><i :class="`is-${item.reference.type}`" /><span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span><em>⌖</em></button>
      <p v-if="items.length === 0" class="schema-navigator__empty">No matching objects.</p>
    </div>
  </aside>
</template>
