const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

const AIService = require('./config/ai-service');
const aiService = new AIService(store);

// 数据库连接管理
const dbConnections = require('./config/db-config');

// 保持窗口对象的全局引用
let mainWindow;

function createWindow() {
  const isDev = !app.isPackaged;
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'renderer/src/assets/icon.png'),
    title: '国产数据库可视化管理工具'
  });

  // 加载应用页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // 打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/dist/index.html'));
  }

  // 安全：阻止任意跳转/新开窗口（外链交给系统浏览器）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:3000') : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  // 窗口关闭时触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron初始化完成后创建窗口
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ================= IPC通信 - 数据库连接相关 =================
ipcMain.handle('db:save-connection', async (event, connection) => {
  try {
    if (!connection || typeof connection !== 'object') throw new Error('连接参数不合法');
    if (!connection.id) throw new Error('连接缺少id');
    const connections = store.get('db.connections', []);
    connections.push(connection);
    store.set('db.connections', connections);
    return { success: true, data: connections };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get-connections', async () => {
  try {
    const connections = store.get('db.connections', []);
    return { success: true, data: connections };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:test-connection', async (event, config) => {
  try {
    const result = await dbConnections.testConnection(config);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 更新连接
ipcMain.handle('db:update-connection', async (event, connection) => {
  try {
    if (!connection || !connection.id) throw new Error('连接参数不合法');
    const connections = store.get('db.connections', []);
    const index = connections.findIndex(item => item.id === connection.id);
    if (index !== -1) {
      connections[index] = connection;
      store.set('db.connections', connections);
      return { success: true, data: connections };
    } else {
      throw new Error('未找到要更新的连接');
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 清理底层数据库连接缓存
ipcMain.handle('db:disconnect', async (event, id) => {
  try {
    if (!id) throw new Error('ID不能为空');
    if (dbConnections.disconnect) {
      await dbConnections.disconnect(id);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除连接
ipcMain.handle('db:delete-connection', async (event, id) => {
  try {
    if (!id) throw new Error('ID不能为空');
    let connections = store.get('db.connections', []);
    connections = connections.filter(item => item.id !== id);
    store.set('db.connections', connections);
    return { success: true, data: connections };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 执行 SQL
ipcMain.handle('db:execute-sql', async (event, { connectionId, schema, sql }) => {
  try {
    if (!connectionId) throw new Error('connectionId不能为空');
    if (typeof sql !== 'string' || !sql.trim()) throw new Error('SQL不能为空');
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) {
      throw new Error('连接不存在');
    }
    const result = await dbConnections.executeSql(connection, sql, schema);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ================= IPC通信 - 元数据（库/表/字段） =================
ipcMain.handle('db:list-schemas', async (event, { connectionId } = {}) => {
  try {
    if (!connectionId) throw new Error('connectionId不能为空');
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    const data = await dbConnections.listSchemas(connection);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:list-tables', async (event, { connectionId, schema } = {}) => {
  try {
    if (!connectionId) throw new Error('connectionId不能为空');
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    const data = await dbConnections.listTables(connection, { schema });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get-table-columns', async (event, { connectionId, schema, table } = {}) => {
  try {
    if (!connectionId) throw new Error('connectionId不能为空');
    if (!table) throw new Error('table不能为空');
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    const data = await dbConnections.getTableColumns(connection, { schema, table });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ================= IPC通信 - 对话框 =================
ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'SQL Files', extensions: ['sql'] }]
  });
  return result;
});

ipcMain.handle('dialog:save-file', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'SQL Files', extensions: ['sql'] }]
  });
  return result;
});

// ================= AI 配置与功能 =================
// 获取 AI 配置
ipcMain.handle('ai:get-config', async () => {
  return store.get('ai.config', {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1', // 修复了这里的链接语法问题
    model: 'gpt-3.5-turbo'
  });
});

// 保存 AI 配置
ipcMain.handle('ai:save-config', async (event, config) => {
  try {
    store.set('ai.config', config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 自然语言转 SQL
ipcMain.handle('ai:generate-sql', async (event, { prompt, connectionId, schema }) => {
  try {
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    
    // 允许不传 connection，此时不使用数据库上下文辅助
    const result = await aiService.generateSql(prompt, connection, schema);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI 智能问答机器人
ipcMain.handle('ai:ask-question', async (event, question) => {
  try {
    const result = await aiService.askDatabaseQuestion(question);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI 慢查询诊断
ipcMain.handle('ai:analyze-query', async (event, { sql, explainPlan, columns }) => {
  try {
    const result = await aiService.analyzeSlowQuery(sql, explainPlan, columns);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI 智能生成测试数据 (增强版：自动外键约束注入 + 唯一性防冲突)
ipcMain.handle('ai:generate-mock-data', async (event, { connectionId, schema, tableName, columns, count, instruction }) => {
  try {
    // 1. 获取当前数据库连接
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    
    let finalInstruction = instruction || '';

    // 如果前端传了连接信息，我们就可以去查外键上下文
    if (connection) {
      try {
        // 调用 db-config.js 中已经写好的获取表关系接口
        const relations = await dbConnections.getRelationships(connection, { schema });
        
        // 过滤出：当前正在造数的表，作为"子表"的所有外键记录
        const foreignKeys = (relations || []).filter(r => 
          r.source_table && r.source_table.toUpperCase() === String(tableName).toUpperCase()
        );

        if (foreignKeys.length > 0) {
          finalInstruction += '\n\n【必须遵守的硬性外键约束】：';
          
          // 遍历每一个外键，去父表里取真实数据
          for (const fk of foreignKeys) {
            let sql = `SELECT ${fk.target_column} FROM ${fk.target_table}`;
            if (connection.dbType === 'dm' || connection.dbType === 'oracle') {
              sql += ` WHERE ROWNUM <= 20`; // 达梦/Oracle 语法
            } else {
              sql += ` LIMIT 20`;          // MySQL/PG/人大金仓 语法
            }

            const queryRes = await dbConnections.executeSql(connection, sql, schema);
            
            if (queryRes.isQuery && queryRes.rows && queryRes.rows.length > 0) {
              const validValues = queryRes.rows.map(row => {
                const val = row[fk.target_column] || row[fk.target_column.toUpperCase()] || row[fk.target_column.toLowerCase()];
                return typeof val === 'number' ? val : `'${val}'`;
              }).filter(v => v !== undefined && v !== 'undefined');

              if (validValues.length > 0) {
                const uniqueValues = [...new Set(validValues)];
                finalInstruction += `\n- 字段 \`${fk.source_column}\` 的值必须严格且只能从以下集合中随机选取：[${uniqueValues.join(', ')}]，绝对不能自己编造其他值。`;
              }
            }
          }
        }
      } catch (e) {
        console.warn('AI造数预处理：获取外键真实数据失败，降级为常规造数模式', e.message);
      }
    }

    // ================= 🌟 新增：处理唯一性约束 / 主键冲突防护 =================
    // 提取当前表的主键列名
    const pkNames = (columns || []).filter(c => c.primaryKey).map(c => c.name);

    finalInstruction += `\n\n【防冲突与唯一性强制要求】：`;

    if (pkNames.length > 0) {
      finalInstruction += `\n1. 明确已知表的主键是 [${pkNames.join(', ')}]。为了防止 INSERT 时主键冲突，绝对不能生成常规的小数字（如 1,2,3）！
   - 如果主键是整数类型，请生成 1000000 到 99999999 之间的超大随机数。
   - 如果主键是字符串类型，请使用类似 UUID 或带当前时间戳的超长随机字符串。`;
    }

    finalInstruction += `\n2. 对于通常要求唯一的业务字段（例如 username, account, email, phone, id_card, code 等），千万不要生成诸如 'test'、'admin' 这样大众化的死数据！请务必在生成的内容中追加 4-6 位随机数字后缀（例如：'user_82739', 'test_mail_9921@xx.com'），以此保证数据在全表中的绝对唯一性！`;
    // =========================================================================

    // 2. 将强化后的最终要求（包含真实外键数据和唯一性规则）传给 AI
    const result = await aiService.generateMockData(tableName, columns, count, finalInstruction);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ================= IPC通信 - 信创特性 =================
ipcMain.handle('db:get-xinchuang-role', async (event, { connectionId }) => {
  try {
    if (!connectionId) throw new Error('connectionId不能为空');
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    
    const data = await dbConnections.getXinchuangRole(connection);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI 数据洞察
ipcMain.handle('ai:generate-insight', async (event, dataRows) => {
  try {
    const result = await aiService.generateDataInsight(dataRows);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 在 main.js 的元数据部分添加
ipcMain.handle('db:get-relationships', async (event, { connectionId, schema }) => {
  try {
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    const data = await dbConnections.getRelationships(connection, { schema });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// main.js 的 IPC 通信区域新增
ipcMain.handle('db:get-tablespace', async (event, { connectionId }) => {
  try {
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    
    const data = await dbConnections.getTablespaceUsage(connection);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// main.js 的 IPC 通信区域新增：
ipcMain.handle('ai:smart-tuning', async (event, { connectionId, schema, sql }) => {
  try {
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    
    // 1. 获取底层专属执行计划
    const explainPlan = await dbConnections.getExplainPlan(connection, sql, schema);
    
    // 2. 调用你 ai-service.js 里现成的分析方法 (暂时略过传入表结构，保持轻量)
    const result = await aiService.analyzeSlowQuery(sql, explainPlan, "表结构略");
    
    if (result.success) {
      return { success: true, plan: explainPlan, analysis: result.analysis };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});


// 在 main.js 的 IPC 区域新增
ipcMain.handle('db:get-xc-assets', async (event, { connectionId, schema }) => {
  try {
    const connections = store.get('db.connections', []);
    const connection = connections.find(item => item.id === connectionId);
    if (!connection) throw new Error('连接不存在');
    
    const data = await dbConnections.getXinchuangAssets(connection, { schema });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});