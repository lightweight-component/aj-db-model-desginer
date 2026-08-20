<script setup lang="ts">
import SchemaCanvas from "./components/SchemaCanvas.vue";
import SchemaInspector from "./components/SchemaInspector.vue";
import SchemaIssues from "./components/SchemaIssues.vue";
import SchemaNavigator from "./components/SchemaNavigator.vue";
import { ref } from "vue";
import SchemaSqlPreview from "./components/SqlPreview.vue";
import TypeManager from "./components/TypeManager.vue";
import { useSchemaStore } from "./stores/schema";
import type { DatabaseDialect } from "./types/schema";

const schema = useSchemaStore();
const sqlPreviewVisible = ref<boolean>(false);
const typeManagerVisible = ref<boolean>(false);

/** Changes the type catalogue used for field suggestions and validation. */
function changeDialect(event: Event): void {
  schema.setDialect((event.target as HTMLSelectElement).value as DatabaseDialect);
}
</script>

<template>
  <main class="designer-app">
    <header class="designer-header">
      <div><small>AJ TOOLS</small><h1>Database model designer</h1></div>
      <p>Schema editor · SVG relations · local draft</p>
      <label class="dialect-picker">Dialect <select :value="schema.dialect" @change="changeDialect"><option value="mysql">MySQL</option><option value="postgresql">PostgreSQL</option><option value="sqlserver">SQL Server</option><option value="sqlite">SQLite</option></select></label>
      <button type="button" class="sql-preview-trigger" @click="sqlPreviewVisible = true">Preview SQL</button>
      <button type="button" class="sql-preview-trigger" @click="typeManagerVisible = true">Schema types</button>
      <SchemaIssues />
    </header>
    <section class="designer-workspace"><SchemaNavigator /><SchemaCanvas /><SchemaInspector /></section>
    <SchemaSqlPreview v-if="sqlPreviewVisible" @close="sqlPreviewVisible = false" />
    <TypeManager v-if="typeManagerVisible" @close="typeManagerVisible = false" />
  </main>
</template>
