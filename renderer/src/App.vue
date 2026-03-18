<template>
  <el-container class="app-root">
    <el-aside width="300px" class="left">
      <div class="sidebar-header">
        <el-button type="primary" @click="showConnectDialog = true">新建连接</el-button>
      </div>

      <el-tree
        :data="connectionTree"
        :props="treeProps"
        node-key="id"
        highlight-current
        @node-click="handleNodeClick"
        class="connection-tree"
      />

      <div class="schema-panel" v-if="activeConnection">
        <schema-explorer
          :connection-id="activeConnection.id"
          @selectTable="handleSelectTable"
          @schemaChanged="(s) => (activeSchema = s)"
        />
      </div>

      <el-dialog title="新建数据库连接" v-model="showConnectDialog" width="600px">
        <db-connect @save="saveConnection" @test="testConnection"></db-connect>
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
        <el-tabs v-model="activeTab" type="card" class="tabs" @tab-remove="removeTab">
          <el-tab-pane label="表结构" name="designer">
            <table-designer
              :connection-id="activeConnection?.id || ''"
              :schema="activeSchema"
              :table="activeTable"
              @sqlGenerated="(sql) => (generatedSql = sql)"
            />
          </el-tab-pane>
          <el-tab-pane label="SQL预览" name="sql">
            <el-input v-model="generatedSql" type="textarea" :rows="18" placeholder="这里会显示生成的DDL SQL"></el-input>
            <div style="margin-top: 10px;">
              <el-button type="primary" :disabled="!activeConnection || !generatedSql.trim()" @click="runGenerated">
                执行SQL
              </el-button>
            </div>
          </el-tab-pane>

          <el-tab-pane
            v-for="tab in queryTabs"
            :key="tab.id"
            :label="tab.title"
            :name="tab.id"
            closable
          >
            <div class="runner">
              <div class="runner-left">
                <div class="editor-wrap">
                  <sql-editor v-model="tab.sql" :connection="activeConnection" :key="tab.id"></sql-editor>
                </div>
                <div class="runner-actions">
                  <el-button type="primary" :disabled="!activeConnection" @click="executeSqlForTab(tab)">执行SQL</el-button>
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
import { ElMessage } from 'element-plus';
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';
import SchemaExplorer from './components/SchemaExplorer.vue';
import TableDesigner from './components/TableDesigner.vue';

// 响应式数据
const showConnectDialog = ref(false);
const activeConnection = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const queryResult = ref({ rows: [], fields: [] });
const connectionTree = ref([]);
const activeSchema = ref('');
const activeTable = ref('');
const activeTab = ref('designer');
const generatedSql = ref('');
const queryTabs = ref([]);
const treeProps = reactive({
  label: 'name',
  children: 'tables'
});

// 获取所有数据库连接
const loadConnections = async () => {
  try {
    const result = await window.electronAPI.getDbConnections();
    if (result.success) {
      // 构建连接树
      connectionTree.value = result.data.map(conn => ({
        ...conn,
        tables: [] // 后续可加载表列表
      }));
    }
  } catch (error) {
    console.error('加载连接失败:', error);
  }
};

// 保存新连接
const saveConnection = async (connection) => {
  try {
    const result = await window.electronAPI.saveDbConnection({
      id: Date.now().toString(),
      ...connection
    });
    if (result.success) {
      showConnectDialog.value = false;
      await loadConnections();
    }
  } catch (error) {
    console.error('保存连接失败:', error);
  }
};

// 测试连接
const testConnection = async (config) => {
  try {
    loading.value = true;
    const result = await window.electronAPI.testDbConnection(config);
    if (result.success) {
      ElMessage.success('连接测试成功！');
    } else {
      ElMessage.error(`连接测试失败: ${result.error}`);
    }
  } catch (error) {
    ElMessage.error(`连接测试失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 点击连接节点
const handleNodeClick = (data) => {
  if (data.id) {
    activeConnection.value = data;
    activeSchema.value = '';
    activeTable.value = '';
    generatedSql.value = '';
    errorMessage.value = '';
    queryResult.value = { rows: [], fields: [] };
  }
};

const handleSelectTable = ({ schema, table }) => {
  activeSchema.value = schema || '';
  activeTable.value = table || '';
  activeTab.value = 'designer';
};

const nextQueryIndex = ref(1);

const addQueryTab = () => {
  const id = `query-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  queryTabs.value.push({
    id,
    title: `查询${nextQueryIndex.value++}`,
    sql: '',
    loading: false,
    error: '',
    result: { rows: [], fields: [] }
  });
  activeTab.value = id;
};

const removeTab = (name) => {
  const idx = queryTabs.value.findIndex(t => t.id === name);
  if (idx === -1) return; // 固定页签不处理
  const wasActive = activeTab.value === name;
  queryTabs.value.splice(idx, 1);
  if (wasActive) {
    const next = queryTabs.value[idx] || queryTabs.value[idx - 1];
    activeTab.value = next ? next.id : 'designer';
  }
};

const executeSqlForTab = async (tab) => {
  if (!activeConnection.value) {
    ElMessage.warning('请先选择数据库连接');
    return;
  }
  const sql = (tab.sql || '').trim();
  if (!sql) {
    ElMessage.warning('请输入SQL语句');
    return;
  }
  try {
    tab.loading = true;
    tab.error = '';
    const result = await window.electronAPI.executeSql({
      connectionId: activeConnection.value.id,
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

const runGenerated = async () => {
  if (!activeConnection.value) return;
  try {
    loading.value = true;
    errorMessage.value = '';
    const result = await window.electronAPI.executeSql({
      connectionId: activeConnection.value.id,
      sql: generatedSql.value
    });
    if (!result.success) {
      errorMessage.value = result.error;
      ElMessage.error(`执行失败: ${result.error}`);
      return;
    }
    ElMessage.success('执行成功');
    queryResult.value = result.data || { rows: [], fields: [] };
    addQueryTab();
    const tab = queryTabs.value.find(t => t.id === activeTab.value);
    if (tab) tab.result = queryResult.value;
  } catch (e) {
    ElMessage.error(`执行失败: ${e.message}`);
  } finally {
    loading.value = false;
  }
};

// 初始化
onMounted(async () => {
  await loadConnections();
});
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
  padding: 8px;
  max-height: 260px;
  overflow: auto;
}
.schema-panel {
  flex: 1;
  min-height: 0;
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
.tabs { height: 100%; }
.runner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  height: calc(100vh - 160px);
}
.runner-left, .runner-right { min-height: 0; }
.runner-left {
  display: flex;
  flex-direction: column;
}
.editor-wrap {
  flex: 1;
  min-height: 0;
}
.runner-actions {
  margin-top: 10px;
}
</style>