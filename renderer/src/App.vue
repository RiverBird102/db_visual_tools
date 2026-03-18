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
          @revert-fallback="handleFallback" 
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

// 改造原有的 saveConnection 方法
const saveConnection = async (connection) => {
  try {
    let result;
    if (isEditMode.value) {
      // 执行更新
      result = await window.electronAPI.updateDbConnection(connection);
    } else {
      // 执行新增
      result = await window.electronAPI.saveDbConnection({
        id: Date.now().toString(),
        ...connection
      });
    }

    if (result.success) {
      showConnectDialog.value = false;
      ElMessage.success(isEditMode.value ? '连接更新成功！' : '连接保存成功！');
      await loadConnections();
      
      // 如果编辑的是当前正在使用的连接，更新一下信息
      if (activeConnection.value && activeConnection.value.id === connection.id) {
        activeConnection.value = { ...connection };
      }
    } else {
      ElMessage.error(`保存失败: ${result.error}`);
    }
  } catch (error) {
    console.error('保存连接失败:', error);
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

// ====== 在 App.vue 的 script 区域随便找个空白处添加 ======

// 处理用户点击“取消并回退至默认MySQL”的逻辑
const handleFallback = (fallbackData) => {
  // 1. 强制退出编辑模式，把它当做一个“新建”流程
  isEditMode.value = false; 
  
  // 2. 清除当前正在编辑的 ID，确保下次点保存是“新增”而不是“覆盖修改”
  currentEditData.value = null; 
  
  // 提示用户
  ElMessage.info('已回退到固化的默认MySQL连接信息');
  
  // 注意：我们这里没有写 showConnectDialog.value = false;
  // 所以弹窗会继续保持开启状态！完全符合你的要求。
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