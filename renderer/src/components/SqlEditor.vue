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

/* CodeMirror 的 gutter/行号默认留白偏大，这里收紧并统一字体，避免“行号与内容差两格” */
:deep(.CodeMirror) {
  height: 100%;
  font-family: Consolas, "Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 13px;
  line-height: 1.6;
}

:deep(.CodeMirror-gutters) {
  padding-right: 0;
}

:deep(.CodeMirror-linenumber) {
  padding: 0 6px 0 0;
  min-width: 2.5em;
}
</style>