const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 数据库相关
  saveDbConnection: (connection) => ipcRenderer.invoke('db:save-connection', connection),
  updateDbConnection: (connection) => ipcRenderer.invoke('db:update-connection', connection),
  deleteDbConnection: (id) => ipcRenderer.invoke('db:delete-connection', id),
  disconnectDb: (id) => ipcRenderer.invoke('db:disconnect', id),
  getDbConnections: () => ipcRenderer.invoke('db:get-connections'),
  testDbConnection: (config) => ipcRenderer.invoke('db:test-connection', config),
  executeSql: (params) => ipcRenderer.invoke('db:execute-sql', params),
  listSchemas: (params) => ipcRenderer.invoke('db:list-schemas', params),
  listTables: (params) => ipcRenderer.invoke('db:list-tables', params),
  getTableColumns: (params) => ipcRenderer.invoke('db:get-table-columns', params),
  
  // 对话框相关
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  saveFileDialog: () => ipcRenderer.invoke('dialog:save-file'),
  
  // 错误处理
  onError: (callback) => ipcRenderer.on('error', (event, error) => callback(error))
});
