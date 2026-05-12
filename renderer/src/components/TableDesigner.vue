<template>
  <div class="designer">
    <div class="header">
      <div class="title">
        <div class="name">
          表名: <el-input v-model="localTableName" size="small" placeholder="请输入表名" style="width: 150px; margin-left: 8px;"/>
        </div>
        <div class="sub" v-if="schema">Schema: {{ schema }}</div>
      </div>
      <div class="actions">
        <el-button size="small" @click="load" :disabled="!table">重置/刷新</el-button>
        <el-button size="small" type="success" @click="addColumn">添加字段</el-button>
        <el-button size="small" @click="previewSql" :disabled="columns.length === 0">预览 SQL</el-button>
        <el-button size="small" type="primary" @click="handleSave" :disabled="columns.length === 0">保存变更</el-button>
      </div>
    </div>

    <el-table :data="columns" border height="100%" size="small">
      <el-table-column label="字段名" width="180">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="user_id" />
        </template>
      </el-table-column>

      <el-table-column label="类型" width="160">
        <template #default="{ row }">
          <el-select v-model="row.dataType" filterable allow-create default-first-option>
            <el-option v-for="type in availableDataTypes" :key="type" :label="type" :value="type" />
          </el-select>
        </template>
      </el-table-column>

      <el-table-column label="长度/精度" width="100">
        <template #default="{ row }">
          <el-input v-model="row.length" placeholder="255" />
        </template>
      </el-table-column>

      <el-table-column label="主键" width="60" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.primaryKey" />
        </template>
      </el-table-column>

      <el-table-column label="非空" width="60" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.notNull" />
        </template>
      </el-table-column>

      <el-table-column label="自增" width="60" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.autoIncrement" />
        </template>
      </el-table-column>

      <el-table-column label="外键关联" min-width="180">
        <template #default="{ row }">
          <el-input v-model="row.foreignKey" placeholder="如: user(id)" />
        </template>
      </el-table-column>

      <el-table-column label="默认值" min-width="120">
        <template #default="{ row }">
          <el-input v-model="row.defaultValue" />
        </template>
      </el-table-column>

      <el-table-column label="操作" width="80" align="center" fixed="right">
        <template #default="{ $index }">
          <el-button type="danger" link @click="removeColumn($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="sqlPreviewVisible" title="确认变更 SQL" width="600px">
      <div class="sql-preview-container">
        <pre><code>{{ generatedSql }}</code></pre>
      </div>
      <template #footer>
        <el-button @click="sqlPreviewVisible = false">取消</el-button>
        <el-button type="primary" @click="executeSave">执行并保存</el-button>
      </template>
    </el-dialog>
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

const emit = defineEmits(['sqlGenerated', 'saveSuccess']);

const localTableName = ref('new_table');
const columns = ref([]);
const originalColumns = ref([]); 
const sqlPreviewVisible = ref(false);
const generatedSql = ref('');

const availableDataTypes = ['INT', 'BIGINT', 'VARCHAR', 'CHAR', 'TEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'BOOLEAN'];

// 加载表结构
async function load() {
  if (!props.connectionId || !props.table) {
    columns.value = [];
    originalColumns.value = [];
    localTableName.value = 'new_table';
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

    // 🕵️ 增加一行打印：你可以按 F12 打开控制台，看看后端到底返回了什么鬼格式
    console.log("【调试】后端返回的原始列数据:", res.data);
    
    const data = (res.data || []).map(col => {
      // 1. 广撒网：尝试从所有常见的数据库驱动长度字段里捞数据
      let parsedLen = col.length || col.size || col.precision || col.characterMaximumLength || col.DATA_LENGTH || '';
      let typeStr = String(col.dataType || col.type || col.columnType || '').toUpperCase();

      // 2. 暴力扫描：遍历这个字段的所有属性，只要哪里出现了类似 VARCHAR(255) 或 DECIMAL(10,2) 的东西，立刻提取！
      for (const key in col) {
        if (col[key] && typeof col[key] === 'string') {
          const val = col[key].toUpperCase().trim();
          const match = val.match(/^([A-Z_]+)\s*\(([^)]+)\)/);
          if (match) {
            typeStr = match[1];    // 提取出纯类型，例如 VARCHAR
            parsedLen = match[2];  // 提取出纯精度，例如 255
            break;                 // 抓到了就跑
          }
        }
      }

      // 如果是数值类型但长度是 0（某些库的默认行为），清空让界面保持整洁
      if (parsedLen === 0 || parsedLen === '0') {
        parsedLen = '';
      }

      return {
        ...col,
        dataType: typeStr,       // 填入干净的类型
        length: parsedLen,       // 🎯 填入抓取到的真正精度/长度
        notNull: !!col.notNull,
        primaryKey: !!col.primaryKey,
        autoIncrement: !!col.autoIncrement,
        defaultValue: col.defaultValue || '',
        foreignKey: col.foreignKey || '',
        originalName: col.name 
      };
    });

    columns.value = JSON.parse(JSON.stringify(data));
    originalColumns.value = JSON.parse(JSON.stringify(data));
  } catch (e) {
    ElMessage.error(`加载失败: ${e.message}`);
  }
}

function addColumn() {
  columns.value.push({
    name: '', dataType: 'VARCHAR', length: '255',
    notNull: false, primaryKey: false, autoIncrement: false,
    defaultValue: '', foreignKey: '', isNew: true 
  });
}

function removeColumn(index) {
  columns.value.splice(index, 1);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// 智能剥离不合法的括号长度
function getSafeTypeStr(dataType, length) {
  const type = String(dataType).toUpperCase();
  const allowLength = ['VARCHAR', 'CHAR', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(type);
  if (type.includes('(')) return type;
  if (allowLength && length) return `${type}(${length})`;
  return type; 
}

function getColumnConstraints(col) {
  return `${col.notNull ? ' NOT NULL' : ''}${col.defaultValue ? ` DEFAULT '${col.defaultValue}'` : ''}`;
}

// 🌟 终极修复：精准捕捉所有现有字段的属性修改（类型、长度、主外键、自增）
function buildAlterSql() {
  const tableIdent = props.schema ? `${quoteIdent(props.schema)}.${quoteIdent(localTableName.value)}` : quoteIdent(localTableName.value);
  const statements = [];

  // 记录新旧主键，用于判断是否需要增删主键
  let oldPkCols = originalColumns.value.filter(c => c.primaryKey).map(c => c.name);
  let newPkCols = [];

  // 1. 处理删除的字段
  originalColumns.value.forEach(oldCol => {
    const exists = columns.value.find(c => c.originalName === oldCol.name);
    if (!exists) statements.push(`ALTER TABLE ${tableIdent} DROP COLUMN ${quoteIdent(oldCol.name)};`);
  });

  // 2. 处理属性修改和新增字段
  columns.value.forEach(col => {
    if (!col.name) return;
    
    const colName = quoteIdent(col.name);
    const typeStr = getSafeTypeStr(col.dataType, col.length); 
    const constraints = getColumnConstraints(col);

    if (col.primaryKey) newPkCols.push(col.name); // 收集当前勾选的主键

    if (col.isNew) {
      // 纯新增字段
      let sql = `ALTER TABLE ${tableIdent} ADD COLUMN ${colName} ${typeStr}${constraints}`;
      if (col.autoIncrement) sql += ' AUTO_INCREMENT';
      statements.push(sql + ';');
    } else {
      // ✅ 针对现有字段，进行深度属性比对
      const old = originalColumns.value.find(o => o.name === col.originalName);
      if (!old) return;

      // 如果字段名被修改
      if (col.name !== old.name) {
        statements.push(`ALTER TABLE ${tableIdent} RENAME COLUMN ${quoteIdent(old.name)} TO ${colName};`);
      }

      // 只要类型、长度、非空、默认值、自增中的【任意一个】发生变化，就触发 MODIFY
      if (
        col.dataType !== old.dataType || 
        col.length !== old.length || 
        col.notNull !== old.notNull ||
        col.defaultValue !== old.defaultValue ||
        col.autoIncrement !== old.autoIncrement
      ) {
        let modifySql = `ALTER TABLE ${tableIdent} MODIFY ${colName} ${typeStr}${constraints}`;
        if (col.autoIncrement) modifySql += ' AUTO_INCREMENT';
        statements.push(modifySql + ';');
      }

      // ✅ 外键变更检测（原本没有，你现在填上了，就给他加上）
      if (col.foreignKey !== (old.foreignKey || '')) {
        if (col.foreignKey && col.foreignKey.includes('(')) {
          const fkMatch = col.foreignKey.match(/(\w+)\((\w+)\)/);
          if (fkMatch) {
            statements.push(`ALTER TABLE ${tableIdent} ADD CONSTRAINT FK_${localTableName.value}_${col.name} FOREIGN KEY (${colName}) REFERENCES ${quoteIdent(fkMatch[1])}(${quoteIdent(fkMatch[2])});`);
          }
        }
      }
    }
  });

  // 3. ✅ 主键变更检测 (因为主键是表级约束，统一在最后处理)
  const oldPkStr = oldPkCols.sort().join(',');
  const newPkStr = newPkCols.sort().join(',');
  if (oldPkStr !== newPkStr) {
    if (oldPkCols.length > 0) {
      statements.push(`ALTER TABLE ${tableIdent} DROP PRIMARY KEY;`); // 如果原来有，先删掉旧的
    }
    if (newPkCols.length > 0) {
      statements.push(`ALTER TABLE ${tableIdent} ADD PRIMARY KEY (${newPkCols.map(c => quoteIdent(c)).join(', ')});`); // 添加新的
    }
  }

  return statements.join('\n');
}

// 建表脚本生成器
function buildCreateTableSql() {
  const targetTableName = localTableName.value || 'untitled_table';
  const validColumns = columns.value.filter(c => c.name);
  if (validColumns.length === 0) throw new Error("请至少添加一个有效的字段");
  
  const cols = validColumns.map(c => {
    const typeStr = getSafeTypeStr(c.dataType, c.length);
    let sql = `${quoteIdent(c.name)} ${typeStr}${getColumnConstraints(c)}`;
    if (c.autoIncrement) sql += ' AUTO_INCREMENT'; 
    return sql;
  });
  
  const pks = validColumns.filter(c => c.primaryKey).map(c => quoteIdent(c.name));
  if (pks.length) {
    cols.push(`PRIMARY KEY (${pks.join(', ')})`);
  }
  
  const fullTableName = props.schema ? `${quoteIdent(props.schema)}.${quoteIdent(targetTableName)}` : quoteIdent(targetTableName);
  return `CREATE TABLE ${fullTableName} (\n  ${cols.join(',\n  ')}\n);`;
}

async function handleSave() {
  try {
    generatedSql.value = !props.table ? buildCreateTableSql() : buildAlterSql();
    if (!generatedSql.value) {
      ElMessage.info('未检测到任何变更');
      return;
    }
    sqlPreviewVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function executeSave() {
  try {
    // 🌟 核心修复：将多行 SQL 按分号切分，逐条发送给底层执行！
    // 彻底解决 ODBC/MySQL 驱动不支持“一次性执行多条语句”导致的静默失败问题
    const statements = generatedSql.value
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0); // 过滤掉空行

    if (statements.length === 0) {
      ElMessage.info('没有需要执行的语句');
      return;
    }

    // 逐条执行，任何一条失败都会被立刻捕捉，绝不静默失败！
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const res = await window.electronAPI.executeSql({
        connectionId: props.connectionId,
        schema: props.schema,
        sql: stmt
      });
      
      if (!res.success) {
        throw new Error(`执行第 ${i + 1} 条语句失败:\n${res.error}\n\n出错的SQL:\n${stmt}`);
      }
    }
    
    ElMessage.success('表结构变更已全部执行成功！');
    sqlPreviewVisible.value = false;
    
    // 🌟 延迟 200 毫秒再查，防止底层信创数据库的系统元数据表刷盘延迟
    setTimeout(async () => {
      await load(); 
      emit('saveSuccess');
    }, 200);

  } catch (e) {
    ElMessage.error({
      message: e.message,
      duration: 5000 // 报错停留时间长一点，方便查看原因
    });
  }
}

function previewSql() {
  generatedSql.value = props.table ? buildAlterSql() : buildCreateTableSql();
  sqlPreviewVisible.value = true;
}

watch(() => [props.connectionId, props.schema, props.table], load, { immediate: true });
</script>

<style scoped>
.designer { height: 100%; display: flex; flex-direction: column; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--el-border-color); background: #f9f9f9; }
.sql-preview-container { background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 4px; max-height: 400px; overflow: auto; }
pre { margin: 0; font-family: monospace; }
</style>
