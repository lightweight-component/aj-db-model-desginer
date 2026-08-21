<script setup lang="ts">
import SchemaCanvas from "./components/SchemaCanvas.vue";
import DbmlEditor from "./components/DbmlEditor.vue";
import AutoRelations from "./components/AutoRelations.vue";
import TemplateLibrary from "./components/TemplateLibrary.vue";
import SchemaInspector from "./components/SchemaInspector.vue";
import SchemaIssues from "./components/SchemaIssues.vue";
import SchemaNavigator from "./components/SchemaNavigator.vue";
import { defineAsyncComponent, onBeforeUnmount, ref, watch } from "vue";
import TypeManager from "./components/TypeManager.vue";
import { useSchemaStore } from "./stores/schema";
import type { DatabaseDialect } from "./types/schema";
import type { SchemaTemplate } from "./data/schemaTemplates";

const schema = useSchemaStore();
const SchemaSqlPreview = defineAsyncComponent(
  () => import("./components/SqlPreview.vue"),
);
const sqlPreviewVisible = ref<boolean>(false);
const typeManagerVisible = ref<boolean>(false);
const dbmlEditorVisible = ref<boolean>(false);
const autoRelationsVisible = ref<boolean>(false);
const newDiagramVisible = ref<boolean>(false);
const templateLibraryVisible = ref<boolean>(false);
const saveStatus = ref<string>(
  schema.restoreLocalDraft() ?? "Automatic recovery enabled",
);
const theme = ref<"light" | "dark">(loadTheme());
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Restores the user's theme preference or follows the system on first use. */
function loadTheme(): "light" | "dark" {
  try {
    const savedTheme: string | null = window.localStorage.getItem(
      "aj-db-model-designer:theme",
    );

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Starts a clean diagram after confirming loss of the active canvas. */
function createDiagram(): void {
  if (
    schema.tables.length > 0 ||
    schema.notes.length > 0 ||
    schema.areas.length > 0
  ) {
    newDiagramVisible.value = true;

    return;
  }

  schema.newDiagram();
  saveStatus.value = "Blank diagram created";
}

/** Confirms replacement of the active diagram from the View UI Plus modal. */
function confirmNewDiagram(): void {
  schema.newDiagram();
  newDiagramVisible.value = false;
  saveStatus.value = "Blank diagram created";
}

/** Creates a new document populated by the selected starter template. */
function createFromTemplate(template: SchemaTemplate): void {
  schema.newDiagramFromTemplate(template.diagram);
  templateLibraryVisible.value = false;
  saveStatus.value = `Created from ${template.name}`;
}

/** Switches the application palette and stores the explicit preference. */
function toggleTheme(): void {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

/** Applies the editable document title. */
function renameDiagram(event: Event): void {
  const input: HTMLInputElement = event.target as HTMLInputElement;
  const error: string | null = schema.renameDiagram(input.value);

  if (error) {
    input.value = schema.diagramName;
  }
}

/** Changes the type catalogue used for field suggestions and validation. */
function changeDialect(value: DatabaseDialect): void {
  schema.setDialect(value);
}

watch(
  (): string => schema.exportJson(),
  (): void => {
    saveStatus.value = "Saving…";

    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout((): void => {
      const error: string | null = schema.saveLocalDraft();

      saveStatus.value =
        error ??
        `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }, 500);
  },
);

watch(
  (): string => schema.diagramName,
  (name: string): void => {
    document.title = `${name} · AJ Database Model Designer`;
  },
  { immediate: true },
);
watch(
  theme,
  (value: "light" | "dark"): void => {
    document.documentElement.dataset.theme = value;

    try {
      window.localStorage.setItem("aj-db-model-designer:theme", value);
    } catch {
      // The interface remains usable when browser storage is unavailable.
    }
  },
  { immediate: true },
);
onBeforeUnmount((): void => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
});
</script>

<template>
  <main class="designer-app">
    <header class="designer-header">
      <div class="designer-brand">
        <small>AJ TOOLS</small>
        <h1>Database model designer</h1>
      </div>
      <div class="diagram-document">
        <button type="button" @click="createDiagram">New</button>
        <button type="button" @click="templateLibraryVisible = true">
          Templates
        </button>
        <label
          ><span>Diagram name</span
          ><input
            :value="schema.diagramName"
            maxlength="80"
            aria-label="Diagram name"
            @change="renameDiagram"
            @blur="renameDiagram"
            @keyup.enter="renameDiagram"
        /></label>
        <small role="status">{{ saveStatus }}</small>
      </div>
      <label class="dialect-picker"
        >Dialect
        <Select
          :model-value="schema.dialect"
          size="small"
          @on-change="changeDialect"
          ><Option value="generic">Generic</Option
          ><Option value="mysql">MySQL</Option
          ><Option value="mariadb">MariaDB</Option
          ><Option value="postgresql">PostgreSQL</Option
          ><Option value="sqlserver">SQL Server</Option
          ><Option value="sqlite">SQLite</Option
          ><Option value="oracle">Oracle</Option></Select
        ></label
      >
      <button
        type="button"
        class="sql-preview-trigger"
        @click="sqlPreviewVisible = true"
      >
        Preview SQL
      </button>
      <button
        type="button"
        class="sql-preview-trigger"
        @click="dbmlEditorVisible = true"
      >
        Edit DBML
      </button>
      <button
        type="button"
        class="sql-preview-trigger"
        @click="autoRelationsVisible = true"
      >
        Infer relations
      </button>
      <button
        type="button"
        class="sql-preview-trigger"
        @click="typeManagerVisible = true"
      >
        Schema types
      </button>
      <button
        type="button"
        class="theme-toggle"
        :aria-label="theme === 'dark' ? 'Use light theme' : 'Use dark theme'"
        @click="toggleTheme"
      >
        {{ theme === "dark" ? "◐ Light" : "☀ Dark" }}
      </button>
      <SchemaIssues />
    </header>
    <section class="designer-workspace">
      <SchemaNavigator /><SchemaCanvas /><SchemaInspector />
    </section>
    <SchemaSqlPreview
      v-if="sqlPreviewVisible"
      @close="sqlPreviewVisible = false"
    />
    <DbmlEditor v-if="dbmlEditorVisible" @close="dbmlEditorVisible = false" />
    <AutoRelations
      v-if="autoRelationsVisible"
      @close="autoRelationsVisible = false"
    />
    <TypeManager
      v-if="typeManagerVisible"
      @close="typeManagerVisible = false"
    />
    <TemplateLibrary
      v-if="templateLibraryVisible"
      @close="templateLibraryVisible = false"
      @select="createFromTemplate"
    />
    <Modal
      v-model="newDiagramVisible"
      title="Create blank diagram"
      ok-text="Create"
      cancel-text="Keep editing"
      @on-ok="confirmNewDiagram"
      ><p>
        Create a blank diagram? The current document remains in automatic
        recovery until the new document is saved.
      </p></Modal
    >
  </main>
</template>
