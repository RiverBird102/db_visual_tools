<template>
  <div class="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
    
    <aside class="w-72 flex flex-col bg-white border-r border-slate-200 shadow-sm z-10">
      <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h2 class="font-bold text-sm text-slate-700 tracking-tight">数据库资源</h2>
        <div class="flex gap-1">
          <button @click="openCreateDialog" class="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors" title="新建连接">
            <Plus :size="16" />
          </button>
          <button @click="addQueryTab" :disabled="!activeConnection" class="p-1.5 hover:bg-green-50 rounded text-green-600 disabled:text-slate-300 transition-colors" title="新建查询">
            <FileCode2 :size="16" />
          </button>
          <button @click="loadConnections" class="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors" title="刷新目录">
            <RefreshCw :size="16" />
          </button>
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <el-tree
          :key="treeRenderKey"
          :props="treeProps"
          :load="loadTreeNode"
          lazy
          node-key="treeId"
          highlight-current
          @node-click="handleNodeClick"
          class="modern-tree"
        >
          <template #default="{ node, data }">
            <div class="flex-1 flex items-center justify-between text-sm pr-2 overflow-hidden group">
              <span class="flex items-center gap-2 truncate text-slate-700">
                <Zap v-if="data.type === 'connection'" :size="14" class="text-amber-500" />
                <Database v-else-if="data.type === 'schema'" :size="14" class="text-blue-500" />
                <TableIcon v-else-if="data.type === 'table'" :size="14" class="text-slate-400" />
                <span class="truncate" :title="node.label">{{ node.label }}</span>
              </span>
              <span class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop v-if="data.type === 'connection'">
                <button @click.stop="openEditDialog(data)" class="text-blue-500 hover:text-blue-700 p-1"><Edit3 :size="12" /></button>
                <button @click.stop="deleteConnection(data)" class="text-red-500 hover:text-red-700 p-1"><Trash2 :size="12" /></button>
              </span>
            </div>
          </template>
        </el-tree>
      </div>

      <div class="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <button @click="openAiConfigDialog" class="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors">
          <Settings :size="14" /> AI 助手设置
        </button>
      </div>
    </aside>
    
    <main class="flex-1 flex flex-col min-w-0 bg-white">
      <header class="h-12 border-b border-slate-200 flex items-center px-4 justify-between bg-white shrink-0">
        <div class="flex items-center gap-3">
          <el-tag v-if="activeConnection" effect="plain" class="border-blue-200 text-blue-600 bg-blue-50">
            <span class="flex items-center gap-1"><Zap :size="12"/> {{ activeConnection.name }}</span>
          </el-tag>
          <span v-if="activeTable" class="text-sm text-slate-500 flex items-center gap-1">
            <Database :size="12"/> {{ activeSchema }} <span class="text-slate-300">/</span> <TableIcon :size="12"/> {{ activeTable }}
          </span>
        </div>
      </header>

      <div class="flex-1 flex flex-col overflow-hidden relative">
        <div v-if="openTabs.length === 0" class="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
          <el-empty description="在左侧点击表名查看数据，或新建查询" :image-size="120" />
        </div>

        <el-tabs 
          v-else 
          v-model="activeTab" 
          type="card" 
          class="modern-tabs flex-1 flex flex-col" 
          @tab-remove="removeTab"
          @tab-change="handleTabChange"
        >
          <el-tab-pane
            v-for="tab in openTabs"
            :key="tab.id"
            :label="tab.title"
            :name="tab.id"
            closable
            class="h-full flex flex-col"
          >
            <div v-if="tab.type === 'table'" class="flex flex-col h-full p-2">
              <div class="flex items-center gap-3 pb-2 border-b border-slate-100 mb-2">
                <el-button type="primary" size="small" @click="loadTableData(tab)" :loading="tab.loading" class="shadow-sm">刷新数据</el-button>
                <el-pagination
                  v-model:current-page="tab.currentPage"
                  v-model:page-size="tab.pageSize"
                  :page-sizes="[50, 100, 200, 500]"
                  layout="total, sizes, prev, pager, next"
                  :total="tab.total"
                  @size-change="loadTableData(tab)"
                  @current-change="loadTableData(tab)"
                  size="small"
                  class="ml-auto"
                />
              </div>
              <div class="flex-1 min-h-0 border rounded border-slate-200 overflow-hidden">
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

            <div v-else-if="tab.type === 'query'" class="flex flex-col h-full p-2">
              <div class="flex items-center gap-2 pb-2 mb-2">
                <el-select v-model="tab.connectionId" placeholder="选择连接" size="small" class="w-40" @change="onQueryConnectionChange(tab)">
                  <el-option v-for="conn in allConnections" :key="conn.id" :label="conn.name" :value="conn.id" />
                </el-select>
                <el-select v-model="tab.schema" placeholder="选择数据库" size="small" class="w-40" @change="onQuerySchemaChange(tab)">
                  <el-option v-for="schema in tab.schemaList" :key="schema" :label="schema" :value="schema" />
                </el-select>
                <button @click="refreshSchemaList(tab)" class="p-1 hover:bg-slate-100 rounded text-slate-500"><RefreshCw :size="14"/></button>
                
                <el-button type="primary" size="small" @click="executeSqlForTab(tab)" :loading="tab.loading" class="ml-2 shadow-sm">
                  <span class="flex items-center gap-1"><Play :size="12"/> 执行查询</span>
                </el-button>

                <el-button type="warning" size="small" @click="handleAiDiagnosis(tab)" class="shadow-sm bg-amber-500 hover:bg-amber-600 border-none">
                  <span class="flex items-center gap-1"><Activity :size="12"/> AI 诊断</span>
                </el-button>
                
                <el-button size="small" @click="tab.sql = ''">清空</el-button>
              </div>

              <div class="flex-1 flex flex-col overflow-hidden border border-slate-200 rounded-lg shadow-sm">
                <div class="relative" :style="{ height: tab.showBottomPanel ? tab.editorHeight + '%' : '100%' }">
                  <sql-editor 
                    :ref="el => setEditorRef(el, tab.id)"
                    v-model="tab.sql" 
                    :connection="getConnectionById(tab.connectionId)" 
                    :hintTables="tab.hintTables"
                    :key="tab.id"
                  ></sql-editor>
                </div>

                <div class="resizer" v-if="tab.showBottomPanel" @mousedown="startDrag($event, tab)"></div>

                <div class="flex flex-col bg-white" v-if="tab.showBottomPanel" :style="{ height: (100 - tab.editorHeight) + '%' }">
                  <div class="flex justify-between items-center border-b border-slate-200 bg-slate-50 px-2 h-9 shrink-0">
                    <div class="flex space-x-1">
                      <button v-for="bt in ['result', 'message', 'history']" :key="bt"
                        @click="tab.bottomTab = bt"
                        :class="tab.bottomTab === bt ? 'bg-white border-t-2 border-blue-500 text-blue-600 font-medium' : 'text-slate-500 hover:bg-slate-200'"
                        class="px-4 py-1.5 text-xs transition-colors rounded-t-sm"
                      >
                        {{ bt === 'result' ? '结果集' : bt === 'message' ? '消息日志' : '执行历史' }}
                      </button>
                    </div>
                    <button @click="tab.showBottomPanel = false" class="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                      <ChevronDown :size="14"/> 关闭
                    </button>
                  </div>
                  
                  <div class="flex-1 overflow-hidden">
                    <div v-show="tab.bottomTab === 'result'" class="h-full">
                      <data-viewer v-if="tab.result && tab.result.isQuery" :data="tab.result.rows" :columns="tab.result.fields" :loading="tab.loading"></data-viewer>
                      <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">无结果集返回</div>
                    </div>

                    <div v-show="tab.bottomTab === 'message'" class="h-full p-4 overflow-y-auto font-mono text-sm bg-slate-900 text-slate-300">
                      <div v-if="tab.error" class="text-red-400">❌ Error: {{ tab.error }}</div>
                      <div v-else-if="tab.result && tab.result.isQuery === false" class="text-green-400">
                        ✅ {{ tab.result.message }} <span v-if="tab.result.affectedRows !== undefined"> (受影响行数: {{ tab.result.affectedRows }})</span>
                      </div>
                      <div v-else-if="tab.result && tab.result.isQuery" class="text-green-400">✅ 查询执行成功，返回 {{ tab.result.rows.length }} 条记录。</div>
                      <div v-else class="text-slate-500">等待执行...</div>
                    </div>

                    <div v-show="tab.bottomTab === 'history'" class="h-full">
                      <el-table :data="tab.history" size="small" border height="100%">
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

              <div v-if="!tab.showBottomPanel" class="text-center py-1 bg-slate-100 hover:bg-blue-50 cursor-pointer text-xs text-slate-500 hover:text-blue-600 mt-2 rounded border border-slate-200 transition-colors" @click="tab.showBottomPanel = true">
                ⬆️ 展开结果面板
              </div>
            </div>

          </el-tab-pane>
        </el-tabs>
      </div>
    </main>

    <aside class="w-80 flex flex-col bg-slate-50 border-l border-slate-200 shadow-sm z-10">
      <div class="flex border-b border-slate-200 bg-white">
        <button v-for="mode in ['chat', 'insight']" :key="mode"
                @click="aiPanelTab = mode"
                :class="aiPanelTab === mode ? 'text-blue-600 border-b-2 border-blue-600 font-bold bg-blue-50/30' : 'text-slate-500 hover:bg-slate-50'"
                class="flex-1 py-3 text-sm transition-all flex items-center justify-center gap-2">
          <Sparkles v-if="mode === 'chat'" :size="16" /> 
          <BarChart2 v-else :size="16" />
          {{ mode === 'chat' ? '智能生成' : '数据洞察' }}
        </button>
      </div>

      <div v-show="aiPanelTab === 'chat'" class="flex-1 flex flex-col p-4 overflow-hidden">
        <div class="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar text-sm">
          <div class="text-center text-xs text-slate-400 mb-4 bg-slate-200/50 py-1 rounded">
            AI 会结合当前选中的数据库为您生成 SQL
          </div>
          
          <div v-for="(msg, i) in aiChatHistory" :key="i" 
               :class="msg.role === 'user' ? 'ml-8 items-end' : 'mr-8 items-start'"
               class="flex flex-col">
            <span class="text-[10px] text-slate-400 mb-1 px-1 flex items-center gap-1">
              <User v-if="msg.role === 'user'" :size="10"/>
              <Bot v-else :size="10" class="text-blue-500"/>
              {{ msg.role === 'user' ? 'You' : 'AI Assistant' }}
            </span>
            <div :class="msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'"
                 class="p-3 rounded-xl shadow-sm leading-relaxed whitespace-pre-wrap font-sans">
              {{ msg.content }}
            </div>
            <button v-if="msg.role === 'ai' && msg.sql" @click="insertSqlToEditor(msg.sql)" class="mt-1 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-1">
              <ArrowLeftToLine :size="12"/> 插入到编辑器
            </button>
          </div>
          
          <div v-if="aiGenerating" class="flex gap-1 ml-2 mt-4">
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-75"></span>
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150"></span>
          </div>
        </div>

        <div class="relative shrink-0">
          <textarea v-model="aiPromptInput" 
                    placeholder="描述你的查询需求..." 
                    @keydown.ctrl.enter="generateSqlWithAi"
                    class="w-full h-24 bg-white border border-slate-300 rounded-xl p-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none shadow-sm resize-none transition-all"></textarea>
          <button @click="generateSqlWithAi" :disabled="aiGenerating || !aiPromptInput.trim()"
                  class="absolute bottom-3 right-3 text-white bg-blue-600 p-1.5 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors">
            <Send :size="16" />
          </button>
        </div>
      </div>

      <div v-show="aiPanelTab === 'insight'" class="flex-1 p-4 overflow-y-auto flex flex-col items-center justify-center text-slate-400 text-sm">
        <BarChart2 :size="48" class="mb-4 opacity-20" />
        <p>执行查询后，</p>
        <p>AI 将在此处自动生成图表分析</p>
      </div>
    </aside>

    <el-dialog v-model="showAiAnalysisDialog" title="🔬 AI 慢查询诊断报告" width="800px">
      <div v-loading="analysisLoading" class="min-h-[300px] max-h-[60vh] overflow-y-auto">
        <div v-if="aiAnalysisResult" class="p-2">
          <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-200">{{ aiAnalysisResult }}</pre>
        </div>
        <el-empty v-else-if="!analysisLoading" description="正在深度分析执行计划，请稍候..." />
      </div>
      <template #footer>
        <el-button @click="showAiAnalysisDialog = false">关闭报告</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="isEditMode ? '编辑数据库连接' : '新建数据库连接'" v-model="showConnectDialog" width="600px" destroy-on-close>
      <db-connect :initial-data="currentEditData" @save="saveConnection" @test="testConnection" @cancel="showConnectDialog = false"></db-connect>
    </el-dialog>

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
          <div class="text-xs text-slate-400 mt-1">如果你使用的是中转或国产大模型，请填入对应的 Base URL。</div>
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

  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';

// 引入现代图标 (新增了 Activity 图标)
import { 
  Plus, RefreshCw, Edit3, Trash2, Zap, Database, Table as TableIcon,
  Play, Settings, Sparkles, MessageSquare, BarChart2, ChevronDown, 
  Send, Bot, User, ArrowLeftToLine, FileCode2, Activity
} from 'lucide-vue-next';

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

// === AI 面板状态 ===
const aiPanelTab = ref('chat');
const aiChatHistory = ref([]);
const aiPromptInput = ref('');
const aiGenerating = ref(false);

// === 【新增】：AI 诊断状态 ===
const showAiAnalysisDialog = ref(false);
const analysisLoading = ref(false);
const aiAnalysisResult = ref('');

// 存储各个 Editor 的实例
const editorRefs = {};
const setEditorRef = (el, id) => {
  if (el) {
    editorRefs[id] = el;
  } else {
    delete editorRefs[id]; // 切换/关闭标签时释放内存
  }
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
        id: tabId, type: 'table', title: `${data.tableName}`, connectionId: data.connectionId, 
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
    id, type: 'query', title: `查询${nextQueryIndex.value++}`,
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
  const editorRef = editorRefs[tab.id]; 
  const sql = editorRef && typeof editorRef.getSelectionOrAll === 'function' 
    ? editorRef.getSelectionOrAll().trim() 
    : (tab.sql || '').trim();
  
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

// ================= 【新增】：处理 AI 慢查询诊断逻辑 =================
const handleAiDiagnosis = async (tab) => {
  const editorRef = editorRefs[tab.id]; 
  const sql = editorRef && typeof editorRef.getSelectionOrAll === 'function'
    ? editorRef.getSelectionOrAll().trim() 
    : (tab.sql || '').trim();
  
  if (!sql) return ElMessage.warning('请输入或选中要诊断的 SQL 语句');
  if (!tab.connectionId) return ElMessage.warning('请选择数据库连接');

  showAiAnalysisDialog.value = true;
  analysisLoading.value = true;
  aiAnalysisResult.value = '';

  try {
    // 1. 获取执行计划 (EXPLAIN)
    const explainSql = `EXPLAIN ${sql}`;
    const explainRes = await window.electronAPI.executeSql({ 
      connectionId: tab.connectionId, 
      schema: tab.schema, 
      sql: explainSql 
    });
    
    if (!explainRes.success) throw new Error('获取执行计划失败: ' + explainRes.error);
    const explainPlan = JSON.stringify(explainRes.data.rows, null, 2);

    // 2. 获取表结构
    const tableMatch = sql.match(/FROM\s+["`]?(\w+)["`]?/i);
    let columns = [];
    if (tableMatch) {
      const colRes = await window.electronAPI.getTableColumns({
        connectionId: tab.connectionId,
        schema: tab.schema,
        table: tableMatch[1]
      });
      if (colRes.success) columns = colRes.data;
    }

    // 3. 调用 AI 诊断接口
    const res = await window.electronAPI.analyzeQuery({
      sql,
      explainPlan,
      columns
    });

    if (res.success) {
      aiAnalysisResult.value = res.analysis;
    } else {
      throw new Error(res.error);
    }
  } catch (err) {
    if (err.message.includes('未配置') || err.message.includes('API key')) {
      ElMessageBox.confirm('您尚未配置 AI API Key。是否前往配置？', '提示', { type: 'warning' })
        .then(() => openAiConfigDialog());
      showAiAnalysisDialog.value = false;
    } else {
      ElMessage.error('诊断失败: ' + err.message);
      showAiAnalysisDialog.value = false;
    }
  } finally {
    analysisLoading.value = false;
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

// ================= AI 助手逻辑 =================
const showAiConfigDialog = ref(false);
const aiConfig = reactive({ provider: 'openai', apiKey: '', baseUrl: '', model: '' });

const openAiConfigDialog = async () => {
  try {
    if (window.electronAPI && window.electronAPI.getAiConfig) {
      const config = await window.electronAPI.getAiConfig();
      if (config) Object.assign(aiConfig, config);
    }
    showAiConfigDialog.value = true;
  } catch (err) { ElMessage.error("获取 AI 配置失败"); }
};

const saveAiConfig = async () => {
  if (!aiConfig.apiKey) return ElMessage.warning('API Key 不能为空！');
  try {
    const res = await window.electronAPI.saveAiConfig(JSON.parse(JSON.stringify(aiConfig)));
    if (res.success) {
      ElMessage.success('AI 配置保存成功！');
      showAiConfigDialog.value = false;
    } else { ElMessage.error('保存失败: ' + res.error); }
  } catch (err) { ElMessage.error(err.message); }
};

const generateSqlWithAi = async () => {
  if (!aiPromptInput.value.trim()) return;
  const currentTab = openTabs.value.find(t => t.id === activeTab.value);
  if (!currentTab || currentTab.type !== 'query') {
    return ElMessage.warning('请先在左侧打开或新建一个查询窗口');
  }
  
  const userText = aiPromptInput.value;
  aiChatHistory.value.push({ role: 'user', content: userText });
  aiPromptInput.value = '';
  aiGenerating.value = true;
  
  try {
    const res = await window.electronAPI.generateSql({
      prompt: userText,
      connectionId: currentTab.connectionId,
      schema: currentTab.schema
    });

    if (res.success && res.sql) {
      aiChatHistory.value.push({ 
        role: 'ai', 
        content: `这是为您生成的 SQL 语句：\n\n${res.sql}`,
        sql: res.sql 
      });
      // 滚动到底部
      nextTick(() => {
        const container = document.querySelector('.custom-scrollbar');
        if(container) container.scrollTop = container.scrollHeight;
      });
    } else {
      throw new Error(res.error || '大模型返回为空');
    }
  } catch (err) {
    if (err.message.includes('未配置') || err.message.includes('API key')) {
      ElMessageBox.confirm('您尚未配置 AI API Key，或者 Key 无效。是否立即前往配置？', '提示', { type: 'warning' })
        .then(() => openAiConfigDialog());
    } else {
      aiChatHistory.value.push({ role: 'ai', content: `生成失败: ${err.message}` });
    }
  } finally {
    aiGenerating.value = false;
  }
};

const insertSqlToEditor = (sqlToInsert) => {
  const currentTab = openTabs.value.find(t => t.id === activeTab.value);
  if (currentTab) {
    const editorRef = editorRefs[currentTab.id];
    if (editorRef && typeof editorRef.setSql === 'function') {
      const currentSql = typeof editorRef.getSelectionOrAll === 'function' ? editorRef.getSelectionOrAll() : '';
      editorRef.setSql(currentSql + `\n-- AI 自动生成:\n${sqlToInsert}\n`);
    } else {
      currentTab.sql += `\n-- AI 自动生成:\n${sqlToInsert}\n`;
    }
    ElMessage.success('已插入到编辑器');
  }
};
</script>

<style scoped>
/* 覆盖 Element Plus 树形控件样式，使其更现代 */
:deep(.modern-tree) {
  background: transparent;
  --el-tree-node-hover-bg-color: #f1f5f9;
}
:deep(.modern-tree .el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  margin-bottom: 2px;
}

/* 覆盖 Tabs 样式 */
:deep(.modern-tabs > .el-tabs__header) {
  margin: 0;
  border-bottom: 1px solid #e2e8f0;
  background-color: #f8fafc;
}
:deep(.modern-tabs > .el-tabs__header .el-tabs__nav) {
  border: none !important;
}
:deep(.modern-tabs > .el-tabs__header .el-tabs__item) {
  border: 1px solid transparent !important;
  border-right: 1px solid #e2e8f0 !important;
  background-color: #f1f5f9;
  color: #64748b;
  font-size: 13px;
  height: 36px;
  line-height: 36px;
}
:deep(.modern-tabs > .el-tabs__header .el-tabs__item.is-active) {
  background-color: #ffffff;
  border-top: 2px solid #3b82f6 !important;
  color: #0f172a;
  border-bottom-color: #ffffff !important;
}
:deep(.modern-tabs > .el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

/* 拖拽条 */
.resizer { 
  height: 4px; 
  background-color: #f1f5f9; 
  cursor: row-resize; 
  border-top: 1px solid #e2e8f0; 
  border-bottom: 1px solid #e2e8f0; 
  transition: background 0.2s;
}
.resizer:hover, .resizer:active { 
  background-color: #3b82f6; 
}

/* 滚动条美化 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background-color: transparent;
}
</style>