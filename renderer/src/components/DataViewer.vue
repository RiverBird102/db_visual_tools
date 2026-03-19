<template>
  <div class="data-viewer-container">
    <div v-if="error" class="error-msg">
      ❌ {{ error }}
    </div>
    
    <div v-if="editable && hasModifications" class="edit-toolbar">
      <el-tag type="warning" class="status-tag">⚠️ 您有未提交的修改（黄色标记）</el-tag>
      <el-button type="success" size="small" @click="submitChanges">✅ 提交修改 (生成 UPDATE)</el-button>
      <el-button size="small" type="danger" plain @click="discardChanges">放弃全部</el-button>
    </div>

    <el-table
      v-if="!error"
      :data="displayData"
      v-loading="loading"
      border
      stripe
      style="width: 100%; height: 100%;"
      @cell-dblclick="handleCellDblclick"
      :cell-class-name="getCellClassName"
      height="100%"
    >
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
              class="lob-btn" 
              link 
              type="primary" 
              size="small" 
              @click.stop="openLobViewer(row, col, $index)"
            >
              👁️ 详情
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="lobDialogVisible" title="LOB / 长文本内容编辑器" width="60%">
      <el-input
        v-model="lobContent"
        type="textarea"
        :rows="18"
        :readonly="!editable"
      ></el-input>
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

// ================= 1. 先声明所有变量 (防止 TDZ 暂时性死区错误) =================
const displayData = ref([]);
const modifiedMap = ref({}); // 记录修改状态
const editingCell = ref(null); // 当前正在编辑的单元格坐标
const editValue = ref('');
const inputRefs = ref({});
const lobDialogVisible = ref(false);
const lobContent = ref('');
const lobTarget = ref(null); 

// ================= 2. 再执行 Watch (安全挂载) =================
// 监听外界数据变化，当翻页或重新查询时，重置当前网格数据和修改状态
watch(() => props.data, (newVal) => {
  displayData.value = JSON.parse(JSON.stringify(newVal || []));
  modifiedMap.value = {};
  editingCell.value = null; // 现在它能正确找到变量了
}, { immediate: true, deep: true });

// ================= 3. 内联编辑核心逻辑 =================
const setInputRef = (el, rowIndex, colName) => {
  if (el) inputRefs.value[`${rowIndex}_${colName}`] = el;
};

const hasModifications = computed(() => Object.keys(modifiedMap.value).length > 0);

// 双击单元格进入编辑状态
const handleCellDblclick = (row, column, cell, event) => {
  if (!props.editable) return;
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
  const originalVal = props.data[rowIndex][colName];
  const newVal = editValue.value === '' && originalVal === null ? null : editValue.value;

  if (originalVal !== newVal) {
    row[colName] = newVal; // 更新视图数据
    modifiedMap.value[`${rowIndex}_${colName}`] = { old: originalVal, new: newVal };
  } else {
    // 如果改回去和原来一样了，取消高亮标记
    delete modifiedMap.value[`${rowIndex}_${colName}`];
    row[colName] = originalVal;
  }
  editingCell.value = null;
};

const isEditing = (rowIndex, colName) => {
  return editingCell.value && editingCell.value.rowIndex === rowIndex && editingCell.value.colName === colName;
};

// 动态给被修改过的单元格加上高亮类名
const getCellClassName = ({ row, column, rowIndex, columnIndex }) => {
  const colName = column.property;
  if (modifiedMap.value[`${rowIndex}_${colName}`]) {
    return 'cell-modified';
  }
  return '';
};

const discardChanges = () => {
  displayData.value = JSON.parse(JSON.stringify(props.data || []));
  modifiedMap.value = {};
};

const submitChanges = () => {
  // 把打散的 modifiedMap 按行聚合成后端需要的结构
  const editsByRow = {};
  for (const [key, mod] of Object.entries(modifiedMap.value)) {
    const firstUnderscore = key.indexOf('_');
    const rIdx = parseInt(key.substring(0, firstUnderscore));
    const cName = key.substring(firstUnderscore + 1);

    if (!editsByRow[rIdx]) {
      editsByRow[rIdx] = {
        originalRow: props.data[rIdx], // 取最原始的数据，包含主键
        updates: {}
      };
    }
    editsByRow[rIdx].updates[cName] = mod.new;
  }
  emit('submit-edits', Object.values(editsByRow));
};

// ================= 4. LOB / 长文本处理 =================
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
</style>