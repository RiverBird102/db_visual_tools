<template>
  <el-container class="app-root">
    <el-aside width="320px" class="left">
      <div class="sidebar">
        <div class="sidebar-header">
          <el-button type="primary" style="width: 100%;" @click="openCreateDialog">新建连接</el-button>
        </div>
      </div>
      
      <el-tree
        :key="treeRenderKey"
        :props="treeProps"
        :load="loadTreeNode"
        lazy
        node-key="treeId"
        highlight-current
        @node-click="handleNodeClick"
        class="connection-tree"
      >
        <template #default="{ node, data }">
          <div class="custom-tree-node">
            <span class="node-label">
              <span v-if="data.type === 'connection'">🔌</span>
              <span v-else-if="data.type === 'schema'">🗃️</span>
              <span v-else-if="data.type === 'table'">📄</span>
              <span style="margin-left: 5px" :title="node.label">{{ node.label }}</span>
            </span>
            <span class="node-actions" @click.stop v-if="data.type === 'connection'">
              <el-button link type="primary" size="small" @click.stop="openEditDialog(data)">编辑</el-button>
              <el-button link type="danger" size="small" @click.stop="deleteConnection(data)">删除</el-button>
            </span>
          </div>
        </template>
      </el-tree>

      <el-dialog :title="isEditMode ? '编辑数据库连接' : '新建数据库连接'" v-model="showConnectDialog" width="600px">
        <db-connect 
          :initial-data="currentEditData" 
          @save="saveConnection" 
          @test="testConnection"
          @cancel="showConnectDialog = false" 
        ></db-connect>
      </el-dialog>
    </el-aside>
    
    <el-container class="right">
      <el-header class="topbar">
        <div class="topbar-left">
          <el-tag v-if="activeConnection" type="info">{{ activeConnection.name }}</el-tag>
          <span v-if="activeTable" class="crumb">{{ activeSchema }} / {{ activeTable }}</span>
        </div>
        <div class="topbar-right">
          <el-button size="small" type="primary" @click="addQueryTab" :disabled="!activeConnection">新建查询</el-button>
        </div>
      </el-header>

      <el-main class="main">
        <div v-if="openTabs.length === 0" class="empty-workspace">
          <el-empty description="请在左侧点击表名以打开，或新建查询开始工作" />
        </div>

        <el-tabs 
          v-else 
          v-model="activeTab" 
          type="card" 
          class="tabs" 
          @tab-remove="removeTab"
          @tab-change="handleTabChange"
        >
          <el-tab-pane
            v-for="tab in openTabs"
            :key="tab.id"
            :label="tab.title"
            :name="tab.id"
            closable
          >
            <div v-if="tab.type === 'table'" class="tab-content-scroll">
              <table-designer
                :connection-id="tab.connectionId"
                :schema="tab.schema"
                :table="tab.table"
                @sqlGenerated="(sql) => (tab.generatedSql = sql)"
              />
              
              <div v-if="tab.generatedSql" class="sql-preview-area">
                <div class="sql-header">SQL 预览 (DDL)</div>
                <el-input v-model="tab.generatedSql" type="textarea" :rows="5" placeholder="DDL SQL"></el-input>
                <div style="margin-top: 10px;">
                  <el-button type="primary" @click="runGenerated(tab)">执行 SQL</el-button>
                </div>
              </div>
            </div>

            <div v-else-if="tab.type === 'query'" class="runner">
              <div class="runner-left">
                <div class="editor-wrap">
                  <sql-editor v-model="tab.sql" :connection="getConnectionById(tab.connectionId)" :key="tab.id"></sql-editor>
                </div>
                <div class="runner-actions">
                  <el-button type="primary" @click="executeSqlForTab(tab)">执行SQL</el-button>
                  <el-button @click="tab.sql = ''" style="margin-left: 8px;">清空</el-button>
                </div>
              </div>
              <div class="runner-right">
                <data-viewer
                  :data="tab.result.rows"
                  :columns="tab.result.fields"
                  :loading="tab.loading"
                  :error="tab.error"
                ></data-viewer>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';
import TableDesigner from './components/TableDesigner.vue';

// 基础状态
const showConnectDialog = ref(false);
const isEditMode = ref(false);
const currentEditData = ref(null);
const loading = ref(false);

// 面包屑状态
const activeConnection = ref(null);
const activeSchema = ref('');
const activeTable = ref('');

// 【新增】统一的标签页管理
const openTabs = ref([]); // 存放所有打开的标签页（表 和 查询）
const activeTab = ref(''); // 当前激活的标签页 ID

// 树结构状态
const treeRenderKey = ref(0); 
const allConnections = ref([]); 
const treeProps = reactive({
  label: 'label',
  children: 'children',
  isLeaf: 'isLeaf'
});

// 辅助方法：通过ID获取连接详情
const getConnectionById = (id) => allConnections.value.find(c => c.id === id);

const loadConnections = async () => {
  treeRenderKey.value += 1; 
};

// 懒加载树节点
const loadTreeNode = async (node, resolve) => {
  if (node.level === 0) {
    const res = await window.electronAPI.getDbConnections();
    if (res.success) {
      allConnections.value = res.data;
      const nodes = res.data.map(conn => ({
        ...conn,
        label: conn.name,
        type: 'connection',
        treeId: `conn_${conn.id}`,
        isLeaf: false
      }));
      return resolve(nodes);
    }
    return resolve([]);
  }

  if (node.level === 1) {
    const conn = node.data;
    try {
      const res = await window.electronAPI.listSchemas({ connectionId: conn.id });
      if (res.success) {
        const nodes = res.data.map(schema => ({
          label: schema,
          type: 'schema',
          connectionId: conn.id,
          schemaName: schema,
          treeId: `schema_${conn.id}_${schema}`,
          isLeaf: false
        }));
        return resolve(nodes);
      }
    } catch (error) {}
    return resolve([]);
  }

  if (node.level === 2) {
    const schemaData = node.data;
    try {
      const res = await window.electronAPI.listTables({
        connectionId: schemaData.connectionId,
        schema: schemaData.schemaName
      });
      if (res.success) {
        const nodes = res.data.map(table => {
          const tableName = typeof table === 'object' ? (table.tableName || table.name) : table;
          return {
            label: tableName,
            type: 'table',
            connectionId: schemaData.connectionId,
            schemaName: schemaData.schemaName,
            tableName: tableName,
            treeId: `table_${schemaData.connectionId}_${schemaData.schemaName}_${tableName}`,
            isLeaf: true
          };
        });
        return resolve(nodes);
      }
    } catch (error) {}
    return resolve([]);
  }
  return resolve([]);
};

// 【核心逻辑】点击左侧树节点
const handleNodeClick = (data, node) => {
  // 无论是点连接、库还是表，都更新顶部工具栏的 activeConnection
  if (data.connectionId || data.id) {
    activeConnection.value = getConnectionById(data.connectionId || data.id);
  }

  if (data.type === 'schema') {
    activeSchema.value = data.schemaName;
    activeTable.value = '';
  } 
  else if (data.type === 'table') {
    activeSchema.value = data.schemaName;
    activeTable.value = data.tableName;
    
    // 生成该表的唯一标签 ID
    const tabId = `table_${data.connectionId}_${data.schemaName}_${data.tableName}`;
    
    // 检查这个表是不是已经打开了
    const existingTab = openTabs.value.find(t => t.id === tabId);
    if (existingTab) {
      activeTab.value = tabId; // 如果打开了，直接切换过去
    } else {
      // 如果没打开，新建一个表标签页
      openTabs.value.push({
        id: tabId,
        type: 'table', // 标识这是一个表标签页
        title: `📄 ${data.tableName}`,
        connectionId: data.connectionId,
        schema: data.schemaName,
        table: data.tableName,
        generatedSql: '' // 独立保存当前表生成的 SQL
      });
      activeTab.value = tabId;
    }
  }
};

// 切换标签页时，同步更新顶部的面包屑导航
const handleTabChange = (tabId) => {
  const tab = openTabs.value.find(t => t.id === tabId);
  if (tab) {
    activeConnection.value = getConnectionById(tab.connectionId);
    if (tab.type === 'table') {
      activeSchema.value = tab.schema;
      activeTable.value = tab.table;
    } else {
      activeSchema.value = '';
      activeTable.value = '';
    }
  }
};

const nextQueryIndex = ref(1);

// 新建查询标签页
const addQueryTab = () => {
  if (!activeConnection.value) return;
  const id = `query-${Date.now()}`;
  openTabs.value.push({
    id,
    type: 'query', // 标识这是一个查询标签页
    title: `🔍 查询${nextQueryIndex.value++}`,
    connectionId: activeConnection.value.id,
    sql: '',
    loading: false,
    error: '',
    result: { rows: [], fields: [] }
  });
  activeTab.value = id;
};

// 关闭标签页
const removeTab = (targetId) => {
  const idx = openTabs.value.findIndex(t => t.id === targetId);
  if (idx === -1) return;
  
  const wasActive = activeTab.value === targetId;
  openTabs.value.splice(idx, 1);
  
  // 如果关掉的是当前正在看的标签，自动往前跳一个标签
  if (wasActive) {
    const next = openTabs.value[idx] || openTabs.value[idx - 1];
    if (next) {
      activeTab.value = next.id;
      handleTabChange(next.id); // 触发面包屑更新
    } else {
      activeTab.value = ''; // 如果全关了，回到空白页
      activeTable.value = '';
    }
  }
};

// 执行查询
const executeSqlForTab = async (tab) => {
  const sql = (tab.sql || '').trim();
  if (!sql) return ElMessage.warning('请输入SQL语句');
  
  try {
    tab.loading = true;
    tab.error = '';
    const result = await window.electronAPI.executeSql({
      connectionId: tab.connectionId, // 使用该标签绑定的连接
      sql
    });
    if (!result.success) {
      tab.error = result.error;
      return;
    }
    tab.result = result.data || { rows: [], fields: [] };
  } catch (e) {
    tab.error = e.message;
  } finally {
    tab.loading = false;
  }
};

// 执行表结构设计器生成的 DDL SQL
const runGenerated = async (tab) => {
  try {
    const result = await window.electronAPI.executeSql({
      connectionId: tab.connectionId,
      sql: tab.generatedSql
    });
    if (!result.success) {
      ElMessage.error(`执行失败: ${result.error}`);
      return;
    }
    ElMessage.success('SQL 执行成功！');
    // 执行成功后可以清空预览框
    tab.generatedSql = ''; 
  } catch (e) {
    ElMessage.error(`执行失败: ${e.message}`);
  }
};

// ================= 弹窗与连接管理（保持原有逻辑） =================
const openCreateDialog = () => {
  isEditMode.value = false;
  currentEditData.value = null;
  showConnectDialog.value = true;
};

const openEditDialog = (data) => {
  isEditMode.value = true;
  currentEditData.value = { ...data };
  showConnectDialog.value = true;
};

const saveConnection = async (connection) => {
  try {
    if (isEditMode.value && currentEditData.value) {
      connection.id = currentEditData.value.id;
      if (window.electronAPI.disconnectDb) await window.electronAPI.disconnectDb(connection.id);
      
      const result = await window.electronAPI.updateDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) return ElMessage.error(`保存失败: ${result.error}`);
    } else {
      connection.id = Date.now().toString();
      const result = await window.electronAPI.saveDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) return ElMessage.error(`保存失败: ${result.error}`);
    }
    ElMessage.success(isEditMode.value ? '连接修改成功！' : '连接保存成功！');
    showConnectDialog.value = false;
    await loadConnections(); 
  } catch (error) {
    ElMessage.error(`保存异常: ${error.message}`);
  }
};

const deleteConnection = async (data) => {
  try {
    await ElMessageBox.confirm(`确定要删除数据库连接 "${data.name}" 吗？`, '警告', { type: 'warning' });
    const result = await window.electronAPI.deleteDbConnection(data.id);
    if (result.success) {
      ElMessage.success('删除成功！');
      // 关闭所有属于这个连接的标签页
      openTabs.value = openTabs.value.filter(t => t.connectionId !== data.id);
      if (!openTabs.value.find(t => t.id === activeTab.value)) {
        activeTab.value = openTabs.value.length > 0 ? openTabs.value[openTabs.value.length-1].id : '';
      }
      await loadConnections();
    } else {
      ElMessage.error(`删除失败: ${result.error}`);
    }
  } catch (e) {}
};

const testConnection = async (config) => {
  try {
    loading.value = true;
    const plain = JSON.parse(JSON.stringify(config));
    const result = await window.electronAPI.testDbConnection(plain);
    if (result.success) ElMessage.success('连接测试成功！');
    else ElMessage.error(`连接测试失败: ${result.error}`);
  } catch (error) {
    ElMessage.error(`测试失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.app-root { height: 100vh; }
.left {
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
}
.sidebar-header {
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color);
}
.connection-tree {
  flex: 1;
  padding: 8px;
  overflow: auto;
}
.right { height: 100%; }
.topbar {
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.crumb { margin-left: 10px; color: var(--el-text-color-secondary); }
.main { padding: 10px; height: calc(100vh - 60px); }

/* 【新增】空白工作区样式 */
.empty-workspace {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.tabs { height: 100%; }

/* 【新增】为表结构内容提供滚动区域 */
.tab-content-scroll {
  height: calc(100vh - 130px);
  overflow-y: auto;
  padding-right: 5px;
}

/* 【新增】内置 SQL 预览区域样式 */
.sql-preview-area {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background-color: var(--el-bg-color-overlay);
}
.sql-header {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}

.runner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  height: calc(100vh - 130px);
}
.runner-left, .runner-right { min-height: 0; }
.runner-left { display: flex; flex-direction: column; }
.editor-wrap { flex: 1; min-height: 0; }
.runner-actions { margin-top: 10px; }

.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  padding-right: 8px;
  overflow: hidden; 
}
.node-label {
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-actions { display: none; flex-shrink: 0; }
:deep(.el-tree-node__content:hover) .node-actions { display: inline-block; }
</style>