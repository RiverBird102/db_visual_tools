<template>
  <el-container class="app-root">
    <el-aside width="320px" class="left">
      <div class="sidebar">
        <div class="sidebar-header">
          <el-button type="primary" @click="openCreateDialog" class="header-btn">新建连接</el-button>
          <el-button 
            type="success" 
            plain 
            @click="addQueryTab" 
            :disabled="!activeConnection" 
            class="header-btn"
          >
            新建查询
          </el-button>
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
      </el-header>

      <el-main class="main">
        <div v-if="openTabs.length === 0" class="empty-workspace">
          <el-empty description="请在左侧点击表名以查看数据，或新建查询开始工作" />
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
            <div v-if="tab.type === 'table'" class="table-data-wrap">
              <div class="table-data-toolbar">
                <el-button type="primary" size="small" @click="loadTableData(tab)" :loading="tab.loading">刷新数据</el-button>
                <el-pagination
                  v-model:current-page="tab.currentPage"
                  v-model:page-size="tab.pageSize"
                  :page-sizes="[50, 100, 200, 500]"
                  layout="total, sizes, prev, pager, next, jumper"
                  :total="tab.total"
                  @size-change="loadTableData(tab)"
                  @current-change="loadTableData(tab)"
                  size="small"
                  style="margin-left: auto;"
                />
              </div>
              <div class="table-data-content">
                <data-viewer
                  :data="tab.result.rows"
                  :columns="tab.result.fields"
                  :loading="tab.loading"
                  :error="tab.error"
                ></data-viewer>
              </div>
            </div>

            <div v-else-if="tab.type === 'query'" class="query-wrap">
              
              <div class="query-toolbar">
                <el-select 
                  v-model="tab.connectionId" 
                  placeholder="选择连接" 
                  size="small" 
                  style="width: 180px;"
                  @change="onQueryConnectionChange(tab)"
                >
                  <el-option v-for="conn in allConnections" :key="conn.id" :label="conn.name" :value="conn.id" />
                </el-select>
                
                <el-select 
                  v-model="tab.schema" 
                  placeholder="选择数据库" 
                  size="small" 
                  style="width: 180px;"
                >
                  <el-option v-for="schema in tab.schemaList" :key="schema" :label="schema" :value="schema" />
                </el-select>
                
                <el-button type="primary" size="small" @click="executeSqlForTab(tab)" :loading="tab.loading">
                  ▶ 执行 SQL
                </el-button>
                <el-button size="small" @click="tab.sql = ''">清空</el-button>
              </div>

              <div class="query-editor-container">
                <sql-editor v-model="tab.sql" :connection="getConnectionById(tab.connectionId)" :key="tab.id"></sql-editor>
              </div>

              <div class="query-result-container">
                <div v-if="tab.error" class="error-panel">
                  <div class="error-title">❌ 语法或执行错误:</div>
                  {{ tab.error }}
                </div>
                <data-viewer
                  v-else
                  :data="tab.result.rows"
                  :columns="tab.result.fields"
                  :loading="tab.loading"
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
import { ref, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';

// 基础状态
const showConnectDialog = ref(false);
const isEditMode = ref(false);
const currentEditData = ref(null);
const loading = ref(false);

// 面包屑状态
const activeConnection = ref(null);
const activeSchema = ref('');
const activeTable = ref('');

// 统一的标签页管理
const openTabs = ref([]); 
const activeTab = ref(''); 

// 树结构状态
const treeRenderKey = ref(0); 
const allConnections = ref([]); 
const treeProps = reactive({
  label: 'label',
  children: 'children',
  isLeaf: 'isLeaf'
});

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

// 带分页的 loadTableData
const loadTableData = async (tab) => {
  tab.loading = true;
  tab.error = '';
  try {
    const conn = getConnectionById(tab.connectionId);
    let sql = '';
    const offset = (tab.currentPage - 1) * tab.pageSize;
    
    let countSql = conn.dbType === 'mysql'
      ? `SELECT COUNT(*) as total FROM \`${tab.schema}\`.\`${tab.table}\``
      : `SELECT COUNT(*) as total FROM "${tab.schema}"."${tab.table}"`;
      
    const countResult = await window.electronAPI.executeSql({
      connectionId: tab.connectionId,
      sql: countSql
    });
    
    if (countResult.success && countResult.data.rows.length > 0) {
      const row = countResult.data.rows[0];
      tab.total = Number(row.total || row.TOTAL || Object.values(row)[0] || 0);
    }

    if (conn.dbType === 'mysql') {
      sql = `SELECT * FROM \`${tab.schema}\`.\`${tab.table}\` LIMIT ${tab.pageSize} OFFSET ${offset}`;
    } else {
      sql = `SELECT * FROM "${tab.schema}"."${tab.table}" LIMIT ${tab.pageSize} OFFSET ${offset}`;
    }
    
    const result = await window.electronAPI.executeSql({
      connectionId: tab.connectionId,
      sql: sql
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

const handleNodeClick = (data, node) => {
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
    
    const tabId = `table_${data.connectionId}_${data.schemaName}_${data.tableName}`;
    const existingTab = openTabs.value.find(t => t.id === tabId);
    
    if (existingTab) {
      activeTab.value = tabId; 
    } else {
      const newTab = {
        id: tabId,
        type: 'table', 
        title: `📄 ${data.tableName}`,
        connectionId: data.connectionId,
        schema: data.schemaName,
        table: data.tableName,
        loading: false,
        error: '',
        result: { rows: [], fields: [] },
        currentPage: 1, 
        pageSize: 50,   
        total: 0
      };
      
      openTabs.value.push(newTab);
      activeTab.value = tabId;
      loadTableData(newTab);
    }
  }
};

const handleTabChange = (tabId) => {
  const tab = openTabs.value.find(t => t.id === tabId);
  if (tab) {
    activeConnection.value = getConnectionById(tab.connectionId);
    if (tab.type === 'table') {
      activeSchema.value = tab.schema;
      activeTable.value = tab.table;
    } else {
      // 当切换回查询 tab 时，面包屑显示该 tab 当前选择的库
      activeSchema.value = tab.schema || '';
      activeTable.value = '';
    }
  }
};

// ================= 查询相关的新增逻辑 =================
const nextQueryIndex = ref(1);

// 当用户在查询界面切换下拉框的数据库连接时，拉取对应的库列表
const onQueryConnectionChange = async (tab) => {
  tab.schema = ''; // 清空已选库
  tab.schemaList = []; // 清空库列表
  
  if (!tab.connectionId) return;
  
  try {
    const res = await window.electronAPI.listSchemas({ connectionId: tab.connectionId });
    if (res.success) {
      tab.schemaList = res.data;
    }
  } catch (e) {
    console.error("加载库列表失败", e);
  }
};

const addQueryTab = () => {
  if (!activeConnection.value) return;
  const id = `query-${Date.now()}`;
  
  const newTab = {
    id,
    type: 'query', 
    title: `🔍 查询${nextQueryIndex.value++}`,
    connectionId: activeConnection.value.id,
    schema: activeSchema.value || '', // 继承当前左侧选中的库
    schemaList: [], // 存放该连接下的所有库，供下拉框选择
    sql: '',
    loading: false,
    error: '',
    result: { rows: [], fields: [] }
  };
  
  openTabs.value.push(newTab);
  activeTab.value = id;
  
  // 刚创建时，自动拉取当前连接的库列表填充下拉框
  onQueryConnectionChange(newTab).then(() => {
    // 拉取完成后，恢复默认选中的库
    newTab.schema = activeSchema.value || '';
  });
};

const removeTab = (targetId) => {
  const idx = openTabs.value.findIndex(t => t.id === targetId);
  if (idx === -1) return;
  
  const wasActive = activeTab.value === targetId;
  openTabs.value.splice(idx, 1);
  
  if (wasActive) {
    const next = openTabs.value[idx] || openTabs.value[idx - 1];
    if (next) {
      activeTab.value = next.id;
      handleTabChange(next.id);
    } else {
      activeTab.value = ''; 
      activeTable.value = '';
    }
  }
};

const executeSqlForTab = async (tab) => {
  const sql = (tab.sql || '').trim();
  if (!sql) return ElMessage.warning('请输入SQL语句');
  if (!tab.connectionId) return ElMessage.warning('请选择数据库连接');
  
  try {
    tab.loading = true;
    tab.error = '';
    
    // 【重要】如果你希望针对用户下拉框选择的库 (tab.schema) 执行 SQL
    // 根据具体数据库驱动配置，可能需要在后台执行 `USE ${tab.schema}`。
    // 这里我们直接将前端组装好的数据发送给 IPC，如果你的 db-config.js 支持传入 schema 执行，可在此扩充。
    const result = await window.electronAPI.executeSql({
      connectionId: tab.connectionId, 
      schema: tab.schema, // 传给后台当前下拉框选择的数据库名
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

// ================= 弹窗与连接管理 =================
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
  display: flex;
  gap: 10px;
}
.header-btn {
  flex: 1;
  margin-left: 0 !important;
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

.empty-workspace {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.tabs { height: 100%; }

.table-data-wrap {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px);
}
.table-data-toolbar {
  padding-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 15px;
}
.table-data-content {
  flex: 1;
  min-height: 0;
}

/* ================== 查询页面的新样式 (上下布局) ================== */
.query-wrap {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px); /* 占满整个选项卡区域 */
}

.query-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-bottom: 10px;
}

.query-editor-container {
  flex: 1; /* 占据上半部分剩余的全部空间 */
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  min-height: 150px; /* 防止被挤没 */
  overflow: hidden;
}

.query-result-container {
  height: 280px; /* 下半部分结果集固定高度，类似 Navicat 逻辑 */
  margin-top: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color);
}

.error-panel {
  padding: 15px;
  color: #f56c6c;
  background-color: #fef0f0;
  height: 100%;
  overflow-y: auto;
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
}

.error-title {
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 14px;
}
/* ========================================================= */

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