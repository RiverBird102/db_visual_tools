<template>
  <div class="er-container">
    <div class="er-header">
      <div class="controls flex items-center gap-4">
        <el-select 
          v-model="selectedTables" 
          multiple 
          collapse-tags
          collapse-tags-tooltip
          placeholder="请选择要分析的表" 
          style="width: 300px"
          size="small"
          @change="renderChart"
        >
          <el-option v-for="name in allTables" :key="name" :label="name" :value="name" />
        </el-select>

        <div class="flex items-center gap-2 text-sm text-slate-600" style="width: 200px;">
          <span>节点间距:</span>
          <el-slider v-model="layoutForce" :min="300" :max="3000" :step="100" size="small" @change="renderChart" class="flex-1"/>
        </div>
      </div>

      <div class="actions">
        <el-button type="success" size="small" @click="exportImage">
          <Download :size="14" class="mr-1"/> 导出实体关系图
        </el-button>
        <el-button type="primary" size="small" @click="loadData" :loading="loading">
          <RefreshCw :size="14" class="mr-1" :class="{'animate-spin': loading}"/> 刷新模型
        </el-button>
      </div>
    </div>

    <div ref="chartRef" class="chart-box" v-loading="loading" element-loading-text="正在解析数据库元数据与外键关系..."></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { RefreshCw, Download } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const props = defineProps({
  connectionId: String,
  schema: String
});

const chartRef = ref(null);
let myChart = null;

// 状态数据
const loading = ref(false);
const allTables = ref([]);
const allRels = ref([]);
const tableColumnsMap = ref({}); // 存储每张表的字段信息
const selectedTables = ref([]);
const layoutForce = ref(1500); // 默认斥力加大，因为卡片变大了

// 初始化拉取数据
const loadData = async () => {
  loading.value = true;
  try {
    // 1. 获取所有表名
    const tablesRes = await window.electronAPI.listTables({ connectionId: props.connectionId, schema: props.schema });
    allTables.value = tablesRes.data || [];
    
    // 2. 获取外键关系
    const relsRes = await window.electronAPI.getRelationships({ connectionId: props.connectionId, schema: props.schema });
    allRels.value = relsRes.data || [];

    // 3. 【核心新增】并发获取所有选中表的具体字段信息
    const columnsPromises = allTables.value.map(tableName => 
      window.electronAPI.getTableColumns({ connectionId: props.connectionId, schema: props.schema, table: tableName })
    );
    const columnsResults = await Promise.all(columnsPromises);
    
    const colMap = {};
    allTables.value.forEach((tableName, index) => {
      colMap[tableName] = columnsResults[index].data || [];
    });
    tableColumnsMap.value = colMap;

    // 默认全选
    selectedTables.value = [...allTables.value];
    
    renderChart();
  } catch (e) {
    ElMessage.error('加载拓扑数据失败: ' + e.message);
  } finally {
    loading.value = false;
  }
};

// 核心渲染逻辑
const renderChart = () => {
  if (!myChart) myChart = echarts.init(chartRef.value);
  myChart.clear(); // 清理旧画布

  // 1. 构建节点：使用 ECharts 富文本把节点画成 "表结构卡片"
  const nodes = selectedTables.value.map(tableName => {
    const columns = tableColumnsMap.value[tableName] || [];
    
    // 拼接富文本字符串
    let labelFormatter = `{title|${tableName}}`;
    columns.forEach(col => {
      const isPk = col.primaryKey;
      const icon = isPk ? '🔑' : '📄';
      // 截断超长的字段类型
      const shortType = (col.dataType || 'VARCHAR').split('(')[0].substring(0, 10);
      labelFormatter += `\n{icon|${icon}} {colName|${col.name}} {colType|${shortType}}`;
    });

    return {
      name: tableName,
      value: tableName,
      symbol: 'rect', // 使用矩形作为基础形状
      symbolSize: [220, 40 + columns.length * 20], // 动态计算高度，防止线穿透卡片
      itemStyle: { color: 'transparent' }, // 隐藏默认矩形，完全依赖 label 绘制
      draggable: true,
      label: {
        show: true,
        position: 'inside',
        formatter: labelFormatter,
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        borderWidth: 1,
        borderRadius: 6,
        shadowColor: 'rgba(0, 0, 0, 0.08)',
        shadowBlur: 10,
        rich: {
          title: {
            backgroundColor: '#3b82f6', // 蓝色的表头
            color: '#ffffff',
            align: 'center',
            fontWeight: 'bold',
            padding: [10, 0],
            width: 220,
            borderRadius: [5, 5, 0, 0]
          },
          icon: { width: 20, align: 'center', padding: [4, 0] },
          colName: { width: 110, align: 'left', color: '#334155', fontWeight: '500', padding: [4, 0] },
          colType: { width: 70, align: 'right', color: '#94a3b8', fontSize: 10, padding: [4, 10, 4, 0] }
        }
      }
    };
  });

  // 2. 构建连线：标明具体是哪个字段连哪个字段
  const links = allRels.value
    .filter(r => selectedTables.value.includes(r.source_table) && selectedTables.value.includes(r.target_table))
    .map(r => ({
      source: r.source_table,
      target: r.target_table,
      label: { 
        show: true, 
        formatter: `${r.source_column}\n ⬇ \n${r.target_column}`, // 连线上显示具体的关联字段
        fontSize: 10, 
        color: '#ef4444',
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: [2, 4],
        borderRadius: 4
      },
      lineStyle: { width: 2, curveness: 0.1, color: '#94a3b8' }
    }));

  const option = {
    backgroundColor: '#f8fafc',
    tooltip: { show: false }, // 卡片已经够详细了，关掉默认的 tooltip
    animationDurationUpdate: 1500,
    animationEasingUpdate: 'quinticInOut',
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links: links,
      roam: true, // 允许鼠标缩放和平移
      force: {
        repulsion: layoutForce.value, // 斥力，防止大卡片重叠
        edgeLength: [200, 400], // 线的长度
        gravity: 0.05 // 向中心的引力
      },
      edgeSymbol: ['circle', 'arrow'],
      edgeSymbolSize: [4, 10],
      emphasis: { 
        focus: 'adjacency', 
        lineStyle: { width: 4, color: '#f59e0b' } 
      }
    }]
  };

  myChart.hideLoading();
  myChart.setOption(option);
};

const exportImage = () => {
  if (!myChart) return;
  const url = myChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#f8fafc' });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.schema}_实体关系图(ER).png`;
  a.click();
  ElMessage.success('高清 ER 图已导出！');
};

onMounted(() => {
  loadData();
  window.addEventListener('resize', () => myChart?.resize());
});

onUnmounted(() => {
  myChart?.dispose();
});
</script>

<style scoped>
.er-container { height: 100%; display: flex; flex-direction: column; background: #fff; }
.er-header { padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background-color: #ffffff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); z-index: 10; }
.chart-box { flex: 1; min-height: 0; }
</style>