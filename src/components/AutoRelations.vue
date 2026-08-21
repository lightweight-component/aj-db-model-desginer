<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSchemaStore } from "../stores/schema";
import type {
  AutoRelationCandidate,
  SchemaField,
  SchemaTable,
} from "../types/schema";
import { showFeedback } from "../utils/feedback";

const emit = defineEmits<{ close: [] }>();
const schema = useSchemaStore();
const selectedKeys = ref<string[]>([]);
const candidates = computed<AutoRelationCandidate[]>(() =>
  schema.suggestAutoRelations(),
);

/** Returns a stable key for selection within the inference dialog. */
function candidateKey(candidate: AutoRelationCandidate): string {
  return `${candidate.sourceTableId}:${candidate.sourceFieldId}:${candidate.targetTableId}:${candidate.targetFieldId}`;
}

/** Resolves a relationship endpoint into readable table and field names. */
function endpointLabel(tableId: string, fieldId: string): string {
  const table: SchemaTable | undefined = schema.tables.find(
    (item: SchemaTable): boolean => item.id === tableId,
  );
  const field: SchemaField | undefined = table?.fields.find(
    (item: SchemaField): boolean => item.id === fieldId,
  );

  return table && field ? `${table.name}.${field.name}` : "Deleted endpoint";
}

/** Updates the selected suggestion set. */
function setSelected(
  candidate: AutoRelationCandidate,
  selected: boolean,
): void {
  const key: string = candidateKey(candidate);

  if (selected) {
    selectedKeys.value = [...new Set<string>([...selectedKeys.value, key])];

    return;
  }

  selectedKeys.value = selectedKeys.value.filter(
    (item: string): boolean => item !== key,
  );
}

/** Creates every checked suggestion as one undoable batch. */
function createSelectedRelations(): void {
  const selected: Set<string> = new Set<string>(selectedKeys.value);
  const count: number = schema.createAutoRelations(
    candidates.value.filter((candidate: AutoRelationCandidate): boolean =>
      selected.has(candidateKey(candidate)),
    ),
  );

  if (count === 0) {
    showFeedback("No valid inferred relationships were available.", true);

    return;
  }

  showFeedback(`${count} relationship${count === 1 ? "" : "s"} created.`);
  emit("close");
}

watch(
  candidates,
  (items: AutoRelationCandidate[]): void => {
    selectedKeys.value = items.map((candidate: AutoRelationCandidate): string =>
      candidateKey(candidate),
    );
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :model-value="true"
    title="Infer relationships"
    width="680"
    ok-text="Create selected"
    cancel-text="Cancel"
    :ok-disabled="selectedKeys.length === 0"
    @on-ok="createSelectedRelations"
    @on-cancel="emit('close')"
  >
    <p class="auto-relations-intro">
      Suggestions use conventional foreign-key names and compatible field types.
      Review the batch before creating it.
    </p>
    <div v-if="candidates.length" class="auto-relations-list">
      <article
        v-for="candidate in candidates"
        :key="candidateKey(candidate)"
        class="auto-relations-item"
      >
        <Switch
          :model-value="selectedKeys.includes(candidateKey(candidate))"
          @on-change="(value: boolean) => setSelected(candidate, value)"
        />
        <div>
          <strong>{{
            endpointLabel(candidate.sourceTableId, candidate.sourceFieldId)
          }}</strong
          ><span>→</span
          ><strong>{{
            endpointLabel(candidate.targetTableId, candidate.targetFieldId)
          }}</strong
          ><small>{{ candidate.reason }}</small>
        </div>
        <em>{{ candidate.score }}%</em>
      </article>
    </div>
    <p v-else class="empty-state">
      No safe relationships were inferred. Add fields such as
      <code>user_id</code> alongside a compatible <code>users.id</code> key.
    </p>
  </Modal>
</template>

<style scoped>
.auto-relations-intro {
  margin: 0 0 14px;
  color: #65708b;
}
.auto-relations-list {
  display: grid;
  gap: 8px;
  max-height: min(52vh, 430px);
  overflow: auto;
}
.auto-relations-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e5e9f2;
  border-radius: 8px;
}
.auto-relations-item div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.auto-relations-item small {
  width: 100%;
  color: #7d879d;
}
.auto-relations-item em {
  color: #20a67a;
  font-style: normal;
  font-weight: 700;
}
.empty-state {
  margin: 0;
  color: #65708b;
}
</style>
