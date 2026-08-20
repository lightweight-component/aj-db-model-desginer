<script setup lang="ts">
import { useSchemaStore } from "../stores/schema";

const emit = defineEmits<{ close: [] }>();
const schema = useSchemaStore();

/** Converts a comma-separated editor value into clean enum members. */
function enumValues(event: Event): string[] {
  return (event.target as HTMLInputElement).value.split(",").map((value: string) => value.trim()).filter(Boolean);
}
</script>

<template>
  <div class="type-manager-backdrop" @click.self="emit('close')">
    <section class="type-manager" role="dialog" aria-modal="true" aria-label="Enum and custom type manager">
      <header><div><small>SCHEMA TYPES</small><h2>Enums and custom types</h2></div><button type="button" class="icon-button" aria-label="Close type manager" @click="emit('close')">×</button></header>
      <section><div class="section-title"><h3>Enums</h3><button type="button" @click="schema.addEnum">+ Add enum</button></div><div v-for="item in schema.enums" :key="item.id" class="type-manager__row"><input :value="item.name" placeholder="Enum name" @change="schema.updateEnum(item.id, { name: ($event.target as HTMLInputElement).value.trim() || 'unnamed_enum' })" /><input :value="item.values.join(', ')" placeholder="Values, comma separated" @change="schema.updateEnum(item.id, { values: enumValues($event) })" /><button type="button" class="icon-button" @click="schema.deleteEnum(item.id)">×</button></div></section>
      <section><div class="section-title"><h3>Custom types</h3><button type="button" @click="schema.addCustomType">+ Add type</button></div><div v-for="item in schema.customTypes" :key="item.id" class="type-manager__row"><input :value="item.name" placeholder="Type name" @change="schema.updateCustomType(item.id, { name: ($event.target as HTMLInputElement).value.trim() || 'unnamed_type' })" /><input :value="item.baseType" placeholder="Base type" @change="schema.updateCustomType(item.id, { baseType: ($event.target as HTMLInputElement).value.trim() || 'TEXT' })" /><button type="button" class="icon-button" @click="schema.deleteCustomType(item.id)">×</button></div></section>
    </section>
  </div>
</template>
