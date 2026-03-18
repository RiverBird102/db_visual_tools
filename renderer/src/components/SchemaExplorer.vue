<template>
  <div class="schema-explorer">
    <div class="toolbar">
      <el-select v-model="selectedSchema" placeholder="选择Schema/数据库" size="small" style="width: 100%" @change="refreshTables">
        <el-option v-for="s in schemas" :key="s" :label="s" :value="s" />
      </el-select>
    </div>

    <el-scrollbar class="list">
      <el-menu :default-active="activeTable || ''" class="menu" @select="onSelect">
        <el-menu-item v-for="t in tables" :key="t" :index="t">
          <span>{{ t }}</span>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  connectionId: { type: String, default: '' }
});

const emit = defineEmits(['selectTable', 'schemaChanged']);

const schemas = ref([]);
const selectedSchema = ref('');
const tables = ref([]);
const activeTable = ref('');

async function refreshSchemas() {
  if (!props.connectionId) return;
  const res = await window.electronAPI.listSchemas({ connectionId: props.connectionId });
  if (!res.success) throw new Error(res.error);
  schemas.value = res.data || [];
  if (!selectedSchema.value && schemas.value.length) selectedSchema.value = schemas.value[0];
}

async function refreshTables() {
  if (!props.connectionId) return;
  const res = await window.electronAPI.listTables({ connectionId: props.connectionId, schema: selectedSchema.value });
  if (!res.success) throw new Error(res.error);
  tables.value = res.data || [];
  emit('schemaChanged', selectedSchema.value);
}

function onSelect(table) {
  activeTable.value = table;
  emit('selectTable', { schema: selectedSchema.value, table });
}

watch(
  () => props.connectionId,
  async (id) => {
    schemas.value = [];
    tables.value = [];
    selectedSchema.value = '';
    activeTable.value = '';
    if (!id) return;
    try {
      await refreshSchemas();
      await refreshTables();
    } catch (e) {
      ElMessage.error(`加载元数据失败: ${e.message}`);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.schema-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}
.toolbar {
  padding: 8px;
  border-bottom: 1px solid var(--el-border-color);
}
.list {
  flex: 1;
  padding: 4px;
}
.menu {
  border-right: 0;
}
</style>
