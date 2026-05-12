<template>
  <div class="data-viewer-container">
    <div v-if="error" class="error-msg">
      ❌ {{ error }}
    </div>
    
    <div v-if="editable" class="edit-toolbar">
      <el-button type="primary" size="small" @click="addNewRow" class="mr-3">➕ 新增数据</el-button>
      
      <el-button v-if="canDelete" type="danger" size="small" plain @click="deleteSelected" class="mr-2">🗑️ 删除选中行</el-button>
      <el-button v-if="canRestore" type="info" size="small" plain @click="restoreSelected" class="mr-3">↩️ 撤销删除</el-button>
      
      <div style="flex-grow: 1;"></div> <el-tag v-if="hasModifications" type="warning" class="status-tag">⚠️ 您有未提交的修改</el-tag>
      <el-button v-if="hasModifications" type="success" size="small" @click="submitChanges">✅ 提交保存 (生效到库)</el-button>
      <el-button v-if="hasModifications" size="small" type="danger" plain @click="discardChanges">放弃全部</el-button>
    </div>

    <el-table
      ref="tableRef"
      v-if="!error"
      :data="displayData"
      v-loading="loading"
      border
      stripe
      style="width: 100%; height: 100%;"
      @cell-dblclick="handleCellDblclick"
      :cell-class-name="getCellClassName"
      :row-class-name="getRowClassName" 
      @selection-change="handleSelectionChange"
      height="100%"
    >
      <el-table-column v-if="editable" type="selection" width="50" align="center" fixed="left" />
      
      <el-table-column
        v-for="(col, index) in columns"
        :key="index"
        :prop="col"
        :label="col"
        sortable
        min-width="150"
      >
        <template #default="{ row, $index }">
          <div v-if="isEditing($index, col)">
            <el-input
              v-model="editValue"
              size="small"
              :ref="el => setInputRef(el, $index, col)"
              @blur="saveCell($index, col, row)"
              @keyup.enter="saveCell($index, col, row)"
            ></el-input>
          </div>
          <div v-else class="cell-content">
            <span class="text-content" :class="{'is-null': row[col] === null}">
              {{ formatDisplay(row[col]) }}
            </span>
            <el-button 
              v-if="isLongText(row[col])" 
              class="lob-btn" link type="primary" size="small" 
              @click.stop="openLobViewer(row, col, $index)"
            >👁️ 详情</el-button>
          </div>
        </template>
      </el-table-column>
      </el-table>

    <el-dialog v-model="lobDialogVisible" title="LOB / 长文本内容编辑器" width="60%">
      <el-input v-model="lobContent" type="textarea" :rows="18" :readonly="!editable"></el-input>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="lobDialogVisible = false">{{ editable ? '取消' : '关闭' }}</el-button>
          <el-button v-if="editable" type="primary" @click="saveLob">临时保存到网格</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue';

const props = defineProps({
  data: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  editable: { type: Boolean, default: false } // 是否允许内联编辑 (表视图才允许)
});

const emit = defineEmits(['submit-edits']);

// ================= 1. 先声明所有变量 =================
const displayData = ref([]);
const modifiedMap = ref({}); // 记录修改状态
const editingCell = ref(null); // 当前正在编辑的单元格坐标
const editValue = ref('');
const inputRefs = ref({});
const lobDialogVisible = ref(false);
const lobContent = ref('');
const lobTarget = ref(null); 

// 【新增】: 表格 DOM 引用与复选框选中状态
const tableRef = ref(null);
const selectedRows = ref([]);

// ================= 2. 再执行 Watch (安全挂载) =================
watch(() => props.data, (newVal) => {
  displayData.value = JSON.parse(JSON.stringify(newVal || [], (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
  })).map((row, index) => {
     row._originalData = props.data[index]; 
     return row;
  });
  modifiedMap.value = {};
  editingCell.value = null; 
  // 数据刷新时，清空选中状态
  selectedRows.value = [];
}, { immediate: true, deep: true });

// ================= 3. 内联编辑与状态计算核心逻辑 =================
const setInputRef = (el, rowIndex, colName) => {
  if (el) inputRefs.value[`${rowIndex}_${colName}`] = el;
};

// 综合判断是否有变动 (包括编辑旧数据、新增行、删除行)
const hasModifications = computed(() => {
  const hasEdits = Object.keys(modifiedMap.value).length > 0;
  const hasNews = displayData.value.some(r => r._isNew);
  const hasDeletes = displayData.value.some(r => r._isDeleted);
  return hasEdits || hasNews || hasDeletes;
});

// 【新增】：监听多选框选中变化
const handleSelectionChange = (val) => {
  selectedRows.value = val;
};

// 【新增】：判断当前选中的行中，是否有可以删除的正常行
const canDelete = computed(() => {
  return selectedRows.value.length > 0 && selectedRows.value.some(row => !row._isDeleted);
});

// 【新增】：判断当前选中的行中，是否有已被打上删除标记、可以撤销的行
const canRestore = computed(() => {
  return selectedRows.value.length > 0 && selectedRows.value.some(row => row._isDeleted);
});

// 双击单元格进入编辑状态
const handleCellDblclick = (row, column, cell, event) => {
  if (!props.editable) return;
  // 如果当前行标记为删除，不允许编辑
  if (row._isDeleted) return;

  const colName = column.property;
  const rowIndex = displayData.value.indexOf(row);
  
  editingCell.value = { rowIndex, colName };
  editValue.value = row[colName] === null ? '' : row[colName];
  
  // 自动聚焦输入框
  nextTick(() => {
    const inputKey = `${rowIndex}_${colName}`;
    if (inputRefs.value[inputKey]) {
      inputRefs.value[inputKey].focus();
    }
  });
};

// 失去焦点或按回车保存单元格临时修改
const saveCell = (rowIndex, colName, row) => {
  if (!editingCell.value) return;

  if (row._isNew) {
    row[colName] = editValue.value === '' ? null : editValue.value;
    editingCell.value = null;
    return;
  }

  const originalVal = props.data[rowIndex][colName];
  const newVal = editValue.value === '' && originalVal === null ? null : editValue.value;

  if (originalVal !== newVal) {
    row[colName] = newVal; // 更新视图数据
    modifiedMap.value[`${rowIndex}_${colName}`] = { old: originalVal, new: newVal };
  } else {
    delete modifiedMap.value[`${rowIndex}_${colName}`];
    row[colName] = originalVal;
  }
  editingCell.value = null;
};

const isEditing = (rowIndex, colName) => {
  return editingCell.value && editingCell.value.rowIndex === rowIndex && editingCell.value.colName === colName;
};

// ================= 4. 增删行控制与样式计算 =================

const addNewRow = () => {
  const newRow = { _isNew: true };
  props.columns.forEach(col => newRow[col] = null);
  displayData.value.push(newRow); // 追加到底部
};

// 【修改】：批量删除选中的行
const deleteSelected = () => {
  selectedRows.value.forEach(row => {
    if (row._isNew) {
       // 新增但未提交的行，直接从表格中彻底移除
       const idx = displayData.value.indexOf(row);
       if (idx > -1) displayData.value.splice(idx, 1);
    } else {
       // 已有数据，打上删除标记
       row._isDeleted = true;
    }
  });
  // 操作完成后清空复选框
  if (tableRef.value) {
    tableRef.value.clearSelection();
  }
};

// 【修改】：批量撤销已标记删除的行
const restoreSelected = () => {
  selectedRows.value.forEach(row => {
    row._isDeleted = false;
  });
  if (tableRef.value) {
    tableRef.value.clearSelection();
  }
};

const getRowClassName = ({ row }) => {
  if (row._isDeleted) return 'row-deleted-style';
  if (row._isNew) return 'row-new-style';
  return '';
};

const getCellClassName = ({ row, column, rowIndex, columnIndex }) => {
  const colName = column.property;
  if (modifiedMap.value[`${rowIndex}_${colName}`]) {
    return 'cell-modified';
  }
  return '';
};

// ================= 5. 提交与回滚逻辑 =================

const discardChanges = () => {
  displayData.value = JSON.parse(JSON.stringify(props.data || [])).map((row, index) => {
     row._originalData = props.data[index];
     return row;
  });
  modifiedMap.value = {};
  if (tableRef.value) {
    tableRef.value.clearSelection();
  }
};

const submitChanges = () => {
  const inserts = [];
  const deletes = [];
  
  // 1. 抽离新增和删除的数据
  displayData.value.forEach(r => {
     if (r._isNew) {
        const clean = { ...r };
        delete clean._isNew;
        inserts.push(clean);
     }
     if (r._isDeleted) {
        deletes.push(r._originalData); 
     }
  });

  // 2. 抽离被修改的数据
  const editsByRow = {};
  for (const [key, mod] of Object.entries(modifiedMap.value)) {
    const firstUnderscore = key.indexOf('_');
    const rIdx = parseInt(key.substring(0, firstUnderscore));
    const cName = key.substring(firstUnderscore + 1);

    const rowData = displayData.value[rIdx];
    if (rowData && rowData._isNew) continue;     
    if (rowData && rowData._isDeleted) continue; 

    if (!editsByRow[rIdx]) {
      editsByRow[rIdx] = {
        originalRow: props.data[rIdx], 
        updates: {}
      };
    }
    editsByRow[rIdx].updates[cName] = mod.new;
  }
  
  emit('submit-edits', { 
    updates: Object.values(editsByRow), 
    inserts, 
    deletes 
  });
};

// ================= 6. LOB / 长文本处理 =================
const isLongText = (val) => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'object') return true; 
  if (typeof val === 'string' && val.length > 30) return true; 
  return false;
};

const formatDisplay = (val) => {
  if (val === null || val === undefined) return '<NULL>';
  if (typeof val === 'object') return '[大文本/二进制对象]';
  const str = String(val);
  return str.length > 30 ? str.substring(0, 30) + '...' : str;
};

const openLobViewer = (row, colName, rowIndex) => {
  lobTarget.value = { rowIndex, colName, row };
  lobContent.value = row[colName] === null ? '' : String(row[colName]);
  lobDialogVisible.value = true;
};

const saveLob = () => {
  const { rowIndex, colName, row } = lobTarget.value;
  editingCell.value = { rowIndex, colName }; 
  editValue.value = lobContent.value;
  saveCell(rowIndex, colName, row);
  lobDialogVisible.value = false;
};
</script>

<style scoped>
.data-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.error-msg {
  padding: 10px;
  color: #f56c6c;
  background-color: #fef0f0;
  border-radius: 4px;
}
.edit-toolbar {
  display: flex;
  align-items: center;
  padding: 8px;
  background-color: #f5f7fa;
  border: 1px solid var(--el-border-color);
  border-bottom: none;
}
.status-tag {
  margin-right: 15px;
  font-weight: bold;
}
.cell-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.text-content {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-null {
  color: #ccc;
  font-style: italic;
}
.lob-btn {
  margin-left: 8px;
  flex-shrink: 0;
}

/* 核心特效：高亮被修改的单元格 */
:deep(.cell-modified) {
  background-color: #fdf6ec !important; /* 浅橙色背景 */
  position: relative;
}
:deep(.cell-modified::before) {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-top: 8px solid #e6a23c; /* 左上角小三角标记 */
  border-right: 8px solid transparent;
}

/* 新增不同状态行的颜色提示 */
:deep(.row-deleted-style td) {
  text-decoration: line-through;
  color: #909399;
  background-color: #f5f7fa !important;
}
:deep(.row-new-style td) {
  background-color: #f0f9eb !important; /* 浅绿色提示这是新增行 */
}
</style>