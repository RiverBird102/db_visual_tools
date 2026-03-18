<template>
  <div class="designer">
    <div class="header">
      <div class="title">
        <div class="name">{{ table ? table : '未选择表' }}</div>
        <div class="sub" v-if="schema">Schema: {{ schema }}</div>
      </div>
      <div class="actions">
        <el-button size="small" @click="load" :disabled="!table">刷新</el-button>
        <el-button size="small" type="primary" @click="emitSql" :disabled="columns.length === 0">生成建表SQL</el-button>
      </div>
    </div>

    <el-table :data="columns" border height="100%">
      <el-table-column prop="name" label="字段名" width="180" />
      <el-table-column prop="dataType" label="类型" width="180" />
      <el-table-column prop="length" label="长度" width="90" />
      <el-table-column prop="notNull" label="非空" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.notNull" type="danger">NN</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="primaryKey" label="主键" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.primaryKey" type="warning">PK</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="autoIncrement" label="自增" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.autoIncrement" type="success">AI</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="defaultValue" label="默认值" min-width="160" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  connectionId: { type: String, default: '' },
  schema: { type: String, default: '' },
  table: { type: String, default: '' }
});

const emit = defineEmits(['sqlGenerated']);

const columns = ref([]);

async function load() {
  if (!props.connectionId || !props.table) return;
  const res = await window.electronAPI.getTableColumns({
    connectionId: props.connectionId,
    schema: props.schema,
    table: props.table
  });
  if (!res.success) throw new Error(res.error);
  columns.value = res.data || [];
}

function quoteIdent(name) {
  // 简化：兼容 MySQL/PG/DM 的最保守方式：双引号
  return `"${String(name).replace(/"/g, '""')}"`;
}

function guessColumnSql(c) {
  const type = c.dataType || 'VARCHAR';
  const len = c.length ? `(${c.length}${c.scale ? `,${c.scale}` : ''})` : '';
  let sql = `${quoteIdent(c.name)} ${type}${/[(]/.test(type) ? '' : len}`;
  if (c.notNull) sql += ' NOT NULL';
  if (c.defaultValue !== null && c.defaultValue !== undefined && String(c.defaultValue).trim() !== '') {
    sql += ` DEFAULT ${String(c.defaultValue).trim()}`;
  }
  return sql;
}

function buildCreateTableSql() {
  const cols = columns.value.map(guessColumnSql);
  const pk = columns.value.filter(c => c.primaryKey).map(c => quoteIdent(c.name));
  if (pk.length) cols.push(`PRIMARY KEY (${pk.join(', ')})`);
  return `CREATE TABLE ${props.schema ? `${quoteIdent(props.schema)}.` : ''}${quoteIdent(props.table)} (\n  ${cols.join(',\n  ')}\n);`;
}

function emitSql() {
  try {
    const sql = buildCreateTableSql();
    emit('sqlGenerated', sql);
  } catch (e) {
    ElMessage.error(`生成SQL失败: ${e.message}`);
  }
}

watch(
  () => [props.connectionId, props.schema, props.table],
  async () => {
    columns.value = [];
    if (!props.connectionId || !props.table) return;
    try {
      await load();
    } catch (e) {
      ElMessage.error(`加载表结构失败: ${e.message}`);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.designer {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color);
}
.title .name {
  font-weight: 600;
}
.title .sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
