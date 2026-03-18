<template>
  <div class="data-viewer">
    <el-alert
      v-if="error"
      title="执行失败"
      type="error"
      :description="error"
      closable
      show-icon
      style="margin-bottom: 10px;"
    ></el-alert>
    
    <el-table
      :data="data"
      border
      stripe
      v-loading="loading"
      style="width: 100%; height: 100%;"
      max-height="100%"
    >
      <el-table-column
        v-for="(col, index) in columns"
        :key="index"
        :prop="col"
        :label="col"
      ></el-table-column>
    </el-table>
    
    <div v-if="data.length === 0 && !loading && !error" class="empty-tip">
      <el-empty description="暂无数据，请执行SQL查询"></el-empty>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
});
</script>

<style scoped>
.data-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-tip {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>