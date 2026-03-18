<template>
  <el-container class="app-root">
    <el-aside width="300px" class="left">
      <div class="sidebar-header">
        <el-button type="primary" @click="openCreateDialog">新建连接</el-button>
      </div>

      <el-tree
        :data="connectionTree"
        :props="treeProps"
        node-key="id"
        highlight-current
        @node-click="handleNodeClick"
        class="connection-tree"
      >
        <template #default="{ node, data }">
          <div class="custom-tree-node">
            <span>{{ node.label }}</span>
            <span class="node-actions" @click.stop>
              <el-button link type="primary" size="small" @click.stop="openEditDialog(data)">编辑</el-button>
              <el-button link type="danger" size="small" @click.stop="deleteConnection(data)">删除</el-button>
            </span>
          </div>
        </template>
      </el-tree>

      <div class="schema-panel" v-if="activeConnection">
        <schema-explorer
          :connection-id="activeConnection.id"
          @selectTable="handleSelectTable"
          @schemaChanged="(s) => (activeSchema = s)"
        />
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
import { ElMessage, ElMessageBox } from 'element-plus';
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';
import SchemaExplorer from './components/SchemaExplorer.vue';
import TableDesigner from './components/TableDesigner.vue';

// 响应式数据
const showConnectDialog = ref(false);
const activeConnection = ref(null);
const isEditMode = ref(false);
const currentEditData = ref(null);
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

// 新建连接弹窗
const openCreateDialog = () => {
  isEditMode.value = false;
  currentEditData.value = null;
  showConnectDialog.value = true;
};

// 编辑连接弹窗
const openEditDialog = (data) => {
  isEditMode.value = true;
  currentEditData.value = { ...data }; // 深拷贝，防止直接修改原对象
  showConnectDialog.value = true;
};

const saveConnection = async (connection) => {
  try {
    if (isEditMode.value && currentEditData.value) {
      // 编辑：保持原有连接的 ID 不变
      connection.id = currentEditData.value.id;
      const result = await window.electronAPI.updateDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) {
        ElMessage.error(`保存失败: ${result.error}`);
        return;
      }
      // 如果当前正在使用该连接，更新右侧展示用的数据
      if (activeConnection.value && activeConnection.value.id === connection.id) {
        activeConnection.value = { ...activeConnection.value, ...connection };
      }
    } else {
      // 新建：生成一个全新的 ID 然后保存
      connection.id = Date.now().toString();
      const result = await window.electronAPI.saveDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) {
        ElMessage.error(`保存失败: ${result.error}`);
        return;
      }
    }

    ElMessage.success(isEditMode.value ? '连接修改成功！' : '连接保存成功！');
    showConnectDialog.value = false;
    // 重新加载左侧的导航树，刷新显示
    await loadConnections();
  } catch (error) {
    ElMessage.error(`保存异常: ${error.message}`);
  }
};

// 新增删除连接方法
const deleteConnection = async (data) => {
  try {
    await ElMessageBox.confirm(`确定要删除数据库连接 "${data.name}" 吗？`, '警告', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
    
    const result = await window.electronAPI.deleteDbConnection(data.id);
    if (result.success) {
      ElMessage.success('删除成功！');
      // 如果删除的是当前选中的连接，清空右侧工作区
      if (activeConnection.value && activeConnection.value.id === data.id) {
        activeConnection.value = null;
        activeSchema.value = '';
        activeTable.value = '';
      }
      await loadConnections();
    } else {
      ElMessage.error(`删除失败: ${result.error}`);
    }
  } catch (e) {
    // 用户点击了取消，不做处理
  }
};

// 测试连接
const testConnection = async (config) => {
  try {
    loading.value = true;
    // 显式做一次深拷贝，确保传给 IPC 的对象是可结构化克隆的纯数据
    const plain = JSON.parse(JSON.stringify(config));
    const result = await window.electronAPI.testDbConnection(plain);
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

/* 树节点自定义样式 */
.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  padding-right: 8px;
}
/* 默认隐藏操作按钮 */
.node-actions {
  display: none;
}
/* 鼠标悬浮在树节点时，显示操作按钮 */
:deep(.el-tree-node__content:hover) .node-actions {
  display: inline-block;
}
</style>