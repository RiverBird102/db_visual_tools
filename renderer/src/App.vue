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
// import SchemaExplorer from './components/SchemaExplorer.vue'; // 已废弃，不再需要
import TableDesigner from './components/TableDesigner.vue';

// 响应式数据
const showConnectDialog = ref(false);
const activeConnection = ref(null);
const isEditMode = ref(false);
const currentEditData = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const queryResult = ref({ rows: [], fields: [] });

const activeSchema = ref('');
const activeTable = ref('');
const activeTab = ref('designer');
const generatedSql = ref('');
const queryTabs = ref([]);

// 【新增】级联树的核心状态
const treeRenderKey = ref(0); 
const allConnections = ref([]); 
const treeProps = reactive({
  label: 'label',
  children: 'children',
  isLeaf: 'isLeaf' // 告诉树哪些节点可以展开，哪些是叶子节点
});

// 【修改】加载连接（现在只负责触发树的重新渲染）
const loadConnections = async () => {
  treeRenderKey.value += 1; 
};

// 【核心新增】懒加载树节点的逻辑
const loadTreeNode = async (node, resolve) => {
  // 级别 0：加载所有的数据库连接
  if (node.level === 0) {
    const res = await window.electronAPI.getDbConnections();
    if (res.success) {
      allConnections.value = res.data;
      const nodes = res.data.map(conn => ({
        ...conn,
        label: conn.name,
        type: 'connection',
        treeId: `conn_${conn.id}`,
        isLeaf: false // 连接下面还有库，不是叶子
      }));
      return resolve(nodes);
    }
    return resolve([]);
  }

  // 级别 1：加载选中连接下的所有的 Schema (库)
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
          isLeaf: false // 库下面还有表，不是叶子
        }));
        return resolve(nodes);
      } else {
        ElMessage.error(`获取数据库失败: ${res.error}`);
        return resolve([]);
      }
    } catch (error) {
      return resolve([]);
    }
  }

  // 级别 2：加载选中 Schema 下的所有的 Table (表)
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
            isLeaf: true // 表是最后一级，所以是叶子节点
          };
        });
        return resolve(nodes);
      } else {
        ElMessage.error(`获取表失败: ${res.error}`);
        return resolve([]);
      }
    } catch (error) {
      return resolve([]);
    }
  }

  return resolve([]);
};

// 【修改】处理树节点的点击事件（根据点击的层级做出不同反应）
const handleNodeClick = (data, node) => {
  if (data.type === 'connection') {
    activeConnection.value = allConnections.value.find(c => c.id === data.id);
  } else if (data.type === 'schema') {
    activeConnection.value = allConnections.value.find(c => c.id === data.connectionId);
    activeSchema.value = data.schemaName;
  } else if (data.type === 'table') {
    activeConnection.value = allConnections.value.find(c => c.id === data.connectionId);
    activeSchema.value = data.schemaName;
    activeTable.value = data.tableName;
    activeTab.value = 'designer'; // 自动切换到表结构标签页
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
  currentEditData.value = { ...data };
  showConnectDialog.value = true;
};

// 保存连接
const saveConnection = async (connection) => {
  try {
    if (isEditMode.value && currentEditData.value) {
      connection.id = currentEditData.value.id;
      // 强行断开后端缓存，确保修改立即生效（沿用上一次的修复逻辑）
      if (window.electronAPI.disconnectDb) {
        await window.electronAPI.disconnectDb(connection.id);
      }
      
      const result = await window.electronAPI.updateDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) {
        ElMessage.error(`保存失败: ${result.error}`);
        return;
      }
      if (activeConnection.value && activeConnection.value.id === connection.id) {
        activeConnection.value = null; // 清空右侧，强制重新点击
        activeSchema.value = '';
        activeTable.value = '';
      }
    } else {
      connection.id = Date.now().toString();
      const result = await window.electronAPI.saveDbConnection(JSON.parse(JSON.stringify(connection)));
      if (!result.success) {
        ElMessage.error(`保存失败: ${result.error}`);
        return;
      }
    }

    ElMessage.success(isEditMode.value ? '连接修改成功！' : '连接保存成功！');
    showConnectDialog.value = false;
    await loadConnections(); // 重新加载树
  } catch (error) {
    ElMessage.error(`保存异常: ${error.message}`);
  }
};

// 删除连接
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
    //取消删除
  }
};

// 测试连接
const testConnection = async (config) => {
  try {
    loading.value = true;
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
  if (idx === -1) return;
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

// 初始化：默认不执行什么，只要 treeRenderKey 是 0 就会自动触发 lazy load 第一层
onMounted(() => {
  // 不再需要手动 loadConnections()，因为 lazy=true 的 el-tree 挂载后会自动调用 loadTreeNode(level 0)
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
  /* 去除写死的高度，让它填满左边栏 */
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
  /* 防止文字太长撑破布局 */
  overflow: hidden; 
}
.node-label {
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 默认隐藏操作按钮 */
.node-actions {
  display: none;
  flex-shrink: 0;
}
/* 鼠标悬浮在树节点时，显示操作按钮 */
:deep(.el-tree-node__content:hover) .node-actions {
  display: inline-block;
}
</style>