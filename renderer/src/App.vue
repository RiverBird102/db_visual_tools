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

      <div class="sidebar-footer">
        <el-button text @click="openAiConfigDialog" style="width: 100%;">⚙️ AI 助手设置</el-button>
      </div>

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
                  :editable="true"
                  @submit-edits="handleTableEdits(tab, $event)"
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

                <el-button type="success" size="small" style="margin-left: auto;" @click="openAiPromptDialog(tab)">
                  ✨ AI 智能生成 SQL
                </el-button>
              </div>

              <div class="split-pane" ref="splitPane">
                <div class="query-editor-container" :style="{ height: tab.showBottomPanel ? tab.editorHeight + '%' : '100%' }">
                  <sql-editor 
                    :ref="el => setEditorRef(el, tab.id)"
                    v-model="tab.sql" 
                    :connection="getConnectionById(tab.connectionId)" 
                    :hintTables="tab.hintTables"
                    :key="tab.id"
                  ></sql-editor>
                </div>

                <div class="resizer" v-if="tab.showBottomPanel" @mousedown="startDrag($event, tab)"></div>

                <div class="query-bottom-panel" v-if="tab.showBottomPanel" :style="{ height: (100 - tab.editorHeight) + '%' }">
                  <div class="bottom-panel-header">
                    <div class="bottom-tabs">
                      <span :class="{ active: tab.bottomTab === 'result' }" @click="tab.bottomTab = 'result'">结果集</span>
                      <span :class="{ active: tab.bottomTab === 'message' }" @click="tab.bottomTab = 'message'">消息日志</span>
                      <span :class="{ active: tab.bottomTab === 'history' }" @click="tab.bottomTab = 'history'">执行历史</span>
                    </div>
                    <div class="bottom-actions">
                      <el-button link size="small" @click="tab.showBottomPanel = false">🔽 关闭面板</el-button>
                    </div>
                  </div>
                  
                  <div class="bottom-panel-content">
                    <div v-show="tab.bottomTab === 'result'" class="tab-content-inner">
                      <data-viewer v-if="tab.result && tab.result.isQuery" :data="tab.result.rows" :columns="tab.result.fields" :loading="tab.loading"></data-viewer>
                      <el-empty v-else description="无结果集返回" :image-size="60"></el-empty>
                    </div>

                    <div v-show="tab.bottomTab === 'message'" class="tab-content-inner message-log">
                      <div v-if="tab.error" class="error-text">❌ 错误: {{ tab.error }}</div>
                      <div v-else-if="tab.result && tab.result.isQuery === false" class="success-text">
                        ✅ {{ tab.result.message }} <span v-if="tab.result.affectedRows !== undefined"> (受影响的行数: {{ tab.result.affectedRows }})</span>
                      </div>
                      <div v-else-if="tab.result && tab.result.isQuery" class="success-text">✅ 查询执行成功，返回 {{ tab.result.rows.length }} 条记录。</div>
                      <div v-else style="color: #999;">等待执行...</div>
                    </div>

                    <div v-show="tab.bottomTab === 'history'" class="tab-content-inner">
                      <el-table :data="tab.history" size="small" border height="100%" style="width: 100%">
                        <el-table-column prop="time" label="执行时间" width="160"></el-table-column>
                        <el-table-column prop="sql" label="SQL语句" show-overflow-tooltip></el-table-column>
                        <el-table-column prop="duration" label="耗时(ms)" width="90"></el-table-column>
                        <el-table-column prop="status" label="状态" width="80">
                          <template #default="{row}">
                            <el-tag :type="row.status === '成功' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!tab.showBottomPanel" class="restore-bar" @click="tab.showBottomPanel = true">
                <span>⬆️ 展开结果面板</span>
              </div>
            </div>

          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>

    <el-dialog title="⚙️ AI 助手配置" v-model="showAiConfigDialog" width="500px">
      <el-form :model="aiConfig" label-width="100px">
        <el-form-item label="服务提供商">
          <el-select v-model="aiConfig.provider" style="width: 100%;">
            <el-option label="OpenAI (或兼容接口)" value="openai" />
            <el-option label="DeepSeek (需配置BaseUrl)" value="deepseek" />
            <el-option label="通义千问 (需配置BaseUrl)" value="dashscope" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="aiConfig.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="aiConfig.baseUrl" placeholder="默认: https://api.openai.com/v1" />
          <div class="form-tip">如果你使用的是中转或国产大模型，请填入对应的 Base URL。</div>
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="aiConfig.model" placeholder="如: gpt-3.5-turbo, deepseek-chat" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAiConfigDialog = false">取 消</el-button>
          <el-button type="primary" @click="saveAiConfig">保 存</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="showAiPromptDialog" title="✨ AI 智能生成 SQL" width="600px">
      <el-alert
        title="AI 会结合当前选择的数据库结构为您自动生成精准的 SQL 语句。"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 15px;"
      />
      <el-input
        v-model="aiPromptInput"
        type="textarea"
        :rows="4"
        placeholder="例如：查询所有年龄大于 20 岁并且在研发部的员工姓名，按照入职时间倒序排列..."
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAiPromptDialog = false" :disabled="aiGenerating">取 消</el-button>
          <el-button type="primary" @click="generateSqlWithAi" :loading="aiGenerating">
            {{ aiGenerating ? '生成中...' : '开始生成 SQL' }}
          </el-button>
        </span>
      </template>
    </el-dialog>

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

const loadTableData = async (tab) => {
  tab.loading = true;
  tab.error = '';
  try {
    const conn = getConnectionById(tab.connectionId);
    const offset = (tab.currentPage - 1) * tab.pageSize;

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
    tab.loading = false; 

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

const handleTableEdits = async (tab, edits) => {
  try {
    tab.loading = true;
    const conn = getConnectionById(tab.connectionId);
    
    const colRes = await window.electronAPI.getTableColumns({
      connectionId: tab.connectionId, schema: tab.schema, table: tab.table
    });
    if (!colRes.success) throw new Error(colRes.error);

    const pkCols = colRes.data.filter(c => c.primaryKey).map(c => c.name);
    if (pkCols.length === 0) {
      throw new Error(`【安全拦截】表 "${tab.table}" 没有主键！禁止使用内联编辑，防止导致整表被误覆盖。`);
    }

    for (const edit of edits) {
      const { originalRow, updates } = edit;
      const setClauses = [];
      for (const [col, val] of Object.entries(updates)) {
        const safeVal = val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
        const safeCol = conn.dbType === 'mysql' ? `\`${col}\`` : `"${col}"`;
        setClauses.push(`${safeCol} = ${safeVal}`);
      }

      const whereClauses = [];
      for (const pk of pkCols) {
        const pkVal = originalRow[pk];
        if (pkVal === undefined || pkVal === null) throw new Error(`主键 "${pk}" 的值为空，无法准确定位更新行！`);
        const safePkVal = `'${String(pkVal).replace(/'/g, "''")}'`;
        const safePk = conn.dbType === 'mysql' ? `\`${pk}\`` : `"${pk}"`;
        whereClauses.push(`${safePk} = ${safePkVal}`);
      }

      const tableName = conn.dbType === 'mysql' ? `\`${tab.schema}\`.\`${tab.table}\`` : `"${tab.schema}"."${tab.table}"`;
      const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

      const execRes = await window.electronAPI.executeSql({
        connectionId: tab.connectionId,
        schema: tab.schema,
        sql: sql
      });
      
      if (!execRes.success) throw new Error(`数据更新失败: ${execRes.error}`);
    }

    ElMessage.success('🎉 修改已成功保存到数据库！');
    await loadTableData(tab); 
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    tab.loading = false;
  }
};

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
      const newTab = { 
        id: tabId, type: 'table', title: `📄 ${data.tableName}`, connectionId: data.connectionId, 
        schema: data.schemaName, table: data.tableName, loading: true, error: '', 
        result: { rows: [], fields: [] }, currentPage: 1, pageSize: 50, total: 0 
      };
      openTabs.value.push(newTab); 
      activeTab.value = tabId; 
      
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
    schemaList: [], hintTables: {}, sql: '', loading: false, error: '', result: null,
    showBottomPanel: true, editorHeight: 60, bottomTab: 'result', history: []
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
  
  const startTime = Date.now();
  tab.loading = true; 
  tab.error = ''; 
  tab.result = null;
  tab.showBottomPanel = true; 
  
  try {
    const result = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
    const duration = Date.now() - startTime;
    
    if (!result.success) { 
      tab.error = result.error; 
      tab.bottomTab = 'message';
      tab.history.unshift({ time: new Date().toLocaleString(), sql, duration, status: '失败' });
      return; 
    }
    
    tab.result = result.data || {};
    tab.bottomTab = tab.result.isQuery ? 'result' : 'message'; 
    tab.history.unshift({ time: new Date().toLocaleString(), sql, duration, status: '成功' });
  } catch (e) { 
    const duration = Date.now() - startTime;
    tab.error = e.message; 
    tab.bottomTab = 'message';
    tab.history.unshift({ time: new Date().toLocaleString(), sql, duration, status: '失败' });
  } finally { 
    tab.loading = false; 
  }
};

// ================= 拖拽分屏逻辑 =================
const startDrag = (e, tab) => {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = tab.editorHeight;
  const container = e.target.parentElement;
  const containerHeight = container.clientHeight;

  const onMouseMove = (moveEvent) => {
    const dy = moveEvent.clientY - startY;
    const percentageChange = (dy / containerHeight) * 100;
    let newHeight = startHeight + percentageChange;
    if (newHeight < 15) newHeight = 15;
    if (newHeight > 85) newHeight = 85;
    tab.editorHeight = newHeight;
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
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

// ================= 【核心新增】AI 助手逻辑 (设置与生成) =================
const showAiConfigDialog = ref(false);
const aiConfig = reactive({ provider: 'openai', apiKey: '', baseUrl: '', model: '' });

const openAiConfigDialog = async () => {
  try {
    if (window.electronAPI && window.electronAPI.getAiConfig) {
      const config = await window.electronAPI.getAiConfig();
      if (config) {
        Object.assign(aiConfig, config);
      }
    }
    showAiConfigDialog.value = true;
  } catch (err) {
    ElMessage.error("获取 AI 配置失败");
  }
};

const saveAiConfig = async () => {
  if (!aiConfig.apiKey) {
    return ElMessage.warning('API Key 不能为空！');
  }
  try {
    const res = await window.electronAPI.saveAiConfig(JSON.parse(JSON.stringify(aiConfig)));
    if (res.success) {
      ElMessage.success('AI 配置保存成功！');
      showAiConfigDialog.value = false;
    } else {
      ElMessage.error('保存失败: ' + res.error);
    }
  } catch (err) {
    ElMessage.error(err.message);
  }
};

const showAiPromptDialog = ref(false);
const aiPromptInput = ref('');
const aiGenerating = ref(false);
const targetAiTab = ref(null);

const openAiPromptDialog = (tab) => {
  if (!tab.connectionId) return ElMessage.warning('请先选择数据库连接！');
  targetAiTab.value = tab;
  aiPromptInput.value = '';
  showAiPromptDialog.value = true;
};

const generateSqlWithAi = async () => {
  if (!aiPromptInput.value.trim()) return ElMessage.warning('请输入需求描述！');
  const tab = targetAiTab.value;
  
  aiGenerating.value = true;
  try {
    const res = await window.electronAPI.generateSql({
      prompt: aiPromptInput.value,
      connectionId: tab.connectionId,
      schema: tab.schema
    });

    if (res.success && res.sql) {
      // 成功后，将生成的 SQL 拼接到编辑器末尾
      const editorRef = editorRefs.value[tab.id];
      if (editorRef) {
        const currentSql = editorRef.getSelectionOrAll();
        const appendSql = `\n\n-- AI 自动生成 (${aiPromptInput.value}):\n${res.sql}\n`;
        editorRef.setSql(currentSql + appendSql);
      } else {
        tab.sql += `\n\n-- AI 自动生成:\n${res.sql}\n`;
      }
      ElMessage.success('✨ SQL 生成成功！已添加到编辑器。');
      showAiPromptDialog.value = false;
    } else {
      throw new Error(res.error || '大模型返回为空');
    }
  } catch (err) {
    if (err.message.includes('未配置') || err.message.includes('API key')) {
      ElMessageBox.confirm('您尚未配置 AI API Key，或者 Key 无效。是否立即前往配置？', '提示', { type: 'warning' })
        .then(() => openAiConfigDialog());
    } else {
      ElMessage.error('AI 生成失败: ' + err.message);
    }
  } finally {
    aiGenerating.value = false;
  }
};
</script>

<style scoped>
.app-root { height: 100vh; }
.left { border-right: 1px solid var(--el-border-color); display: flex; flex-direction: column; }
.sidebar-header { padding: 10px; border-bottom: 1px solid var(--el-border-color); display: flex; gap: 10px; }
.header-btn { flex: 1; margin-left: 0 !important; }
.refresh-tree-btn { flex: 0 0 auto !important; padding: 8px 12px !important; }
.connection-tree { flex: 1; padding: 8px; overflow: auto; }

/* === 【新增】左侧边栏底部的 AI 设置区 === */
.sidebar-footer { padding: 10px; border-top: 1px solid var(--el-border-color); text-align: center; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4; }

.right { height: 100%; }
.topbar { border-bottom: 1px solid var(--el-border-color); display: flex; align-items: center; justify-content: space-between; }
.crumb { margin-left: 10px; color: var(--el-text-color-secondary); }
.main { padding: 10px; height: calc(100vh - 60px); }

.empty-workspace { height: 100%; display: flex; align-items: center; justify-content: center; background-color: var(--el-fill-color-light); border-radius: 8px; }
.tabs { height: 100%; }

.table-data-wrap { display: flex; flex-direction: column; height: calc(100vh - 130px); }
.table-data-toolbar { padding-bottom: 10px; display: flex; align-items: center; gap: 15px; }
.table-data-content { flex: 1; min-height: 0; }

/* === 查询主面板弹性布局 === */
.query-wrap { display: flex; flex-direction: column; height: calc(100vh - 130px); }
.query-toolbar { display: flex; gap: 10px; align-items: center; padding-bottom: 10px; }

/* 上下拖拽相关样式 */
.split-pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--el-border-color); border-radius: 4px; }
.query-editor-container { overflow: hidden; display: flex; flex-direction: column; }
.resizer { height: 6px; background-color: #f5f7fa; cursor: row-resize; border-top: 1px solid #ebeef5; border-bottom: 1px solid #ebeef5; transition: background 0.2s;}
.resizer:hover, .resizer:active { background-color: #409eff; }

/* 底部面板体系 */
.query-bottom-panel { display: flex; flex-direction: column; overflow: hidden; background: #fff; }
.bottom-panel-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ebeef5; background: #f8f9fa; }
.bottom-tabs span { display: inline-block; padding: 8px 15px; cursor: pointer; font-size: 13px; color: #606266; }
.bottom-tabs span:hover { color: #409eff; }
.bottom-tabs span.active { color: #409eff; border-bottom: 2px solid #409eff; font-weight: bold; background: #fff;}
.bottom-actions { margin-right: 10px; }
.bottom-panel-content { flex: 1; overflow: hidden; }
.tab-content-inner { height: 100%; display: flex; flex-direction: column; }

/* 消息日志与文本样式 */
.message-log { padding: 15px; overflow-y: auto; font-family: Consolas, monospace; font-size: 13px; line-height: 1.6; }
.error-text { color: #f56c6c; }
.success-text { color: #67c23a; }

/* 面板隐藏时的恢复栏 */
.restore-bar { text-align: center; padding: 4px; background: #f4f4f5; cursor: pointer; font-size: 12px; color: #909399; margin-top: 5px; border-radius: 4px; }
.restore-bar:hover { color: #409eff; background: #ecf5ff; }

.custom-tree-node { flex: 1; display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding-right: 8px; overflow: hidden; }
.node-label { display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-actions { display: none; flex-shrink: 0; }
:deep(.el-tree-node__content:hover) .node-actions { display: inline-block; }
</style>