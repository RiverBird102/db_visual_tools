<template>
  <div class="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
    
    <aside class="w-72 flex flex-col bg-white border-r border-slate-200 shadow-sm z-10 shrink-0">
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
          @node-contextmenu="handleContextMenu"
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
              <span class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop v-if="data.type === 'schema'">
                <button @click.stop="openDesignTab({ connectionId: data.connectionId, schemaName: data.schemaName, tableName: '' })" class="text-green-500 hover:text-green-700 p-1" title="可视化新建表"><Plus :size="14" /></button>
              </span>
              <span class="hidden group-hover:flex items-center gap-1 shrink-0" @click.stop v-if="data.type === 'table'">
                <button @click.stop="openDesignTab(data)" class="text-blue-500 hover:text-blue-700 p-1" title="设计表结构"><Edit3 :size="14" /></button>
              </span>
            </div>
          </template>
        </el-tree>
        <div 
          v-show="contextMenu.visible" 
          class="fixed bg-white border border-slate-200 shadow-xl rounded-lg py-1 z-[9999] text-sm min-w-[140px] transition-opacity"
          :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
          @click.stop
        >
          <template v-if="contextMenu.nodeData?.type === 'connection'">
            <div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-slate-700 flex items-center gap-2" @click="handleContextAction('editConn')"><Edit3 :size="14"/> 编辑连接</div>
            <div class="px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center gap-2" @click="handleContextAction('refreshConn')"><RefreshCw :size="14"/> 刷新目录</div>
            <div class="h-px bg-slate-100 my-1"></div>
            <div class="px-4 py-2 hover:bg-red-50 cursor-pointer text-red-600 flex items-center gap-2" @click="handleContextAction('deleteConn')"><Trash2 :size="14"/> 删除连接</div>
          </template>
          
          <template v-else-if="contextMenu.nodeData?.type === 'schema'">
            <div class="px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center gap-2" @click="handleContextAction('refreshSchema')"><RefreshCw :size="14"/> 刷新数据库</div>
            <div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-blue-600 flex items-center gap-2 font-medium" @click="handleContextAction('showER')">
              <Share2 :size="14"/> 查看数据库拓扑 (ER)
            </div>
            <div class="h-px bg-slate-100 my-1"></div>
            <div class="px-4 py-2 hover:bg-green-50 cursor-pointer text-green-600 flex items-center gap-2 font-medium" @click="handleContextAction('newTable')"><Plus :size="14"/> 新建表结构</div>
          </template>

          <template v-else-if="contextMenu.nodeData?.type === 'table'">
            <div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-slate-700 flex items-center gap-2" @click="handleContextAction('openTable')"><Database :size="14"/> 打开表 (数据)</div>
            <div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-blue-600 flex items-center gap-2 font-medium" @click="handleContextAction('designTable')"><Edit3 :size="14"/> 设计表结构</div>
            <div class="h-px bg-slate-100 my-1"></div>
            <div class="px-4 py-2 hover:bg-amber-50 cursor-pointer text-amber-600 flex items-center gap-2" @click="handleContextAction('truncateTable')"><Trash2 :size="14"/> 清空表 (Truncate)</div>
            <div class="px-4 py-2 hover:bg-red-50 cursor-pointer text-red-600 flex items-center gap-2 font-medium" @click="handleContextAction('dropTable')"><Trash2 :size="14"/> 删除表 (Drop)</div>
          </template>
        </div>
      </div>

      <div class="p-3 border-t border-slate-200 bg-slate-50">
        <button @click="openAiConfigDialog" class="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors w-full">
          <Settings :size="14" /> AI 助手高级配置
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
                
                <el-button type="success" size="small" @click="openMockDataDialog(tab)" class="shadow-sm bg-emerald-500 hover:bg-emerald-600 border-none">
                  <span class="flex items-center gap-1"><Dna :size="14"/> AI 智能造数</span>
                </el-button>

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
                  <span class="flex items-center gap-1"><Activity :size="12"/> AI 慢查询诊断</span>
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
                      <ChevronDown :size="14"/> 收起
                    </button>
                  </div>
                  
                  <div class="flex-1 overflow-hidden">
                    <div v-show="tab.bottomTab === 'result'" class="h-full">
                      <data-viewer v-if="tab.result && (tab.result.isQuery || tab.result.rows)" :data="tab.result.rows" :columns="tab.result.fields" :loading="tab.loading"></data-viewer>
                      <div v-else class="h-full flex items-center justify-center text-slate-400 text-sm">等待数据返回...</div>
                    </div>

                    <div v-show="tab.bottomTab === 'message'" class="h-full p-4 overflow-y-auto font-mono text-sm bg-slate-900 text-slate-300">
                      <div v-if="tab.error" class="text-red-400">❌ 执行出错: {{ tab.error }}</div>
                      <div v-else-if="tab.result && tab.result.isQuery === false" class="text-green-400">
                        ✅ 操作成功 <span v-if="tab.result.affectedRows !== undefined"> (影响行数: {{ tab.result.affectedRows }})</span>
                      </div>
                      <div v-else-if="tab.result && tab.result.isQuery" class="text-green-400">✅ 查询执行成功。</div>
                    </div>

                    <div v-show="tab.bottomTab === 'history'" class="h-full">
                      <el-table :data="tab.history" size="small" border height="100%">
                        <el-table-column prop="time" label="时间" width="160"></el-table-column>
                        <el-table-column prop="sql" label="SQL内容" show-overflow-tooltip></el-table-column>
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
            </div>

            <div v-else-if="tab.type === 'insight'" class="flex flex-col h-full p-6 bg-slate-100 overflow-y-auto custom-scrollbar">
              <div class="max-w-6xl mx-auto w-full">
                <div class="flex items-center justify-between mb-8">
                  <div class="flex items-center gap-3">
                    <div class="p-3 bg-blue-600 rounded-xl shadow-lg text-white">
                      <BarChart2 :size="24" />
                    </div>
                    <div>
                      <h2 class="text-xl font-bold text-slate-800">AI 智能数据洞察报告</h2>
                      <p class="text-xs text-slate-500 mt-1">基于大模型的自动化可视化分析与商业决策支持</p>
                    </div>
                  </div>
                  <el-button @click="removeTab(tab.id)" plain size="small">关闭报告</el-button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div class="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <div class="flex items-center justify-between mb-4 shrink-0">
                      <span class="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <PieChart :size="16" class="text-blue-500" /> 交互式数据图表
                      </span>
                    </div>
                    <div :id="'chart-' + tab.id" class="w-full flex-1 min-h-[400px]"></div>
                  </div>

                  <div class="flex flex-col gap-6">
                    <div class="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden flex-1 flex flex-col max-h-[500px]">
                      <Sparkles class="absolute top-[-20px] right-[-20px] opacity-10 w-40 h-40 pointer-events-none" />
                      <h3 class="text-lg font-bold mb-4 flex items-center gap-2 shrink-0">
                        <Bot :size="22" /> 深度分析建议
                      </h3>
                      <div class="text-sm leading-relaxed opacity-95 whitespace-pre-wrap font-medium overflow-y-auto custom-scrollbar flex-1 relative z-10 pr-2">
                        {{ tab.analysis }}
                      </div>
                    </div>
                    
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">洞察数据概览</h4>
                      <div class="flex items-center justify-between">
                        <span class="text-sm text-slate-600">样本取样量</span>
                        <span class="text-lg font-bold text-blue-600">{{ tab.originalRows.length }} 行</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="tab.type === 'design'" class="flex flex-col h-full bg-slate-50">
              <table-designer 
                :connection-id="tab.connectionId" 
                :schema="tab.schema" 
                :table="tab.table"
                @sqlGenerated="(sql) => handleGeneratedSql(sql)"
                @saveSuccess="handleDesignerSaveSuccess(tab)" 
              ></table-designer>
            </div>
            <div v-else-if="tab.type === 'er'" class="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
              <ERDiagram :connection-id="tab.connectionId" :schema="tab.schema"></ERDiagram>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </main>

    <aside class="w-80 flex flex-col bg-slate-50 border-l border-slate-200 shadow-sm z-10 shrink-0">
      <div class="flex border-b border-slate-200 bg-white">
        <button v-for="mode in ['chat', 'insight']" :key="mode"
                @click="aiPanelTab = mode"
                :class="aiPanelTab === mode ? 'text-blue-600 border-b-2 border-blue-600 font-bold bg-blue-50/30' : 'text-slate-500 hover:bg-slate-50'"
                class="flex-1 py-4 text-sm transition-all flex items-center justify-center gap-2 outline-none">
          <Sparkles v-if="mode === 'chat'" :size="16" /> 
          <BarChart2 v-else :size="16" />
          {{ mode === 'chat' ? '智能生成' : '数据洞察' }}
        </button>
      </div>

      <div v-show="aiPanelTab === 'chat'" class="flex-1 flex flex-col p-4 overflow-hidden">
        
        <div class="flex justify-center mb-3 shrink-0">
          <el-radio-group v-model="chatMode" size="small">
            <el-radio-button label="sql">代码生成 (Text2SQL)</el-radio-button>
            <el-radio-button label="qa">DBA 问答专家</el-radio-button>
          </el-radio-group>
        </div>

        <div class="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar text-sm" id="chat-container">
          <div v-for="(msg, i) in currentChatHistory" :key="i" 
               :class="msg.role === 'user' ? 'ml-8 items-end' : 'mr-8 items-start'"
               class="flex flex-col">
            <div :class="msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'"
                 class="p-3 rounded-2xl shadow-sm leading-relaxed whitespace-pre-wrap">
              {{ msg.content }}
            </div>
            <button v-if="msg.role === 'ai' && msg.sql" @click="insertSqlToEditor(msg.sql)" class="mt-2 text-xs text-blue-600 font-bold flex items-center gap-1 px-1">
              <ArrowLeftToLine :size="12"/> 插入到当前编辑器
            </button>
          </div>
          <div v-if="aiGenerating" class="flex gap-1 ml-2 mt-4">
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
          </div>
        </div>

        <div class="relative shrink-0">
          <textarea v-model="aiPromptInput" 
                    :placeholder="chatMode === 'sql' ? '描述您的 SQL 查询需求...' : '向 DBA 专家提问任何数据库相关知识...'" 
                    @keydown.ctrl.enter="generateSqlWithAi"
                    class="w-full h-24 bg-white border border-slate-300 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm resize-none transition-all"></textarea>
          <button @click="generateSqlWithAi" :disabled="aiGenerating || !aiPromptInput.trim()"
                  class="absolute bottom-3 right-3 text-white bg-blue-600 p-2 rounded-xl hover:bg-blue-700 disabled:bg-slate-300">
            <Send :size="16" />
          </button>
        </div>
      </div>

      <div v-show="aiPanelTab === 'insight'" class="flex-1 p-4 flex flex-col overflow-y-auto custom-scrollbar bg-slate-50">
        <div class="bg-white border border-blue-100 p-4 rounded-xl mb-4 shadow-sm shrink-0">
          <div class="flex items-center gap-2 text-blue-700 font-bold mb-1 text-sm">
            <PieChart :size="16"/> 对话式自助 BI
          </div>
          <p class="text-xs text-slate-500 leading-relaxed">
            输入你想看的数据指标（如：各部门人数对比），选择图表类型，AI 将全自动提取数据并生成看板。
          </p>
        </div>

        <div class="space-y-5 flex-1">
          <div class="flex flex-col">
            <label class="block text-xs font-bold text-slate-700 mb-2">1. 你的分析目标是什么？</label>
            <textarea 
              v-model="smartInsightPrompt" 
              placeholder="例如：统计每个部门的平均薪资，或者查询 SYS_USERS 表里各地区的人数分布..." 
              class="w-full h-24 bg-white border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm resize-none"
            ></textarea>
            
            <div class="flex flex-wrap gap-2 mt-2">
              <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded cursor-pointer hover:bg-blue-100" @click="smartInsightPrompt = '统计各部门的员工总人数'">各部门人数</span>
              <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded cursor-pointer hover:bg-blue-100" @click="smartInsightPrompt = '对比各部门的平均薪资'">部门平均薪资</span>
            </div>
          </div>

          <div class="flex flex-col">
            <label class="block text-xs font-bold text-slate-700 mb-2">2. 图表展现形式：</label>
            <el-radio-group v-model="smartChartType" class="flex flex-col gap-2 w-full">
              <el-radio label="auto" class="w-full mr-0 border border-slate-200 rounded-lg p-2 bg-white data-[checked]:border-blue-500">
                <span class="font-bold text-blue-600 flex items-center gap-1"><Sparkles :size="14"/> AI 智能推荐最佳图表</span>
              </el-radio>
              <div class="grid grid-cols-2 gap-2 w-full pl-6">
                <el-radio label="bar" class="mr-0"><BarChart2 :size="14" class="inline mr-1"/>柱状图</el-radio>
                <el-radio label="pie" class="mr-0"><PieChart :size="14" class="inline mr-1"/>饼图</el-radio>
                <el-radio label="line" class="mr-0"><Activity :size="14" class="inline mr-1"/>折线图</el-radio>
                <el-radio label="scatter" class="mr-0">散点图</el-radio>
              </div>
            </el-radio-group>
          </div>
        </div>

        <div class="mt-4 shrink-0">
          <el-button 
            type="primary" 
            class="w-full h-11 rounded-xl bg-blue-600 border-none shadow-md hover:bg-blue-700 transition-all text-sm font-bold" 
            @click="executeSmartInsightFlow" 
            :loading="insightLoading"
          >
            <Bot :size="16" class="mr-1"/> 
            {{ insightLoading ? 'AI 正在执行提取与渲染...' : '生成智能看板' }}
          </el-button>
        </div>
      </div>
    </aside>

    <el-dialog v-model="showAiAnalysisDialog" title="🔬 AI 慢查询诊断报告" width="800px">
      <div v-loading="analysisLoading" class="min-h-[300px] max-h-[60vh] overflow-y-auto p-2">
        <div v-if="aiAnalysisResult" class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 bg-slate-50 p-5 rounded-xl border border-slate-200">{{ aiAnalysisResult }}</div>
      </div>
    </el-dialog>

    <el-dialog v-model="showMockDialog" title="🧬 AI 智能造数引擎" width="520px">
      <div v-loading="mockGenerating" element-loading-text="大模型正在推导字段含义并生成数据，请稍候...">
        <el-alert title="一键入库" type="info" description="AI 会自动根据表结构生成高度逼真的测试数据并直接执行插入。" show-icon class="mb-5" :closable="false" />
        <el-form label-position="top">
          <el-form-item label="生成数据量">
            <el-input-number v-model="mockForm.count" :min="1" :max="100" class="w-full" />
          </el-form-item>
          <el-form-item label="特定约束要求 (可选)">
            <el-input v-model="mockForm.instruction" type="textarea" :rows="3" placeholder="例如：生成北京地区的手机号，姓名要真实，金额在100-500之间..." />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="showMockDialog = false" :disabled="mockGenerating">取消</el-button>
        <el-button type="success" @click="executeMockDataGeneration" :loading="mockGenerating" class="bg-emerald-600 border-none">生成并一键入库</el-button>
      </template>
    </el-dialog>

    <el-dialog :title="isEditMode ? '编辑数据库连接' : '新建数据库连接'" v-model="showConnectDialog" width="600px" destroy-on-close>
      <db-connect :initial-data="currentEditData" @save="saveConnection" @test="testConnection" @cancel="showConnectDialog = false"></db-connect>
    </el-dialog>

    <el-dialog title="⚙️ AI 助手高级配置" v-model="showAiConfigDialog" width="500px">
      <el-form :model="aiConfig" label-width="100px">
        <el-form-item label="服务商">
          <el-select v-model="aiConfig.provider" class="w-full">
            <el-option label="OpenAI / DeepSeek / 通义" value="openai" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="aiConfig.apiKey" type="password" show-password />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="aiConfig.baseUrl" placeholder="https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="aiConfig.model" placeholder="gpt-3.5-turbo" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAiConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveAiConfig">保存配置</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, computed, onUnmounted, onErrorCaptured } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import * as echarts from 'echarts'; // 【核心】：引入 ECharts

// 组件与图标引入
import DbConnect from './components/DbConnect.vue';
import SqlEditor from './components/SqlEditor.vue';
import DataViewer from './components/DataViewer.vue';
import TableDesigner from './components/TableDesigner.vue';
import ERDiagram from './components/ERDiagram.vue';
import { 
  Plus, RefreshCw, Edit3, Trash2, Zap, Database, Table as TableIcon,
  Play, Settings, Sparkles, Bot, User, Send, ChevronDown, 
  ArrowLeftToLine, FileCode2, Activity, Dna, BarChart2, PieChart, Share2
} from 'lucide-vue-next';

// ================= UI 基础状态 =================
const showConnectDialog = ref(false);
const isEditMode = ref(false);
const currentEditData = ref(null);
const activeConnection = ref(null);
const activeSchema = ref('');
const activeTable = ref('');
const openTabs = ref([]); 
const activeTab = ref(''); 
const treeRenderKey = ref(0); 
const allConnections = ref([]); 
const loading = ref(false);

// ================= AI 面板状态 =================
const aiPanelTab = ref('chat');
const aiChatHistory = ref([]);
const aiPromptInput = ref('');
const aiGenerating = ref(false);
const chatMode = ref('sql'); // 【新增】：当前聊天模式，默认为 'sql'，可选 'qa'

// 【新增】：将原来的单一数组拆分为两个独立的数组
const sqlChatHistory = ref([]);
const qaChatHistory = ref([]);

// 【新增】：使用 computed 动态返回当前激活的聊天记录
const currentChatHistory = computed(() => {
  return chatMode.value === 'sql' ? sqlChatHistory.value : qaChatHistory.value;
});

// AI 诊断状态
const showAiAnalysisDialog = ref(false);
const analysisLoading = ref(false);
const aiAnalysisResult = ref('');

// AI 造数状态
const showMockDialog = ref(false);
const mockGenerating = ref(false);
const mockTargetTab = ref(null);
const mockForm = reactive({ count: 10, instruction: '' });

// AI 数据洞察状态
const insightLoading = ref(false);

// AI 配置状态
const showAiConfigDialog = ref(false);
const aiConfig = reactive({ provider: 'openai', apiKey: '', baseUrl: '', model: '' });

// Editor 实例管理
const editorRefs = {};
const setEditorRef = (el, id) => {
  if (el) editorRefs[id] = el;
  else delete editorRefs[id];
};

const treeProps = reactive({ label: 'label', children: 'children', isLeaf: 'isLeaf' });
const getConnectionById = (id) => allConnections.value.find(c => c.id === id);

// ================= 新增：自助式 BI 状态与逻辑 =================
const smartInsightPrompt = ref('');
const smartChartType = ref('auto'); // 默认让 AI 推荐

onMounted(() => {
  loadConnections();
});

// ================= 1. 数据库树形与连接逻辑 =================

const loadConnections = async () => { treeRenderKey.value += 1; };

const loadTreeNode = async (node, resolve) => {
  if (node.level === 0) {
    try {
      const res = await window.electronAPI.getDbConnections();
      if (res.success) {
        allConnections.value = res.data;
        return resolve(res.data.map(conn => ({ ...conn, label: conn.name, type: 'connection', treeId: `conn_${conn.id}`, isLeaf: false })));
      }
    } catch(e) { return resolve([]); }
  }
  if (node.level === 1) {
    try {
      const res = await window.electronAPI.listSchemas({ connectionId: node.data.id });
      if (res.success) return resolve(res.data.map(s => ({ label: s, type: 'schema', connectionId: node.data.id, schemaName: s, treeId: `schema_${node.data.id}_${s}`, isLeaf: false })));
    } catch(e) { return resolve([]); }
  }
  if (node.level === 2) {
    try {
      const res = await window.electronAPI.listTables({ connectionId: node.data.connectionId, schema: node.data.schemaName });
      if (res.success) {
        return resolve(res.data.map(t => {
          const name = typeof t === 'object' ? (t.tableName || t.name) : t;
          return { label: name, type: 'table', connectionId: node.data.connectionId, schemaName: node.data.schemaName, tableName: name, treeId: `table_${node.data.connectionId}_${node.data.schemaName}_${name}`, isLeaf: true };
        }));
      }
    } catch(e) { return resolve([]); }
  }
  return resolve([]);
};

const handleNodeClick = (data) => {
  if (data.connectionId || data.id) activeConnection.value = getConnectionById(data.connectionId || data.id);
  if (data.type === 'schema') {
    activeSchema.value = data.schemaName;
    activeTable.value = '';
  } else if (data.type === 'table') {
    activeSchema.value = data.schemaName;
    activeTable.value = data.tableName;
    const id = `table_${data.connectionId}_${data.schemaName}_${data.tableName}`;
    if (!openTabs.value.find(t => t.id === id)) {
      const tab = { id, type: 'table', title: data.tableName, connectionId: data.connectionId, schema: data.schemaName, table: data.tableName, loading: true, result: { rows: [], fields: [] }, currentPage: 1, pageSize: 50, total: 0 };
      openTabs.value.push(tab);
      loadTableData(tab);
    }
    activeTab.value = id;
  }
};

const openCreateDialog = () => { isEditMode.value = false; currentEditData.value = null; showConnectDialog.value = true; };
const openEditDialog = (data) => { isEditMode.value = true; currentEditData.value = { ...data }; showConnectDialog.value = true; };

const saveConnection = async (connection) => {
  try {
    let result;
    if (isEditMode.value && currentEditData.value) {
      connection.id = currentEditData.value.id;
      if (window.electronAPI.disconnectDb) await window.electronAPI.disconnectDb(connection.id);
      result = await window.electronAPI.updateDbConnection(JSON.parse(JSON.stringify(connection)));
    } else {
      connection.id = Date.now().toString();
      result = await window.electronAPI.saveDbConnection(JSON.parse(JSON.stringify(connection)));
    }
    if (!result.success) throw new Error(result.error);
    ElMessage.success(isEditMode.value ? '修改成功' : '保存成功');
    showConnectDialog.value = false;
    loadConnections(); 
  } catch (err) { ElMessage.error(err.message); }
};

const deleteConnection = async (data) => {
  try {
    await ElMessageBox.confirm(`确定删除 "${data.name}" 吗？`, '警告', { type: 'warning' });
    const res = await window.electronAPI.deleteDbConnection(data.id);
    if (res.success) {
      ElMessage.success('删除成功');
      openTabs.value = openTabs.value.filter(t => t.connectionId !== data.id);
      if (!openTabs.value.find(t => t.id === activeTab.value)) activeTab.value = openTabs.value[0]?.id || '';
      loadConnections();
    } else throw new Error(res.error);
  } catch(e) { if(e !== 'cancel') ElMessage.error(e.message); }
};

const testConnection = async (config) => {
  loading.value = true;
  try {
    const res = await window.electronAPI.testDbConnection(JSON.parse(JSON.stringify(config)));
    if (res.success) ElMessage.success('连接测试成功');
    else throw new Error(res.error);
  } catch(e) { ElMessage.error(`测试失败: ${e.message}`); } finally { loading.value = false; }
};


// 👇 1. 打开设计器 Tab 的逻辑
const openDesignTab = (data) => {
  const id = `design_${data.connectionId}_${data.schemaName}_${data.tableName || 'new'}`;
  if (!openTabs.value.find(t => t.id === id)) {
    openTabs.value.push({ 
      id, 
      type: 'design', 
      title: data.tableName ? `设计: ${data.tableName}` : '新建表', 
      connectionId: data.connectionId, 
      schema: data.schemaName, 
      table: data.tableName || ''
    });
  }
  activeTab.value = id;
};

// 👇 2. 接收设计器生成的 SQL，并自动打开一个查询窗口粘贴进去
const handleGeneratedSql = (sql) => {
  addQueryTab(); // 自动新建一个查询 Tab
  setTimeout(() => {
    // 找到刚刚新建的 Tab
    const currentTab = openTabs.value.find(t => t.id === activeTab.value);
    if (currentTab) {
      currentTab.sql = sql; // 把生成的 DDL 语句自动填进去
      ElMessage.success('建表 SQL 已生成，请确认并执行！');
    }
  }, 100);
};


// ================= 右键上下文菜单逻辑 =================
const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeData: null });

// 监听树节点的右键事件
const handleContextMenu = (event, data, node, component) => {
  event.preventDefault(); // 阻止浏览器默认右键菜单
  contextMenu.visible = true;
  // 计算菜单弹出的坐标
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.nodeData = data;
};

// 点击空白处关闭菜单
const closeContextMenu = () => { contextMenu.visible = false; };

onMounted(() => {
  document.addEventListener('click', closeContextMenu); // 全局监听点击
});
onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu);
});

// 分发右键菜单的具体点击指令
const handleContextAction = async (action) => {
  const data = contextMenu.nodeData;
  closeContextMenu(); // 执行操作前先隐藏菜单
  
  switch (action) {
    case 'editConn': openEditDialog(data); break;
    case 'deleteConn': deleteConnection(data); break;
    case 'refreshConn': loadConnections(); break;
    case 'refreshSchema': loadConnections(); break; // 这里简化为重载整棵树，你后续可以优化为单节点重载
    case 'newTable': openDesignTab({ connectionId: data.connectionId, schemaName: data.schemaName, tableName: '' }); break;
    case 'openTable': handleNodeClick(data); break;
    case 'designTable': openDesignTab(data); break;
    case 'truncateTable': doTruncateTable(data); break;
    case 'dropTable': doDropTable(data); break;
    case 'showER': openERTab(data); break;
  }
};

const openERTab = (data) => {
  const id = `er_${data.connectionId}_${data.schemaName}`;
  if (!openTabs.value.find(t => t.id === id)) {
    openTabs.value.push({
      id,
      type: 'er',
      title: `ER图: ${data.schemaName}`,
      connectionId: data.connectionId,
      schema: data.schemaName
    });
  }
  activeTab.value = id;
};

// [核心工作量]：高危指令的安全执行（带防误触拦截与多方言适配）
const doTruncateTable = async (data) => {
  try {
    await ElMessageBox.confirm(`此操作将通过 TRUNCATE 指令瞬间清空表 "${data.tableName}" 的所有数据，且不可回滚！确定继续？`, '⚠️ 高危操作确认', { type: 'warning', confirmButtonText: '确定清空', confirmButtonClass: 'el-button--danger' });
    
    const conn = getConnectionById(data.connectionId);
    // 处理不同数据库环境的引号转义（应对国产库与MySQL的差异）
    const safeSchema = conn.dbType === 'mysql' ? `\`${data.schemaName}\`` : `"${data.schemaName}"`;
    const safeTable = conn.dbType === 'mysql' ? `\`${data.tableName}\`` : `"${data.tableName}"`;
    
    const res = await window.electronAPI.executeSql({ 
      connectionId: data.connectionId, 
      schema: data.schemaName, 
      sql: `TRUNCATE TABLE ${safeSchema}.${safeTable}` 
    });
    
    if (res.success) ElMessage.success(`表 ${data.tableName} 数据已清空！`);
    else throw new Error(res.error);
    
    // 如果当前表正好在 Tabs 里打开了，自动刷新它的数据展示
    const openedTab = openTabs.value.find(t => t.type === 'table' && t.connectionId === data.connectionId && t.table === data.tableName);
    if (openedTab) loadTableData(openedTab);
    
  } catch(e) { 
    if(e !== 'cancel') ElMessage.error(`清空失败: ${e.message}`); 
  }
};

const doDropTable = async (data) => {
  try {
    const userInput = await ElMessageBox.prompt(`要彻底删除表结构及数据，请输入表名以确认：${data.tableName}`, '⚠️ 危险：删除表', {
      confirmButtonText: '确定删除',
      confirmButtonClass: 'el-button--danger',
      inputValidator: (value) => value === data.tableName ? true : '表名输入不匹配',
      inputErrorMessage: '表名输入不匹配'
    });
    
    if (userInput.action === 'confirm') {
      const conn = getConnectionById(data.connectionId);
      const safeSchema = conn.dbType === 'mysql' ? `\`${data.schemaName}\`` : `"${data.schemaName}"`;
      const safeTable = conn.dbType === 'mysql' ? `\`${data.tableName}\`` : `"${data.tableName}"`;
      
      const res = await window.electronAPI.executeSql({
        connectionId: data.connectionId, schema: data.schemaName, sql: `DROP TABLE ${safeSchema}.${safeTable}`
      });
      if (!res.success) throw new Error(res.error);
      ElMessage.success(`表 ${data.tableName} 已彻底删除！`);
      
      // 关闭相关的 Tab，并刷新左侧树
      removeTab(`table_${data.connectionId}_${data.schemaName}_${data.tableName}`);
      removeTab(`design_${data.connectionId}_${data.schemaName}_${data.tableName}`);
      loadConnections(); 
    }
  } catch(e) {
    if(e !== 'cancel') ElMessage.error(`删除失败: ${e.message}`);
  }
};
// =======================================================

// ================= 2. 数据查询与操作逻辑 =================

const loadTableData = async (tab) => {
  tab.loading = true;
  tab.error = '';
  try {
    const conn = getConnectionById(tab.connectionId);
    
    // 🌟 新增：强制拉取最新的列定义（防止 DDL 变更后，旧缓存导致列头错乱或数据无法编辑）
    let latestFields = [];
    try {
      const colRes = await window.electronAPI.getTableColumns({ 
        connectionId: tab.connectionId, 
        schema: tab.schema, 
        table: tab.table 
      });
      if (colRes.success) {
        // 提取最新的字段名数组
        latestFields = colRes.data.map(c => c.name);
      }
    } catch (err) {
      console.warn("拉取最新表结构失败，将降级使用查询结果自带的 fields");
    }

    const offset = (tab.currentPage - 1) * tab.pageSize;
    const sql = conn.dbType === 'mysql'
      ? `SELECT * FROM \`${tab.schema}\`.\`${tab.table}\` LIMIT ${tab.pageSize} OFFSET ${offset}`
      : `SELECT * FROM "${tab.schema}"."${tab.table}" LIMIT ${tab.pageSize} OFFSET ${offset}`;
    
    const result = await window.electronAPI.executeSql({ connectionId: tab.connectionId, sql });
    
    if (result.success) {
      // 🌟 核心修改：组装 result，如果成功拉到了最新表结构，就用最新的 fields 覆盖
      tab.result = {
        rows: result.data?.rows || [],
        fields: latestFields.length > 0 ? latestFields : (result.data?.fields || [])
      };
    } else {
      tab.error = result.error;
    }

    const countSql = conn.dbType === 'mysql'
      ? `SELECT COUNT(*) as total FROM \`${tab.schema}\`.\`${tab.table}\``
      : `SELECT COUNT(*) as total FROM "${tab.schema}"."${tab.table}"`;
      
    window.electronAPI.executeSql({ connectionId: tab.connectionId, sql: countSql }).then(cRes => {
      if (cRes.success && cRes.data.rows.length > 0) {
        tab.total = Number(cRes.data.rows[0].total || cRes.data.rows[0].TOTAL || Object.values(cRes.data.rows[0])[0] || 0);
      }
    }).catch(()=>{});

  } catch (e) { 
    tab.error = e.message; 
  } finally { 
    tab.loading = false; 
  }
};

const handleTableEdits = async (tab, payload) => {
  tab.loading = true;
  try {
    const conn = getConnectionById(tab.connectionId);
    const colRes = await window.electronAPI.getTableColumns({ connectionId: tab.connectionId, schema: tab.schema, table: tab.table });
    if (!colRes.success) throw new Error(colRes.error);
    
    // 获取主键，用于精准定位修改和删除的行
    const pkCols = colRes.data.filter(c => c.primaryKey).map(c => c.name);
    if (pkCols.length === 0) throw new Error(`表没有主键，为了数据安全禁止可视化编辑。`);

    // 解析 DataViewer 传来的综合编辑对象 (做一下兼容，如果还是旧版数组格式就默认全是 updates)
    const edits = Array.isArray(payload) ? payload : payload.updates || [];
    const inserts = payload.inserts || [];
    const deletes = payload.deletes || [];

    // 处理表名的方言转义
    const safeSchema = conn.dbType === 'mysql' ? `\`${tab.schema}\`` : `"${tab.schema}"`;
    const safeTable = conn.dbType === 'mysql' ? `\`${tab.table}\`` : `"${tab.table}"`;
    const tableName = `${safeSchema}.${safeTable}`;

    // ================= 1. 执行删除 DELETE =================
    for (const row of deletes) {
      const whereClauses = pkCols.map(pk => {
        const safePk = conn.dbType === 'mysql' ? `\`${pk}\`` : `"${pk}"`;
        return `${safePk} = '${String(row[pk]).replace(/'/g, "''")}'`;
      });
      const sql = `DELETE FROM ${tableName} WHERE ${whereClauses.join(' AND ')}`;
      const res = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
      if (!res.success) throw new Error(`删除数据失败: ${res.error}`);
    }

    // ================= 2. 执行新增 INSERT =================
    for (const row of inserts) {
       // 过滤掉前端为了状态维护自动挂载的私有属性
       const cols = Object.keys(row).filter(k => !k.startsWith('_'));
       
       const safeCols = cols.map(c => conn.dbType === 'mysql' ? `\`${c}\`` : `"${c}"`);
       const vals = cols.map(c => row[c] === null || row[c] === '' ? 'NULL' : `'${String(row[c]).replace(/'/g, "''")}'`);
       
       const sql = `INSERT INTO ${tableName} (${safeCols.join(', ')}) VALUES (${vals.join(', ')})`;
       const res = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
       if (!res.success) throw new Error(`新增数据失败: ${res.error}`);
    }

    // ================= 3. 执行修改 UPDATE =================
    for (const edit of edits) {
      const { originalRow, updates } = edit;
      const setClauses = [];
      for (const [col, val] of Object.entries(updates)) {
        const safeVal = val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
        const safeCol = conn.dbType === 'mysql' ? `\`${col}\`` : `"${col}"`;
        setClauses.push(`${safeCol} = ${safeVal}`);
      }
      const whereClauses = pkCols.map(pk => {
        const safePk = conn.dbType === 'mysql' ? `\`${pk}\`` : `"${pk}"`;
        return `${safePk} = '${String(originalRow[pk]).replace(/'/g, "''")}'`;
      });
      const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      const res = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
      if (!res.success) throw new Error(`更新数据失败: ${res.error}`);
    }

    ElMessage.success('数据操作全部成功！');
    await loadTableData(tab); // 重新加载刷新数据，清除高亮和新增标记
  } catch (err) { 
    ElMessage.error(`执行失败: ${err.message}`); 
  } finally { 
    tab.loading = false; 
  }
};

const nextQueryIndex = ref(1);
const addQueryTab = () => {
  if (!activeConnection.value) return;
  const id = `query-${Date.now()}`;
  const newTab = {
    id, type: 'query', title: `查询 ${nextQueryIndex.value++}`,
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

const removeTab = (id) => {
  const idx = openTabs.value.findIndex(t => t.id === id);
  openTabs.value.splice(idx, 1);
  if (activeTab.value === id) activeTab.value = openTabs.value[idx]?.id || openTabs.value[idx-1]?.id || '';
};

const handleTabChange = (tabId) => {
  const tab = openTabs.value.find(t => t.id === tabId);
  if (tab) {
    activeConnection.value = getConnectionById(tab.connectionId);
    if (tab.type === 'table') { activeSchema.value = tab.schema; activeTable.value = tab.table; }
    else { activeSchema.value = tab.schema || ''; activeTable.value = ''; }
  }
};

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

const onQuerySchemaChange = (tab) => fetchAutoCompletionData(tab);
const refreshSchemaList = async (tab) => {
  if (!tab.connectionId) return;
  try {
    const res = await window.electronAPI.listSchemas({ connectionId: tab.connectionId });
    if (res.success) {
      tab.schemaList = res.data;
      if (tab.schema && !tab.schemaList.includes(tab.schema)) tab.schema = '';
    }
  } catch(e) {}
};
const onQueryConnectionChange = async (tab) => {
  tab.schema = ''; tab.schemaList = []; tab.hintTables = {}; 
  await refreshSchemaList(tab);
};

const executeSqlForTab = async (tab) => {
  const editorRef = editorRefs[tab.id]; 
  const sql = editorRef ? editorRef.getSelectionOrAll().trim() : (tab.sql || '').trim();
  if (!sql) return ElMessage.warning('请输入 SQL');
  
  const startTime = Date.now();
  tab.loading = true; 
  tab.showBottomPanel = true; 
  tab.error = '';
  
  try {
    const res = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql });
    const duration = Date.now() - startTime;
    
    if (res.success) {
      // 1. 安全赋值，防止 res.data 为 null 导致后续判断报错
      tab.result = res.data || {}; 
      
      // 2. 【核心修复】：防御性补全 isQuery 标识。
      // 只要后端返回了 rows 数组，或者 SQL 语句是以 SELECT/WITH/SHOW 等查询关键字开头，我们就强制认为这是一个查询操作！
      if (tab.result.rows || /^\s*(SELECT|WITH|SHOW|DESC|EXPLAIN)/i.test(sql)) {
        tab.result.isQuery = true;
      }
      
      // 3. 根据最终的 isQuery 标识决定底部展示哪个 Tab
      tab.bottomTab = tab.result.isQuery ? 'result' : 'message';
      
      tab.history.unshift({ time: new Date().toLocaleString(), sql, duration, status: '成功' });
    } else {
      tab.error = res.error; 
      tab.bottomTab = 'message';
      tab.history.unshift({ time: new Date().toLocaleString(), sql, duration, status: '失败' });
    }
  } catch(e) { 
    tab.error = e.message; 
    tab.bottomTab = 'message';
    tab.history.unshift({ time: new Date().toLocaleString(), sql, duration: Date.now() - startTime, status: '失败' });
  } finally { 
    tab.loading = false; 
  }
};

const startDrag = (e, tab) => {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = tab.editorHeight;
  const container = e.target.parentElement;
  const containerHeight = container.clientHeight;
  const onMouseMove = (moveEvent) => {
    let newHeight = startHeight + ((moveEvent.clientY - startY) / containerHeight) * 100;
    if (newHeight < 15) newHeight = 15;
    if (newHeight > 85) newHeight = 85;
    tab.editorHeight = newHeight;
  };
  const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
};

// ================= 3. AI 核心能力逻辑 =================

const openAiConfigDialog = async () => {
  try {
    const config = await window.electronAPI.getAiConfig();
    if (config) Object.assign(aiConfig, config);
    showAiConfigDialog.value = true;
  } catch(e) { ElMessage.error("获取 AI 配置失败"); }
};

const saveAiConfig = async () => {
  if (!aiConfig.apiKey) return ElMessage.warning('API Key 不能为空');
  try {
    const res = await window.electronAPI.saveAiConfig(JSON.parse(JSON.stringify(aiConfig)));
    if (res.success) { ElMessage.success('保存成功'); showAiConfigDialog.value = false; }
    else throw new Error(res.error);
  } catch(e) { ElMessage.error(e.message); }
};

// App.vue 逻辑部分

// App.vue 中的逻辑
const handleDesignerSaveSuccess = async (designTab) => {
  // 1. 刷新左侧树（防止表名改了侧边栏没变）
  if (typeof loadConnections === 'function') {
    await loadConnections(); 
  }

  // 2. 找到所有涉及该表的“数据预览”标签页，强制刷新
  openTabs.value.forEach(tab => {
    if (
      tab.type === 'table' && 
      tab.connectionId === designTab.connectionId && 
      tab.schema === designTab.schema && 
      tab.table === designTab.table
    ) {
      // 调用之前修改过的 loadTableData，它会先取最新 fields 再取数据
      loadTableData(tab); 
    }
    
    // 3. 如果是当前的“设计”标签页，确保其内部状态也同步（通常在组件内部处理了，这里做双保险）
    if (tab.id === designTab.id) {
       // 如果设计器里改了表名，这里要更新标签页的标题
       tab.label = `设计: ${designTab.table}`;
    }
  });
};

// 【AI 功能1】：智能双模式交互 (隔离聊天记录)
const generateSqlWithAi = async () => {
  if (!aiPromptInput.value.trim()) return;
  
  const isSqlMode = chatMode.value === 'sql';
  // 动态获取当前应该操作的聊天记录数组
  const targetHistory = isSqlMode ? sqlChatHistory.value : qaChatHistory.value;
  
  if (isSqlMode) {
    const currentTab = openTabs.value.find(t => t.id === activeTab.value);
    if (!currentTab || currentTab.type !== 'query') {
      return ElMessage.warning('生成 SQL 请先在左侧打开一个查询窗口');
    }
  }
  
  const userText = aiPromptInput.value;
  // 消息 push 到对应的数组中
  targetHistory.push({ role: 'user', content: userText });
  aiPromptInput.value = ''; 
  aiGenerating.value = true;
  
  try {
    if (isSqlMode) {
      // ========= 模式 A：代码生成 =========
      const currentTab = openTabs.value.find(t => t.id === activeTab.value);
      const res = await window.electronAPI.generateSql({ 
        prompt: userText, 
        connectionId: currentTab.connectionId, 
        schema: currentTab.schema 
      });
      
      if (res.success && res.sql) {
        targetHistory.push({ role: 'ai', content: `为您生成的 SQL：\n\n${res.sql}`, sql: res.sql });
      } else {
        throw new Error(res.error);
      }
    } else {
      // ========= 模式 B：DBA 问答 =========
      const res = await window.electronAPI.askQuestion(userText);
      
      if (res.success && res.answer) {
        targetHistory.push({ role: 'ai', content: res.answer });
      } else {
        throw new Error(res.error);
      }
    }
    
    nextTick(() => { 
      const c = document.getElementById('chat-container'); 
      if (c) c.scrollTop = c.scrollHeight; 
    });
    
  } catch (err) {
    if (err.message && err.message.includes('未配置')) {
      ElMessageBox.confirm('您尚未配置 AI API Key。', '提示', { type: 'warning' }).then(() => openAiConfigDialog());
    } else { 
      targetHistory.push({ role: 'ai', content: `请求失败: ${err.message}` }); 
    }
  } finally { 
    aiGenerating.value = false; 
  }
};

const insertSqlToEditor = (sql) => {
  const tab = openTabs.value.find(t => t.id === activeTab.value);
  if (tab && editorRefs[tab.id]) {
    const editor = editorRefs[tab.id];
    editor.setSql((editor.getSelectionOrAll() || '') + `\n-- AI:\n${sql}\n`);
    ElMessage.success('插入成功');
  }
};

// 【AI 功能2】：慢查询诊断
const handleAiDiagnosis = async (tab) => {
  const editor = editorRefs[tab.id]; 
  const sql = editor ? editor.getSelectionOrAll().trim() : tab.sql.trim();
  if (!sql) return ElMessage.warning('无可用 SQL');

  showAiAnalysisDialog.value = true; analysisLoading.value = true; aiAnalysisResult.value = '';
  try {
    const explainRes = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql: `EXPLAIN ${sql}` });
    if (!explainRes.success) throw new Error(explainRes.error);
    
    let columns = [];
    const tbMatch = sql.match(/FROM\s+["`]?(\w+)["`]?/i);
    if (tbMatch) {
      const colRes = await window.electronAPI.getTableColumns({ connectionId: tab.connectionId, schema: tab.schema, table: tbMatch[1] });
      if (colRes.success) columns = colRes.data;
    }
    const res = await window.electronAPI.analyzeQuery({ sql, explainPlan: JSON.stringify(explainRes.data.rows), columns });
    if (res.success) aiAnalysisResult.value = res.analysis; else throw new Error(res.error);
  } catch (err) {
    if(err.message.includes('未配置')) ElMessageBox.confirm('去配置 Key？', '提示').then(openAiConfigDialog);
    else ElMessage.error('诊断失败: ' + err.message);
    showAiAnalysisDialog.value = false;
  } finally { analysisLoading.value = false; }
};

// 【AI 功能3】：智能数据模拟
const openMockDataDialog = (tab) => { mockTargetTab.value = tab; mockForm.count = 20; showMockDialog.value = true; };

const executeMockDataGeneration = async () => {
  mockGenerating.value = true;
  try {
    const tab = mockTargetTab.value;
    
    // 1. 获取表字段结构
    const colRes = await window.electronAPI.getTableColumns({ connectionId: tab.connectionId, schema: tab.schema, table: tab.table });
    
    // 2. 调用 AI 造数（🔥 这里加上 connectionId 和 schema）
    const aiRes = await window.electronAPI.generateMockData({ 
      connectionId: tab.connectionId,  // 新增：把连接ID传给后端查外键
      schema: tab.schema,              // 新增：把Schema传给后端查外键
      tableName: tab.table, 
      columns: colRes.data, 
      count: mockForm.count, 
      instruction: mockForm.instruction 
    });
    
    if (!aiRes.success) throw new Error(aiRes.error);
    
    // 3. 执行 AI 生成的 SQL 入库
    const execRes = await window.electronAPI.executeSql({ connectionId: tab.connectionId, schema: tab.schema, sql: aiRes.sql });
    if (!execRes.success) throw new Error(execRes.error);
    
    ElMessage.success('生成入库成功');
    showMockDialog.value = false;
    loadTableData(tab); // 刷新表格数据
  } catch (err) {
    if(err.message.includes('未配置')) openAiConfigDialog();
    else ElMessage.error(err.message);
  } finally { 
    mockGenerating.value = false; 
  }
};

// 【AI 功能4】：自动化数据洞察 (生成可视化图表)
const generateInsightFromCurrentTab = async () => {
  const tab = openTabs.value.find(t => t.id === activeTab.value);
  if (!tab || !tab.result || !tab.result.rows || tab.result.rows.length === 0) return ElMessage.warning('请先执行查询并获取结果。');

  insightLoading.value = true;
  try {
    // ✅ 修复：处理 Vue Proxy 拦截器 和 BigInt 序列化崩溃的问题
    const pureRows = JSON.parse(JSON.stringify(tab.result.rows, (key, value) => {
      return typeof value === 'bigint' ? value.toString() : value;
    }));
    
    // 把纯净、安全的数据发给后端 AI
    const res = await window.electronAPI.generateInsight(pureRows);
    
    if (!res.success) throw new Error(res.error);

    const insightId = `insight-${Date.now()}`;
    openTabs.value.push({
      id: insightId, type: 'insight', title: `洞察: ${tab.title}`,
      analysis: res.analysis, option: res.chartOption, originalRows: tab.result.rows
    });
    activeTab.value = insightId;

    nextTick(() => {
      const chartDom = document.getElementById('chart-' + insightId);
      if (chartDom) {
        const myChart = echarts.init(chartDom);
        myChart.setOption(res.chartOption);
        window.addEventListener('resize', () => myChart.resize());
      }
    });
  } catch (err) {
    if(err.message.includes('未配置')) openAiConfigDialog();
    else ElMessage.error('洞察失败: ' + err.message);
  } finally { 
    insightLoading.value = false; 
  }
};



// 核心工作流：意图提取 -> SQL生成 -> 查询 -> 图表渲染
const executeSmartInsightFlow = async () => {
  if (!activeConnection.value || !activeSchema.value) {
    return ElMessage.warning('请先在左侧树中点击选中一个数据库');
  }
  if (!smartInsightPrompt.value.trim()) {
    return ElMessage.warning('请描述您的分析需求');
  }

  insightLoading.value = true;
  const connId = activeConnection.value.id;
  const schema = activeSchema.value;
  const userIntent = smartInsightPrompt.value;
  const chartType = smartChartType.value;

  try {
    // 💡 阶段 1：根据用户意图，让 AI 写 SQL
    ElMessage.info('步骤 1/3: 正在理解意图并生成 SQL...');
    const sqlRes = await window.electronAPI.generateSql({ 
      prompt: `请帮我编写SQL查询：${userIntent}`, 
      connectionId: connId, 
      schema: schema 
    });
    if (!sqlRes.success || !sqlRes.sql) throw new Error('SQL 生成失败: ' + sqlRes.error);
    const generatedSql = sqlRes.sql;

    // 💡 阶段 2：在系统后台悄悄执行这句 SQL 拿数据
    ElMessage.info('步骤 2/3: 正在数据库中提取聚合数据...');
    const execRes = await window.electronAPI.executeSql({ 
      connectionId: connId, 
      schema: schema, 
      sql: generatedSql 
    });
    if (!execRes.success) throw new Error('数据查询失败: ' + execRes.error);
    if (!execRes.data || !execRes.data.rows || execRes.data.rows.length === 0) {
      throw new Error('当前查询结果为空，没有数据可以生成图表。');
    }

    // 💡 阶段 3：构建图表提示词，将用户选择的图表类型强制要求给 AI
    ElMessage.info('步骤 3/3: 正在进行数据可视化智能排版...');
    const pureRows = JSON.parse(JSON.stringify(execRes.data.rows, (key, value) => {
      return typeof value === 'bigint' ? value.toString() : value;
    }));

    // 【核心创新点】：将用户的图表偏好和推荐逻辑通过内部字段传递给 AI 解析器
    // 注意：这里我们利用 JS 对象包裹一下数据，传递给后端的 generateInsight
    const chartRequestPayload = {
      data: pureRows,
      userIntent: userIntent,
      preference: chartType === 'auto' 
        ? "【指令】：请分析这批数据的数据特征。如果是占比推荐饼图，如果是对比推荐柱状图，如果是时间趋势推荐折线图。并且在分析报告中明确写出『系统推荐图表理由』。" 
        : `【强制指令】：用户明确要求必须使用 ${chartType} (bar=柱状图, pie=饼图, line=折线图) 进行渲染。请直接生成对应类型的 ECharts 配置，并在报告中给出业务分析。`
    };

    const chartRes = await window.electronAPI.generateInsight(chartRequestPayload);
    if (!chartRes.success) throw new Error('图表生成失败: ' + chartRes.error);

    // 💡 阶段 4：渲染到新标签页展示给用户看
    const insightId = `insight-${Date.now()}`;
    openTabs.value.push({
      id: insightId, 
      type: 'insight', 
      title: `📊 智能看板`,
      // 将 AI 的分析结果和底层执行的 SQL 一起展示给用户
      analysis: `${chartRes.analysis}\n\n====================\n💻 背后自动执行的 SQL:\n${generatedSql}`, 
      option: chartRes.chartOption, 
      originalRows: pureRows
    });
    activeTab.value = insightId;

    nextTick(() => {
      const chartDom = document.getElementById('chart-' + insightId);
      if (chartDom) {
        const myChart = echarts.init(chartDom);
        myChart.setOption(chartRes.chartOption);
        window.addEventListener('resize', () => myChart.resize());
      }
    });

    ElMessage.success('自助式智能分析完成！');

  } catch (err) {
    if(err.message.includes('未配置')) openAiConfigDialog();
    else ElMessage.error(err.message);
  } finally {
    insightLoading.value = false;
  }
};



// ================= 🔴 终极防白屏与错误诊断拦截器 =================
// 1. 拦截 Vue 组件渲染报错（最容易导致彻底白屏的原因）
onErrorCaptured((err, instance, info) => {
  ElNotification({
    title: 'Vue 渲染崩溃拦截',
    message: err.message,
    type: 'error',
    duration: 0 // 持续显示不自动关闭
  });
  console.error('【Vue 报错详情】', err, info);
  return false; // 阻止错误继续往上抛，保护其他 UI 不白屏
});

// 2. 拦截系统级 JS 错误（比如变量未定义、组件没找到）
window.addEventListener('error', (event) => {
  ElNotification({
    title: '系统级 JS 错误',
    message: event.message,
    type: 'error',
    duration: 0
  });
});

// 3. 拦截未捕获的异步/IPC 错误（比如后端接口没挂载）
window.addEventListener('unhandledrejection', (event) => {
  ElNotification({
    title: '异步或 IPC 接口错误',
    message: event.reason?.message || '未知异步错误',
    type: 'error',
    duration: 0
  });
});
// ==============================================================

</script>

<style scoped>
/* 滚动条 */
.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
/* 树 */
:deep(.modern-tree) { background: transparent; --el-tree-node-hover-bg-color: #f1f5f9; }
:deep(.modern-tree .el-tree-node__content) { height: 32px; border-radius: 6px; margin-bottom: 2px; }
/* Tabs */
:deep(.modern-tabs > .el-tabs__header) { margin: 0; border-bottom: 1px solid #e2e8f0; background-color: #f8fafc; }
:deep(.modern-tabs > .el-tabs__header .el-tabs__nav) { border: none !important; }
:deep(.modern-tabs > .el-tabs__header .el-tabs__item) { border: 1px solid transparent !important; border-right: 1px solid #e2e8f0 !important; background-color: #f1f5f9; color: #64748b; height: 36px; line-height: 36px; }
:deep(.modern-tabs > .el-tabs__header .el-tabs__item.is-active) { background-color: #ffffff; border-top: 2px solid #3b82f6 !important; color: #0f172a; border-bottom-color: #ffffff !important; }
:deep(.modern-tabs > .el-tabs__content) { flex: 1; overflow: hidden; }
/* Resizer */
.resizer { height: 4px; background: #f1f5f9; cursor: row-resize; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; transition: background 0.2s; }
.resizer:hover, .resizer:active { background: #3b82f6; }
</style>