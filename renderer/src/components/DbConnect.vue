<template>
  <el-form :model="connectionForm" :rules="rules" ref="formRef" label-width="100px">
    <el-form-item label="连接名称" prop="name">
      <el-input v-model="connectionForm.name" placeholder="例如: 生产环境主库"></el-input>
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
      <el-button @click="handleCancel">取消</el-button>
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

// 新增了一个 'cancel' 事件
const emit = defineEmits(['save', 'test', 'cancel']);
const formRef = ref(null);

// 生成一个纯净的空白表单数据
const getBlankForm = () => ({
  name: '',
  dbType: 'mysql', // 默认选中mysql，防止下拉框空白
  host: '',
  port: '3306',
  database: '',
  username: '',
  password: ''
});

const connectionForm = ref(getBlankForm());

// 校验规则
const rules = ref({
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  dbType: [{ required: true, message: '请选择数据库类型', trigger: 'change' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'blur' }],
  database: [{ required: true, message: '请输入数据库名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }]
});

// 监听弹窗传入的数据
watch(() => props.initialData, (newVal) => {
  if (newVal) {
    // 【编辑模式】：把传进来的数据直接赋给表单
    connectionForm.value = { ...newVal };
  } else {
    // 【新建模式】：彻底清空表单，并清除之前的校验红字提示
    if (formRef.value) formRef.value.resetFields();
    connectionForm.value = getBlankForm();
  }
}, { immediate: true });

// 监听数据库类型变化，自动填充默认端口 (提升体验用)
watch(() => connectionForm.value.dbType, (newType) => {
  const portMap = { mysql: '3306', dm: '5236', kingbase: '5432', postgresql: '5432' };
  // 只有在手动切换类型时才改变端口，如果是刚打开编辑页面(回显数据)，则不覆盖用户自己填的端口
  if (portMap[newType] && (!props.initialData || props.initialData.dbType !== newType)) {
    connectionForm.value.port = portMap[newType];
  }
});

// 保存逻辑
const handleSave = async () => {
  if (!formRef.value) return;
  await formRef.value.validate((valid) => {
    if (valid) {
      emit('save', { ...connectionForm.value });
    }
  });
};

const handleTest = () => {
  emit('test', { ...connectionForm.value });
};

// 取消逻辑：直接告诉父组件“我点取消了”
const handleCancel = () => {
  emit('cancel');
};
</script>