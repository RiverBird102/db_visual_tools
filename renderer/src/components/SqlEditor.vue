<template>
  <div class="sql-editor" ref="editorContainer"></div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/sql/sql';

// 【新增】引入智能代码提示的核心 CSS 和 JS
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/sql-hint.js';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  connection: {
    type: Object,
    default: null
  },
  // 【新增】接收外部传入的数据库表结构，用于代码联想
  hintTables: {
    type: Object,
    default: () => ({})
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
    autoCloseBrackets: true,
    // 【新增】绑定代码提示的快捷键并配置词典
    extraKeys: { "Ctrl-Space": "autocomplete" },
    hintOptions: {
      tables: props.hintTables || {} // 注入表名和字段信息
    }
  });
  
  editor.setSize('100%', '100%');

  editor.on('change', () => {
    emit('update:modelValue', editor.getValue());
  });

  // 【新增】监听用户输入，输入字母时自动弹出智能提示
  editor.on('inputRead', (cm, event) => {
    if (!cm.state.completionActive && /^[a-zA-Z0-9_.]+$/.test(event.text[0])) {
      CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
  });

  setTimeout(() => {
    if (editor) {
      editor.refresh();
      editor.focus();
    }
  }, 100);
};

// 获取编辑器全部内容
const getSql = () => {
  return editor ? editor.getValue() : '';
};

// 【新增】获取用户用鼠标选中的代码，如果没选中，则返回全部代码
const getSelectionOrAll = () => {
  if (!editor) return '';
  const selection = editor.getSelection();
  return selection ? selection : editor.getValue();
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

// 暴露方法给父组件 App.vue 使用
defineExpose({
  getSql,
  setSql,
  clear,
  getSelectionOrAll
});

// 监听连接变化
watch(() => props.connection, (newVal) => {
  if (newVal && editor) {
    if (!props.modelValue) {
      editor.setValue(`-- 连接到 ${newVal.name}\n-- 请输入SQL语句`);
    }
  }
});

// 监听外部传入的表元数据变化，实时更新词典
watch(() => props.hintTables, (newVal) => {
  if (editor) {
    editor.setOption('hintOptions', { tables: newVal || {} });
  }
}, { deep: true });

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
.sql-editor { width: 100%; height: 100%; }

:deep(.CodeMirror) {
  height: 100%;
  font-family: Consolas, "Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 14px;
  line-height: 1.6;
}

:deep(.CodeMirror-gutters) {
  background-color: #272822 !important;
  border-right: 1px solid #555 !important;
  padding-right: 5px;
}

:deep(.CodeMirror-lines) {
  padding-left: 10px;
}

:deep(.CodeMirror-linenumber) {
  color: #75715e !important;
}

/* 【新增】代码提示框美化 */
:deep(.CodeMirror-hints) {
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
  z-index: 9999;
}
</style>