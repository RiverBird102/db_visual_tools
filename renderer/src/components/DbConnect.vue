<template>
  <el-form :model="connectionForm" :rules="rules" ref="formRef" label-width="100px">
    <el-form-item label="连接名称" prop="name">
      <el-input v-model="connectionForm.name" placeholder="例如: 本地测试库"></el-input>
    </el-form-item>
    <el-form-item label="数据库类型" prop="dbType">
      <el-select v-model="connectionForm.dbType" placeholder="请选择数据库类型">
        <el-option label="MySQL" value="mysql"></el-option>
        <el-option label="达梦 (DM)" value="dm"></el-option>
        <el-option label="人大金仓 (Kingbase)" value="kingbase"></el-option>
        <el-option label="PostgreSQL" value="postgresql"></el-option>
      </el-select>
    </el-form-item>
    <el-form-item label="主机地址" prop="host">
      <el-input v-model="connectionForm.host" placeholder="例如: 127.0.0.1"></el-input>
    </el-form-item>
    <el-form-item label="端口号" prop="port">
      <el-input v-model="connectionForm.port" placeholder="例如: 3306"></el-input>
    </el-form-item>
    <el-form-item label="数据库名" prop="database">
      <el-input v-model="connectionForm.database" placeholder="请输入数据库名"></el-input>
    </el-form-item>
    <el-form-item label="用户名" prop="username">
      <el-input v-model="connectionForm.username" placeholder="请输入用户名"></el-input>
    </el-form-item>
    <el-form-item label="密码" prop="password">
      <el-input v-model="connectionForm.password" type="password" placeholder="请输入密码" show-password></el-input>
    </el-form-item>
    
    <el-form-item>
      <el-button type="primary" @click="handleSave">保存连接</el-button>
      <el-button type="success" @click="handleTest">测试连接</el-button>
      <el-button type="info" @click="handleCancel">取消并回退至默认MySQL</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue';

const props = defineProps({
  initialData: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['save', 'test', 'revert-fallback']);
const formRef = ref(null);

// 【核心逻辑】：固化一个永远不会消失的默认 MySQL 连接配置
const persistentMysqlFallback = {
  name: '默认MySQL备用连接',
  dbType: 'mysql',
  host: '127.0.0.1',
  port: '3306',
  database: 'test',    // 填入你默认的库名
  username: 'root',    // 填入你默认的账号
  password: 'root'     // 填入你默认的密码
};

const connectionForm = ref({ ...persistentMysqlFallback });

// 校验规则
const rules = ref({
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  dbType: [{ required: true, message: '请选择数据库类型', trigger: 'change' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'blur' }],
  database: [{ required: true, message: '请输入数据库名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }]
});

// 监听弹窗传入的数据，如果有数据说明是“编辑”，如果没有则是“新建”
watch(() => props.initialData, (newVal) => {
  if (newVal) {
    connectionForm.value = { ...newVal };
  } else {
    connectionForm.value = { ...persistentMysqlFallback };
  }
}, { immediate: true });

// 监听数据库类型变化，自动填充默认端口 (仅在非回显数据时触发)
watch(() => connectionForm.value.dbType, (newType) => {
  const portMap = { mysql: '3306', dm: '5236', kingbase: '5432', postgresql: '5432' };
  if (portMap[newType] && (!props.initialData || props.initialData.dbType !== newType)) {
    connectionForm.value.port = portMap[newType];
  }
});

// 保存逻辑
const handleSave = async () => {
  if (!formRef.value) return;
  await formRef.value.validate((valid) => {
    if (valid) {
      // 把当前表单的数据发给父组件处理
      emit('save', { ...connectionForm.value });
    }
  });
};

const handleTest = () => {
  emit('test', { ...connectionForm.value });
};

// 【核心逻辑】：全新的取消行为
const handleCancel = () => {
  // 1. 不触发关闭弹窗的动作
  // 2. 将表单内容强制覆盖为固化的默认 MySQL 信息
  connectionForm.value = { ...persistentMysqlFallback };
  
  // 3. 通知父组件：用户点了回退。防止用户在编辑状态下点回退后点保存，导致原连接被覆盖。
  emit('revert-fallback', persistentMysqlFallback);
};
</script>