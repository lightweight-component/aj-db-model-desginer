<script setup lang="ts">
import { computed, ref } from "vue";
import { useSchemaStore } from "../stores/schema";
import { generateSql } from "../utils/sql";

const emit = defineEmits<{ close: [] }>();
const schema = useSchemaStore();
const message = ref<string>("");
const sql = computed<string>(() => generateSql({ dialect: schema.dialect, enums: schema.enums, customTypes: schema.customTypes, notes: schema.notes, areas: schema.areas, tables: schema.tables, relations: schema.relations }));

/** Copies generated DDL through the browser clipboard API. */
async function copySql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(sql.value);
    message.value = "SQL copied.";
  } catch {
    message.value = "Clipboard access was unavailable. Select and copy the SQL manually.";
  }
}

/** Downloads the generated DDL with a useful dialect-specific name. */
function downloadSql(): void {
  const blob: Blob = new Blob([sql.value], { type: "application/sql;charset=utf-8" });
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement("a");
  anchor.href = url;
  anchor.download = `database-schema.${schema.dialect}.sql`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="sql-preview-backdrop" @click.self="emit('close')">
    <section class="sql-preview" role="dialog" aria-modal="true" aria-label="SQL DDL preview">
      <header class="sql-preview__header">
        <div><small>GENERATED DDL</small><h2>{{ schema.dialect }} SQL</h2></div>
        <div><button type="button" @click="copySql">Copy</button><button type="button" @click="downloadSql">Download .sql</button><button type="button" class="icon-button" aria-label="Close SQL preview" @click="emit('close')">×</button></div>
      </header>
      <p v-if="message" class="sql-preview__message">{{ message }}</p>
      <pre><code>{{ sql }}</code></pre>
    </section>
  </div>
</template>
