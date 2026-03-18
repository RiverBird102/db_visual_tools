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
          <el-button 
            @click="loadConnections" 
            class="header-btn refresh-tree-btn" 
            title="刷新数据库目录树"
          >
            🔄
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
                  style="width: 160px;"
                  @change="onQueryConnectionChange(tab)"
                >
                  <el-option v-for="conn in allConnections" :key="conn.id" :label="conn.name" :value="conn.id" />
                </el-select>
                
                <el-select 
                  v-model="tab.schema" 
                  placeholder="选择数据库" 
                  size="small" 
                  style="width: 160px;"
                  @change="onQuerySchemaChange(tab)"
                >
                  <el-option v-for="schema in tab.schemaList" :key="schema" :label="schema" :value="schema" />
                </el-select>
                
                <el-button size="small" @click="refreshSchemaList(tab)" title="刷新数据库列表">🔄</el-button>
                
                <el-button type="primary" size="small" @click="executeSqlForTab(tab)" :loading="tab.loading" style="margin-left: 10px;">
                  ▶ 执行 (选中/全部)
                </el-button>
                <el-button size="small" @click="tab.sql = ''">清空</el-button>
              </div>

              <div class="query-editor-container">
                <sql-editor 
                  :ref="el => setEditorRef(el, tab.id)"
                  v-model="tab.sql" 
                  :connection="getConnectionById(tab.connectionId)" 
                  :hintTables="tab.hintTables"
                  :key="tab.id"
                ></sql-editor>
              </div>

              <div class="query-result-container">
                <div v-if="tab.error" class="error-panel">
                  <div class="error-title">❌ 语法或执行错误:</div>
                  {{ tab.error }}
                </div>
                
                <div v-else-if="tab.result && tab.result.isQuery === false" class="success-panel">
                  <div class="success-title">✅ SQL 执行成功</div>
                  <div class="success-detail">👉 状态: {{ tab.result.message }}</div>
                  <div class="success-detail" v-if="tab.result.affectedRows !== undefined">
                    👉 影响的行数: {{ tab.result.affectedRows }}
                  </div>
                </div>

                <data-viewer
                  v-else-if="tab.result && tab.result.isQuery === true"
                  :data="tab.result.rows"
                  :columns="tab.result.fields"
                  :loading="tab.loading"
                ></data-viewer>
                
                <div v-else class="empty-result">
                  <el-empty description="请执行 SQL 语句以查看结果" :image-size="60"></el-empty>
                </div>
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
const activeConnection = ref(null);
const activeSchema = ref('');
const activeTable = ref('');
const openTabs = ref([]); 
const activeTab = ref(''); 
const treeRenderKey = ref(0); 
const allConnections = ref([]); 

// 存储各个 Editor 的实例，用于获取“选中的代码”
const editorRefs = ref({});
const setEditorRef = (el, id) => {
  if (el) editorRefs.value[id] = el;
};

const treeProps = reactive({ label: 'label', children: 'children', isLeaf: 'isLeaf' });
const getConnectionById = (id) => allConnections.value.find(c => c.id === id);

const loadConnections = async () => { treeRenderKey.value += 1; };

const loadTreeNode = async (node, resolve) => {
  if (node.level === 0) {
    const res = await window.electronAPI.getDbConnections();
    if (res.success) {
      allConnections.value = res.data;
      const nodes = res.data.map(conn => ({
        ...conn, label: conn.name, type: 'connection', treeId: `conn_${conn.id}`, isLeaf: false
      }));
      return resolve(nodes);
    }
    return resolve([]);
  }
  if (node.level === 1) {
    try {
      const res = await window.electronAPI.listSchemas({ connectionId: node.data.id });
      if (res.success) {
        const nodes = res.data.map(schema => ({
          label: schema, type: 'schema', connectionId: node.data.id, schemaName: schema, treeId: `schema_${node.data.id}_${schema}`, isLeaf: false
        }));
        return resolve(nodes);
      }
    } catch (error) {}
    return resolve([]);
  }
  if (node.level === 2) {
    try {
      const res = await window.electronAPI.listTables({
        connectionId: node.data.connectionId, schema: node.data.schemaName
      });
      if (res.success) {
        const nodes = res.data.map(table => {
          const tableName = typeof table === 'object' ? (table.tableName || table.name) : table;
          return {
            label: tableName, type: 'table', connectionId: node.data.connectionId, schemaName: node.data.schemaName, tableName: tableName, treeId: `table_${node.data.connectionId}_${node.data.schemaName}_${tableName}`, isLeaf: true
          };
        });
        return resolve(nodes);
      }
    } catch (error) {}
    return resolve([]);
  }
  return resolve([]);
};

// 【核心修改】极致优化的表数据加载逻辑
const loadTableData = async (tab) => {
  tab.loading = true;
  tab.error = '';
  try {
    const conn = getConnectionById(tab.connectionId);
    const offset = (tab.currentPage - 1) * tab.pageSize;

    // 第一步：只查这 50 条数据，保证 100 毫秒内出结果给用户看！
    let sql = conn.dbType === 'mysql'
      ? `SELECT * FROM \`${tab.schema}\`.\`${tab.table}\` LIMIT ${tab.pageSize} OFFSET ${offset}`
      : `SELECT * FROM "${tab.schema}"."${tab.table}" LIMIT ${tab.pageSize} OFFSET ${offset}`;
    
    const result = await window.electronAPI.executeSql({ connectionId: tab.connectionId, sql: sql });
    
    if (!result.success) { 
      tab.error = result.error; 
      tab.loading = false;
      return; 
    }
    
    tab.result = result.data || { rows: [], fields: [] };
    tab.loading = false; // 立刻关闭转圈动画，用户已经可以看数据了

    // 第二步：在后台悄悄查数据总数，就算查 10 秒也不会卡住用户的界面
    let countSql = conn.dbType === 'mysql'
      ? `SELECT COUNT(*) as total FROM \`${tab.schema}\`.\`${tab.table}\``
      : `SELECT COUNT(*) as total FROM "${tab.schema}"."${tab.table}"`;
      
    window.electronAPI.executeSql({ connectionId: tab.connectionId, sql: countSql })
      .then(countResult => {
        if (countResult.success && countResult.data.rows.length > 0) {
          tab.total = Number(countResult.data.rows[0].total || countResult.data.rows[0].TOTAL || Object.values(countResult.data.rows[0])[0] || 0);
        }
      }).catch(err => console.warn('后台获取总数失败', err));

  } catch (e) { 
    tab.error = e.message; 
    tab.loading = false; 
  }
};

// 【核心修改】点击节点：先弹标签，再查数据
const handleNodeClick = (data) => {
  if (data.connectionId || data.id) activeConnection.value = getConnectionById(data.connectionId || data.id);
  if (data.type === 'schema') { activeSchema.value = data.schemaName; activeTable.value = ''; } 
  else if (data.type === 'table') {
    activeSchema.value = data.schemaName; activeTable.value = data.tableName;
    const tabId = `table_${data.connectionId}_${data.schemaName}_${data.tableName}`;
    if (openTabs.value.find(t => t.id === tabId)) { 
      activeTab.value = tabId; 
    } 
    else {
      // 1. 瞬间先推入一个带有 loading 状态的空标签页
      const newTab = { 
        id: tabId, type: 'table', title: `📄 ${data.tableName}`, connectionId: data.connectionId, 
        schema: data.schemaName, table: data.tableName, loading: true, error: '', 
        result: { rows: [], fields: [] }, currentPage: 1, pageSize: 50, total: 0 
      };
      openTabs.value.push(newTab); 
      activeTab.value = tabId; 
      
      // 2. 给 Vue 留 50 毫秒的喘息时间把标签页画出来，然后再去发繁重的请求
      setTimeout(() => {
        loadTableData(newTab);
      }, 50);
    }
  }
};

const handleTabChange = (tabId) => {
  const tab = openTabs.value.find(t => t.id === tabId);
  if (tab) {
    activeConnection.value = getConnectionById(tab.connectionId);
    if (tab.type === 'table') { activeSchema.value = tab.schema; activeTable.value = tab.table; } 
    else { activeSchema.value = tab.schema || ''; activeTable.value = ''; }
  }
};

// ================= 查询与自动补全逻辑 =================
const nextQueryIndex = ref(1);

const fetchAutoCompletionData = async (tab) => {
  if (!tab.connectionId || !tab.schema) { tab.hintTables = {}; return; }
  try {
    const res = await window.electronAPI.listTables({ connectionId: tab.connectionId, schema: tab.schema });
    if (res.success) {
      const tablesObj = {};
      res.data.forEach(t => tablesObj[t] = []); 
      tab.hintTables = tablesObj;
    }
  } catch(e) {}
};

const onQuerySchemaChange = (tab) => { fetchAutoCompletionData(tab); };

const refreshSchemaList = async (tab) => {
  if (!tab.connectionId) return;
  try {
    const res = await window.electronAPI.listSchemas({ connectionId: tab.connectionId });
    if (res.success) {
      tab.schemaList = res.data;
      if (tab.schema && !tab.schemaList.includes(tab.schema)) tab.schema = '';
    }
  } catch (e) {}
};

const onQueryConnectionChange = async (tab) => {
  tab.schema = ''; tab.schemaList = []; tab.hintTables = {}; 
  await refreshSchemaList(tab);
};

const addQueryTab = () => {
  if (!activeConnection.value) return;
  const id = `query-${Date.now()}`;
  const newTab = {
    id, type: 'query', title: `🔍 查询${nextQueryIndex.value++}`,
    connectionId: activeConnection.value.id, schema: activeSchema.value || '', 
    schemaList: [], hintTables: {}, sql: '', loading: false, error: '', result: null
  };
  openTabs.value.push(newTab); activeTab.value = id;
  refreshSchemaList(newTab).then(() => {
    newTab.schema = activeSchema.value || '';
    if(newTab.schema) fetchAutoCompletionData(newTab); 
  });
};

const removeTab = (targetId) => {
  const idx = openTabs.value.findIndex(t => t.id === targetId);
  if (idx === -1) return;
  const wasActive = activeTab.value === targetId;
  openTabs.value.splice(idx, 1);
  if (wasActive) {
    const next = openTabs.value[idx] || openTabs.value[idx - 1];
    if (next) { activeTab.value = next.id; handleTabChange(next.id); } 
    else { activeTab.value = ''; activeTable.value = ''; }
  }
};

const executeSqlForTab = async (tab) => {
  const editorRef = editorRefs.value[tab.id];
  const sql = editorRef ? editorRef.getSelectionOrAll().trim() : (tab.sql || '').trim();
  
  if (!sql) return ElMessage.warning('请输入或选中要执行的 SQL 语句');
  if (!tab.connectionId) return ElMessage.warning('请选择数据库连接');
  
  try {
    tab.loading = true; tab.error = ''; tab.result = null;
    const result = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
    if (!result.success) { tab.error = result.error; return; }
    tab.result = result.data || {};
  } catch (e) { tab.error = e.message; } finally { tab.loading = false; }
};

// ================= 连接管理弹窗 =================
const openCreateDialog = () => { isEditMode.value = false; currentEditData.value = null; showConnectDialog.value = true; };
const openEditDialog = (data) => { isEditMode.value = true; currentEditData.value = { ...data }; showConnectDialog.value = true; };

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
    showConnectDialog.value = false; await loadConnections(); 
  } catch (error) { ElMessage.error(`保存异常: ${error.message}`); }
};

const deleteConnection = async (data) => {
  try {
    await ElMessageBox.confirm(`确定要删除 "${data.name}" 吗？`, '警告', { type: 'warning' });
    const result = await window.electronAPI.deleteDbConnection(data.id);
    if (result.success) {
      ElMessage.success('删除成功！');
      openTabs.value = openTabs.value.filter(t => t.connectionId !== data.id);
      if (!openTabs.value.find(t => t.id === activeTab.value)) activeTab.value = openTabs.value.length > 0 ? openTabs.value[openTabs.value.length-1].id : '';
      await loadConnections();
    } else { ElMessage.error(`删除失败: ${result.error}`); }
  } catch (e) {}
};

const testConnection = async (config) => {
  try {
    loading.value = true;
    const result = await window.electronAPI.testDbConnection(JSON.parse(JSON.stringify(config)));
    if (result.success) ElMessage.success('连接测试成功！');
    else ElMessage.error(`连接测试失败: ${result.error}`);
  } catch (error) { ElMessage.error(`测试失败: ${error.message}`); } finally { loading.value = false; }
};
</script>

<style scoped>
.app-root { height: 100vh; }
.left { border-right: 1px solid var(--el-border-color); display: flex; flex-direction: column; }
.sidebar-header { padding: 10px; border-bottom: 1px solid var(--el-border-color); display: flex; gap: 10px; }
.header-btn { flex: 1; margin-left: 0 !important; }
.refresh-tree-btn { flex: 0 0 auto !important; padding: 8px 12px !important; }
.connection-tree { flex: 1; padding: 8px; overflow: auto; }
.right { height: 100%; }
.topbar { border-bottom: 1px solid var(--el-border-color); display: flex; align-items: center; justify-content: space-between; }
.crumb { margin-left: 10px; color: var(--el-text-color-secondary); }
.main { padding: 10px; height: calc(100vh - 60px); }

.empty-workspace { height: 100%; display: flex; align-items: center; justify-content: center; background-color: var(--el-fill-color-light); border-radius: 8px; }
.tabs { height: 100%; }

.table-data-wrap { display: flex; flex-direction: column; height: calc(100vh - 130px); }
.table-data-toolbar { padding-bottom: 10px; display: flex; align-items: center; gap: 15px; }
.table-data-content { flex: 1; min-height: 0; }

.query-wrap { display: flex; flex-direction: column; height: calc(100vh - 130px); }
.query-toolbar { display: flex; gap: 10px; align-items: center; padding-bottom: 10px; }
.query-editor-container { flex: 1; border: 1px solid var(--el-border-color); border-radius: 4px; min-height: 150px; overflow: hidden; }

/* 底部面板总容器 */
.query-result-container {
  height: 280px; margin-top: 10px; border: 1px solid var(--el-border-color); border-radius: 4px;
  display: flex; flex-direction: column; overflow: hidden; background: var(--el-bg-color);
}

/* 执行成功面板样式 */
.success-panel {
  padding: 20px;
  color: #67c23a;
  background-color: #f0f9eb;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.success-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
.success-detail { font-size: 14px; margin-bottom: 5px; color: #333; font-family: Consolas, monospace; }

/* 错误面板样式 */
.error-panel { padding: 15px; color: #f56c6c; background-color: #fef0f0; height: 100%; overflow-y: auto; font-family: Consolas, monospace; font-size: 13px; line-height: 1.5; }
.error-title { font-weight: bold; margin-bottom: 8px; font-size: 14px; }

/* 空面板样式 */
.empty-result { height: 100%; display: flex; align-items: center; justify-content: center; background-color: #fafafa; }

.custom-tree-node { flex: 1; display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding-right: 8px; overflow: hidden; }
.node-label { display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-actions { display: none; flex-shrink: 0; }
:deep(.el-tree-node__content:hover) .node-actions { display: inline-block; }
</style>