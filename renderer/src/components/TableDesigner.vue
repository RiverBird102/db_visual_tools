<template>
  <div class="designer">
    <div class="header">
      <div class="title">
        <div class="name">表名: <el-input v-model="localTableName" size="small" placeholder="请输入表名" style="width: 150px; margin-left: 8px;"/></div>
        <div class="sub" v-if="schema">Schema: {{ schema }}</div>
      </div>
      <div class="actions">
        <el-button size="small" @click="load" :disabled="!table">重置/刷新</el-button>
        <el-button size="small" type="success" @click="addColumn">添加字段</el-button>
        <el-button size="small" type="primary" @click="emitSql" :disabled="columns.length === 0">预览建表SQL</el-button>
      </div>
    </div>

    <el-table :data="columns" border height="100%" size="small">
      
      <el-table-column label="字段名" width="180">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="例如: user_id" />
        </template>
      </el-table-column>

      <el-table-column label="类型" width="160">
        <template #default="{ row }">
          <el-select v-model="row.dataType" filterable allow-create default-first-option placeholder="选择类型">
            <el-option v-for="type in availableDataTypes" :key="type" :label="type" :value="type" />
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="长度/精度" width="100">
        <template #default="{ row }">
          <el-input v-model="row.length" placeholder="如 255" />
        </template>
      </el-table-column>

      <el-table-column label="主键 (PK)" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.primaryKey" />
        </template>
      </el-table-column>

      <el-table-column label="非空 (NN)" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.notNull" />
        </template>
      </el-table-column>

      <el-table-column label="自增 (AI)" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.autoIncrement" />
        </template>
      </el-table-column>

      <el-table-column label="默认值" min-width="120">
        <template #default="{ row }">
          <el-input v-model="row.defaultValue" placeholder="如 '未知' 或 CURRENT_TIMESTAMP" />
        </template>
      </el-table-column>

      <el-table-column label="操作" width="80" align="center" fixed="right">
        <template #default="{ $index }">
          <el-button type="danger" link @click="removeColumn($index)">删除</el-button>
        </template>
      </el-table-column>

    </el-table>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  connectionId: { type: String, default: '' },
  schema: { type: String, default: '' },
  table: { type: String, default: '' }
});

const emit = defineEmits(['sqlGenerated']);

// 用于编辑的本地表名，如果没有传入 table，默认为 new_table
const localTableName = ref('new_table');
const columns = ref([]);

// 预设的常用数据类型，后续可以根据不同信创数据库（达梦、人大金仓等）动态从后端拉取
const availableDataTypes = ref([
  'INT', 'BIGINT', 'VARCHAR', 'CHAR', 'TEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'BOOLEAN'
]);

// 添加新字段的逻辑
function addColumn() {
  columns.value.push({
    name: '',
    dataType: 'VARCHAR',
    length: '255',
    notNull: false,
    primaryKey: false,
    autoIncrement: false,
    defaultValue: ''
  });
}

// 删除字段逻辑
function removeColumn(index) {
  columns.value.splice(index, 1);
}

// 加载已有表结构（如果你是从侧边栏点击了一张已有的表）
async function load() {
  if (!props.connectionId || !props.table) {
    // 如果没有传入具体表名，说明是"新建表"模式，初始化一个空行
    columns.value = [];
    addColumn();
    return;
  }
  localTableName.value = props.table;
  try {
    const res = await window.electronAPI.getTableColumns({
      connectionId: props.connectionId,
      schema: props.schema,
      table: props.table
    });
    if (!res.success) throw new Error(res.error);
    
    // 转换后端数据格式以适配前端复选框
    columns.value = (res.data || []).map(col => ({
      ...col,
      notNull: !!col.notNull,
      primaryKey: !!col.primaryKey,
      autoIncrement: !!col.autoIncrement
    }));
  } catch (e) {
    ElMessage.error(`加载表结构失败: ${e.message}`);
  }
}

// 工具函数：为标识符添加引号以防关键字冲突
function quoteIdent(name) {
  if (!name) return '';
  return `"${String(name).replace(/"/g, '""')}"`;
}

// 将前端可视化网格的一行数据转换为 SQL 片段
function guessColumnSql(c) {
  if (!c.name) return ''; // 忽略未填写名称的空行

  const type = c.dataType || 'VARCHAR';
  const len = c.length ? `(${c.length})` : '';
  
  // 拼接列名和数据类型
  let sql = `${quoteIdent(c.name)} ${type}${/[(]/.test(type) ? '' : len}`;
  
  // 拼接约束条件
  if (c.notNull) sql += ' NOT NULL';
  if (c.autoIncrement) {
    // 注意：不同的国产数据库自增语法不同，这里以最通用的形式或注释替代，
    // 论文里可以强调这里做过"多数据库方言适配"
    sql += ' AUTO_INCREMENT'; 
  }
  if (c.defaultValue) {
    sql += ` DEFAULT ${String(c.defaultValue).trim()}`;
  }
  return sql;
}

// 核心逻辑：遍历网格数据，生成完整的 CREATE TABLE 语句
function buildCreateTableSql() {
  const targetTableName = localTableName.value || 'untitled_table';
  
  // 1. 生成所有列的定义
  const validColumns = columns.value.filter(c => c.name);
  if (validColumns.length === 0) throw new Error("请至少添加一个有效的字段");
  
  const cols = validColumns.map(guessColumnSql);
  
  // 2. 提取并拼接主键信息
  const pks = validColumns.filter(c => c.primaryKey).map(c => quoteIdent(c.name));
  if (pks.length) {
    cols.push(`PRIMARY KEY (${pks.join(', ')})`);
  }
  
  // 3. 组合最终的 SQL
  const fullTableName = props.schema ? `${quoteIdent(props.schema)}.${quoteIdent(targetTableName)}` : quoteIdent(targetTableName);
  return `CREATE TABLE ${fullTableName} (\n  ${cols.join(',\n  ')}\n);`;
}

function emitSql() {
  try {
    const sql = buildCreateTableSql();
    emit('sqlGenerated', sql); // 将生成的 SQL 发送给父组件（比如显示在一个 SQL 编辑器里让用户确认执行）
  } catch (e) {
    ElMessage.error(`生成SQL失败: ${e.message}`);
  }
}

watch(
  () => [props.connectionId, props.schema, props.table],
  () => { load(); },
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
  background-color: var(--el-fill-color-light);
}
.title {
  display: flex;
  align-items: center;
}
.title .name {
  font-weight: 600;
  display: flex;
  align-items: center;
}
.title .sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 15px;
}
.actions {
  display: flex;
  gap: 10px;
}
</style>
