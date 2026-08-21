<script setup lang="ts">
import { computed } from "vue";
import { Codemirror } from "vue-codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  MSSQL,
  MySQL,
  PostgreSQL,
  SQLite,
  sql as sqlLanguage,
  type SQLDialect,
} from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { useSchemaStore } from "../stores/schema";
import type { DatabaseDialect } from "../types/schema";
import { generateSql } from "../utils/sql";
import { showFeedback } from "../utils/feedback";

const emit = defineEmits<{ close: [] }>();
const schema = useSchemaStore();
const sql = computed<string>(() =>
  generateSql({
    dialect: schema.dialect,
    enums: schema.enums,
    customTypes: schema.customTypes,
    notes: schema.notes,
    areas: schema.areas,
    tables: schema.tables,
    relations: schema.relations,
  }),
);
const sqlExtensions = computed<Extension[]>((): Extension[] => [
  sqlLanguage({ dialect: codeDialect(schema.dialect) }),
  oneDark,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
]);

/** Resolves the active schema dialect into CodeMirror's SQL grammar variant. */
function codeDialect(dialect: DatabaseDialect): SQLDialect {
  if (dialect === "postgresql") return PostgreSQL;

  if (dialect === "sqlserver") return MSSQL;

  if (dialect === "sqlite") return SQLite;

  return MySQL;
}

/** Copies generated DDL through the browser clipboard API. */
async function copySql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(sql.value);
    showFeedback("SQL copied.");
  } catch {
    showFeedback(
      "Clipboard access was unavailable. Select and copy the SQL manually.",
      true,
    );
  }
}

/** Downloads the generated DDL with a useful dialect-specific name. */
function downloadSql(): void {
  const blob: Blob = new Blob([sql.value], {
    type: "application/sql;charset=utf-8",
  });
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement("a");
  anchor.href = url;
  anchor.download = `database-schema.${schema.dialect}.sql`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Modal
    :model-value="true"
    title="SQL DDL preview"
    width="920"
    :footer-hide="true"
    :mask-closable="true"
    class-name="sql-preview-modal"
    @on-cancel="emit('close')"
  >
    <section class="sql-preview" aria-label="SQL DDL preview">
      <header class="sql-preview__header">
        <div>
          <small>GENERATED DDL</small>
          <h2>{{ schema.dialect }} SQL</h2>
        </div>
        <div>
          <button type="button" @click="copySql">Copy</button
          ><button type="button" @click="downloadSql">Download .sql</button
          ><button
            type="button"
            class="icon-button"
            aria-label="Close SQL preview"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </header>
      <Codemirror
        :model-value="sql"
        :extensions="sqlExtensions"
        :auto-destroy="true"
        aria-label="Generated SQL with syntax highlighting"
        class="sql-preview__editor"
      />
    </section>
  </Modal>
</template>
