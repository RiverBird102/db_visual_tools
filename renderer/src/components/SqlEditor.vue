<template>
  <div class="sql-editor" ref="editorContainer"></div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/sql/sql';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  connection: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue']);

const editorContainer = ref(null);
let editor = null;

// 初始化编辑器
const initEditor = () => {
  editor = CodeMirror(editorContainer.value, {
    value: props.modelValue || '',
    mode: 'text/x-sql',
    theme: 'monokai',
    lineNumbers: true,
    lineWrapping: true,
    autofocus: true,
    indentWithTabs: true,
    smartIndent: true,
    matchBrackets: true,
    autoCloseBrackets: true
  });
  
  // 设置编辑器高度
  editor.setSize('100%', '100%');

  editor.on('change', () => {
    emit('update:modelValue', editor.getValue());
  });

  // 【核心修复】：延迟 100 毫秒刷新编辑器。
  // 这能确保 CSS 样式被 Vue 完全渲染后，CodeMirror 再重新测量光标坐标，彻底解决光标错位问题。
  setTimeout(() => {
    if (editor) {
      editor.refresh();
      editor.focus(); // 刷新后自动聚焦，方便直接打字
    }
  }, 100);
};

// 获取编辑器内容
const getSql = () => {
  return editor ? editor.getValue() : '';
};

const setSql = (sql) => {
  if (!editor) return;
  const next = sql ?? '';
  if (editor.getValue() !== next) editor.setValue(next);
};

// 清空编辑器
const clear = () => {
  if (editor) {
    editor.setValue('');
  }
};

// 暴露方法
defineExpose({
  getSql,
  setSql,
  clear
});

// 监听连接变化
watch(() => props.connection, (newVal) => {
  if (newVal && editor) {
    if (!props.modelValue) {
      editor.setValue(`-- 连接到 ${newVal.name}\n-- 请输入SQL语句`);
    }
  }
});

watch(
  () => props.modelValue,
  (val) => {
    if (!editor) return;
    const next = val ?? '';
    if (editor.getValue() !== next) editor.setValue(next);
  }
);

onMounted(() => {
  initEditor();
});
</script>

<style scoped>
.sql-editor {
  width: 100%;
  height: 100%;
}

/* 1. 基础配置 */
:deep(.CodeMirror) {
  height: 100%;
  font-family: Consolas, "Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 14px;
  line-height: 1.6;
}

/* 2. 行号区 (左侧“锁死”的区域) */
:deep(.CodeMirror-gutters) {
  background-color: #272822 !important; /* 统一为 monokai 的背景色 */
  border-right: 1px solid #555 !important; /* 核心：加一条分割线，视觉上把行号隔开 */
  padding-right: 5px; /* 行号数字距离分割线的留白 */
}

/* 3. 文本输入区 (右侧代码区) */
:deep(.CodeMirror-lines) {
  padding-left: 10px; /* 核心：让代码文本和光标强行距离左侧的分割线 10px 的距离 */
}

/* 4. 让行号的颜色稍微暗一点，更像 IDE */
:deep(.CodeMirror-linenumber) {
  color: #75715e !important;
}
</style>