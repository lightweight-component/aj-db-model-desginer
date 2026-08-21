<script setup lang="ts">
import { computed, ref } from "vue";
import { useSchemaStore } from "../stores/schema";
import type { SchemaCustomType, SchemaEnum } from "../types/schema";
import { customTypeDefinition } from "../utils/customTypes";
import { typeBase, typesForDialect } from "../utils/dialects";

const emit = defineEmits<{ close: [] }>();
const schema = useSchemaStore();
const messages = ref<Record<string, string>>({});
const customBaseTypes = computed<string[]>(() => [
  ...new Set(typesForDialect(schema.dialect).map((type: string) => typeBase(type))),
]);

/** Stores or clears one type-specific validation message. */
function setMessage(id: string, message: string | null): void {
  messages.value[id] = message ?? "";
}

/** Renames an enum and updates every referencing field through the store. */
function renameEnum(item: SchemaEnum, event: Event): void {
  const nextName: string = (event.target as HTMLInputElement).value.trim() || item.name;
  setMessage(item.id, schema.updateEnum(item.id, { name: nextName }));
}

/** Updates one enum value while displaying uniqueness errors inline. */
function updateEnumValue(item: SchemaEnum, index: number, event: Event): void {
  const nextValue: string = (event.target as HTMLInputElement).value;

  setMessage(item.id, schema.updateEnumValue(item.id, index, nextValue));
}

/** Renames a custom type and updates every referencing field through the store. */
function renameCustomType(item: SchemaCustomType, event: Event): void {
  const nextName: string = (event.target as HTMLInputElement).value.trim() || item.name;
  setMessage(item.id, schema.updateCustomType(item.id, { name: nextName }));
}

/** Changes the custom type base and initializes relevant parameter controls. */
function updateBaseType(item: SchemaCustomType, baseType: string): void {
  const decimal: boolean = /^(DECIMAL|NUMERIC)$/i.test(baseType);
  const lengthType: boolean = /CHAR|BINARY/i.test(baseType);

  setMessage(
    item.id,
    schema.updateCustomType(item.id, {
      baseType,
      length: lengthType ? (item.length ?? 255) : null,
      precision: decimal ? (item.precision ?? 10) : null,
      scale: decimal ? (item.scale ?? 2) : null,
    }),
  );
}

/** Reads an optional positive numeric custom-type parameter. */
function optionalNumber(event: Event): number | null {
  const value: string = (event.target as HTMLInputElement).value;

  return value === "" ? null : Number(value);
}
</script>

<template>
  <div class="type-manager-backdrop" @click.self="emit('close')">
    <section class="type-manager" role="dialog" aria-modal="true" aria-label="Enum and custom type manager">
      <header>
        <div>
          <small>SCHEMA TYPES</small>
          <h2>Enums and custom types</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Close type manager" @click="emit('close')">
          ×
        </button>
      </header>
      <section>
        <div class="section-title">
          <div>
            <h3>Enums</h3>
            <small>Named sets of distinct values</small>
          </div>
          <button type="button" @click="schema.addEnum">+ Add enum</button>
        </div>
        <article v-for="item in schema.enums" :key="item.id" class="schema-type-card">
          <div class="schema-type-card__header">
            <input :value="item.name" aria-label="Enum name" placeholder="Enum name"
              @change="renameEnum(item, $event)" /><span>{{ schema.schemaTypeUsage(item.name) }}
              references</span><button type="button" class="danger-button" :title="schema.schemaTypeUsage(item.name)
                ? 'Referenced fields become VARCHAR(255)'
                : 'Delete enum'
                " @click="schema.deleteEnum(item.id)">
              Delete
            </button>
          </div>
          <label class="schema-type-card__comment"><span>Description</span><input :value="item.comment"
              placeholder="Optional description" @change="
                schema.updateEnum(item.id, {
                  comment: ($event.target as HTMLInputElement).value,
                })
                " /></label>
          <div class="enum-values">
            <div v-for="(value, index) in item.values" :key="`${index}:${value}`" class="enum-value">
              <b>{{ index + 1 }}</b><input :value="value" aria-label="Enum value"
                @change="updateEnumValue(item, index, $event)" /><button type="button" class="icon-button"
                :disabled="index === 0" @click="schema.moveEnumValue(item.id, index, -1)">
                ↑</button><button type="button" class="icon-button" :disabled="index === item.values.length - 1"
                @click="schema.moveEnumValue(item.id, index, 1)">
                ↓</button><button type="button" class="icon-button" :disabled="item.values.length === 1"
                @click="schema.deleteEnumValue(item.id, index)">
                ×
              </button>
            </div>
          </div>
          <button type="button" class="schema-type-card__add" @click="schema.addEnumValue(item.id)">
            + Add value
          </button>
          <p v-if="messages[item.id]" class="schema-type-card__error">
            {{ messages[item.id] }}
          </p>
        </article>
        <p v-if="schema.enums.length === 0" class="schema-type-empty">
          No enums defined.
        </p>
      </section>
      <section>
        <div class="section-title">
          <div>
            <h3>Custom types</h3>
            <small>Reusable aliases for concrete database types</small>
          </div>
          <button type="button" @click="schema.addCustomType">
            + Add type
          </button>
        </div>
        <article v-for="item in schema.customTypes" :key="item.id" class="schema-type-card">
          <div class="schema-type-card__header">
            <input :value="item.name" aria-label="Custom type name" placeholder="Type name"
              @change="renameCustomType(item, $event)" /><span>{{ schema.schemaTypeUsage(item.name) }}
              references</span><button type="button" class="danger-button"
              :title="`Referenced fields become ${customTypeDefinition(item)}`"
              @click="schema.deleteCustomType(item.id)">
              Delete
            </button>
          </div>
          <div class="custom-type-definition">
            <label><span>Base type</span><Select :model-value="typeBase(item.baseType)" size="small" filterable
                @on-change="updateBaseType(item, $event)">
                <Option v-for="type in customBaseTypes" :key="type" :value="type">{{ type }}</Option>
              </Select></label><label><span>Length</span><input type="number" min="1" :value="item.length ?? ''"
                :disabled="item.precision !== null" @change="
                  schema.updateCustomType(item.id, {
                    length: optionalNumber($event),
                  })
                  " /></label><label><span>Precision</span><input type="number" min="1" :value="item.precision ?? ''"
                :disabled="item.length !== null" @change="
                  schema.updateCustomType(item.id, {
                    precision: optionalNumber($event),
                  })
                  " /></label><label><span>Scale</span><input type="number" min="0" :max="item.precision ?? undefined"
                :value="item.scale ?? ''" :disabled="item.precision === null" @change="
                  schema.updateCustomType(item.id, {
                    scale: optionalNumber($event),
                  })
                  " /></label>
          </div>
          <label class="schema-type-card__comment"><span>Description</span><input :value="item.comment"
              placeholder="Optional description" @change="
                schema.updateCustomType(item.id, {
                  comment: ($event.target as HTMLInputElement).value,
                })
                " /></label>
          <output>{{ item.name }} → {{ customTypeDefinition(item) }}</output>
          <p v-if="messages[item.id]" class="schema-type-card__error">
            {{ messages[item.id] }}
          </p>
        </article>
        <p v-if="schema.customTypes.length === 0" class="schema-type-empty">
          No custom types defined.
        </p>
      </section>
    </section>
  </div>
</template>
