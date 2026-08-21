<script setup lang="ts">
import { computed } from "vue";
import { useSchemaStore } from "../stores/schema";
import type {
  ElementReference,
  SchemaField,
  SchemaRelation,
  SchemaTable,
} from "../types/schema";
import { isTypeSupported } from "../utils/dialects";

const schema = useSchemaStore();

interface SchemaIssue {
  message: string;
  reference: ElementReference;
}

/** Produces model warnings without mutating the diagram. */
const issues = computed<SchemaIssue[]>(() => {
  const messages: SchemaIssue[] = [];
  const tableNames: Set<string> = new Set();
  schema.tables.forEach((table: SchemaTable) => {
    const name: string = table.name.trim().toLowerCase();

    if (tableNames.has(name)) {
      messages.push({
        message: `Duplicate table: ${table.name}`,
        reference: { type: "table", id: table.id },
      });
    }

    tableNames.add(name);
    const fieldNames: Set<string> = new Set();

    table.fields.forEach((field: SchemaField) => {
      const fieldName: string = field.name.trim().toLowerCase();

      if (fieldNames.has(fieldName)) {
        messages.push({
          message: `Duplicate field: ${table.name}.${field.name}`,
          reference: { type: "table", id: table.id },
        });
      }

      fieldNames.add(fieldName);

      const namedType: boolean =
        schema.enums.some(
          (item) => item.name.toLowerCase() === field.type.toLowerCase(),
        ) ||
        schema.customTypes.some(
          (item) => item.name.toLowerCase() === field.type.toLowerCase(),
        );

      if (!namedType && !isTypeSupported(schema.dialect, field.type)) {
        messages.push({
          message: `Unsupported ${schema.dialect} type: ${table.name}.${field.name} (${field.type})`,
          reference: { type: "table", id: table.id },
        });
      }
    });

    table.indexes.forEach((index) => {
      if (index.fieldIds.length === 0) {
        messages.push({
          message: `Empty index: ${table.name}.${index.name}`,
          reference: { type: "table", id: table.id },
        });
      }
    });
  });
  schema.relations.forEach((relation: SchemaRelation) => {
    const source: SchemaTable | undefined = schema.tables.find(
      (table: SchemaTable) => table.id === relation.sourceTableId,
    );
    const target: SchemaTable | undefined = schema.tables.find(
      (table: SchemaTable) => table.id === relation.targetTableId,
    );

    if (!source || !target) {
      messages.push({
        message: "Relationship references a missing table.",
        reference: { type: "relation", id: relation.id },
      });
      return;
    }

    relation.sourceFieldIds.forEach((sourceId: string, index: number) => {
      const from: SchemaField | undefined = source.fields.find(
        (field: SchemaField) => field.id === sourceId,
      );
      const to: SchemaField | undefined = target.fields.find(
        (field: SchemaField) => field.id === relation.targetFieldIds[index],
      );

      if (!from || !to) {
        messages.push({
          message: "Relationship references a missing field.",
          reference: { type: "relation", id: relation.id },
        });
      } else if (from.type !== to.type) {
        messages.push({
          message: `Foreign key type mismatch: ${source.name}.${from.name} → ${target.name}.${to.name}`,
          reference: { type: "relation", id: relation.id },
        });
      }
    });
  });
  return messages;
});
</script>

<template>
  <aside class="schema-issues">
    <strong>Schema checks</strong>
    <span v-if="issues.length === 0">No issues found.</span>
    <ul v-else>
      <li
        v-for="issue in issues"
        :key="`${issue.reference.type}:${issue.reference.id}:${issue.message}`"
      >
        <button type="button" @click="schema.locateElement(issue.reference)">
          {{ issue.message }}
        </button>
      </li>
    </ul>
  </aside>
</template>
