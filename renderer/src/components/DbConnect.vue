<template>
  <el-form :model="connectionForm" :rules="rules" ref="formRef" label-width="100px">
    <el-form-item label="连接名称" prop="name">
      <el-input v-model="connectionForm.name" placeholder="请输入连接名称"></el-input>
    </el-form-item>
    
    <el-form-item label="数据库类型" prop="dbType">
      <el-select v-model="connectionForm.dbType" placeholder="请选择数据库类型">
        <el-option label="达梦DM" value="dm"></el-option>
        <el-option label="人大金仓" value="kingbase"></el-option>
        <el-option label="华为高斯" value="gauss"></el-option>
        <el-option label="MySQL兼容" value="mysql"></el-option>
        <el-option label="PostgreSQL兼容" value="postgresql"></el-option>
      </el-select>
    </el-form-item>
    
    <el-form-item label="主机地址" prop="host">
      <el-input v-model="connectionForm.host" placeholder="请输入主机地址"></el-input>
    </el-form-item>
    
    <el-form-item label="端口号" prop="port">
      <el-input v-model="connectionForm.port" placeholder="请输入端口号"></el-input>
    </el-form-item>
    
    <el-form-item label="数据库名" prop="database">
      <el-input v-model="connectionForm.database" placeholder="请输入数据库名"></el-input>
    </el-form-item>
    
    <el-form-item label="用户名" prop="username">
      <el-input v-model="connectionForm.username" placeholder="请输入用户名"></el-input>
    </el-form-item>
    
    <el-form-item label="密码" prop="password">
      <el-input v-model="connectionForm.password" type="password" placeholder="请输入密码"></el-input>
    </el-form-item>
    
    <el-form-item>
      <el-button type="primary" @click="handleTest">测试连接</el-button>
      <el-button type="primary" @click="handleSave">保存连接</el-button>
      <el-button @click="handleCancel">取消</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, defineEmits, watch } from 'vue';

const emit = defineEmits(['save', 'test']);
const formRef = ref(null);

// 表单数据
const connectionForm = ref({
  name: '',
  dbType: 'dm',
  host: '127.0.0.1',
  port: '5236',
  database: 'DMHR',
  username: 'SYSDBA',
  password: 'SYSDBA'
});

// 表单校验规则
const rules = ref({
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  dbType: [{ required: true, message: '请选择数据库类型', trigger: 'change' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'blur' }],
  database: [{ required: true, message: '请输入数据库名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }]
});

// 根据数据库类型切换默认端口等
watch(
  () => connectionForm.value.dbType,
  (type) => {
    if (type === 'dm') {
      if (!connectionForm.value.port) connectionForm.value.port = '5236';
      if (!connectionForm.value.database) connectionForm.value.database = 'DMHR';
    } else if (type === 'mysql') {
      if (!connectionForm.value.port) connectionForm.value.port = '3306';
    } else if (type === 'postgresql' || type === 'kingbase' || type === 'gauss') {
      if (!connectionForm.value.port) connectionForm.value.port = '5432';
    }
  }
);

// 测试连接
const handleTest = async () => {
  try {
    await formRef.value.validate();
    emit('test', { ...connectionForm.value });
  } catch (error) {
    console.error('表单校验失败:', error);
  }
};

// 保存连接
const handleSave = async () => {
  try {
    await formRef.value.validate();
    emit('save', { ...connectionForm.value });
  } catch (error) {
    console.error('表单校验失败:', error);
  }
};

// 取消
const handleCancel = () => {
  formRef.value.resetFields();
};
</script>