const { OpenAI } = require('openai');
const dbConfig = require('./db-config');

class AIService {
  constructor(store) {
    this.store = store;
  }

  // ==========================================
  // 基础能力：获取 AI 客户端与上下文
  // ==========================================
  
  // 获取 AI 客户端实例
  getClient() {
    const config = this.store.get('ai.config', {
      provider: 'openai', // 默认提供商
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo'
    });

    if (!config.apiKey) {
      throw new Error('未配置 AI API Key，请先在设置中配置。');
    }

    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
    });
  }

  // 获取当前数据库上下文（表名、字段等），用于辅助 AI 生成准确的 SQL
  async getDatabaseContext(connection, schema) {
    try {
      // 1. 获取该 schema 下的所有表
      const tables = await dbConfig.listTables(connection, { schema });
      
      let schemaContext = `数据库类型: ${connection.dbType}\n数据库/模式: ${schema || '默认'}\n包含以下表及字段结构:\n\n`;
      
      // 2. 为了避免上下文过大（Token超出），最多取前 20 个表的结构
      const limitTables = tables.slice(0, 20);
      
      for (const table of limitTables) {
        const columns = await dbConfig.getTableColumns(connection, { schema, table });
        const colDetails = columns.map(c => `${c.name} (${c.dataType}) ${c.primaryKey ? 'PK' : ''}`).join(', ');
        schemaContext += `- 表名: ${table}\n  字段: ${colDetails}\n`;
      }
      
      return schemaContext;
    } catch (error) {
      console.warn('获取数据库上下文失败，将不使用上下文辅助生成', error);
      return `数据库类型: ${connection.dbType}\n`;
    }
  }

  // ==========================================
  // 【功能一】：将自然语言转换为 SQL (NL2SQL)
  // ==========================================
  async generateSql(prompt, connectionConfig, schema) {
    try {
      const client = this.getClient();
      const aiConfig = this.store.get('ai.config');
      
      let dbContext = '';
      if (connectionConfig) {
        dbContext = await this.getDatabaseContext(connectionConfig, schema);
      }

      const systemPrompt = `你是一个专业的数据库专家。请根据用户的自然语言需求，生成准确的 SQL 语句。
请遵循以下规则：
1. 只输出 SQL 语句，不要包含任何解释、markdown 代码块标记 (如 \`\`\`sql 等)。
2. 生成的 SQL 必须符合目标数据库的方言语法。
3. 请参考提供的数据库表结构上下文。

${dbContext ? `【数据库上下文信息】\n${dbContext}` : ''}`;

      const response = await client.chat.completions.create({
        model: aiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `需求：${prompt}` }
        ],
        temperature: 0.1, // 低温度，保证输出的确定性
      });

      let sql = response.choices[0].message.content.trim();
      // 移除可能存在的 markdown 标记
      sql = sql.replace(/^```sql/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

      return { success: true, sql };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // 【功能二】：AI 慢查询诊断与索引推荐
  // ==========================================
  async analyzeSlowQuery(sql, explainPlan, columns) {
    try {
      const client = this.getClient();
      const aiConfig = this.store.get('ai.config');

      const prompt = `
你是一名资深的数据库专家(DBA)。请分析以下慢查询并给出优化建议。

【原始 SQL】: 
${sql}

【执行计划 (Explain Plan)】: 
${explainPlan}

【相关表结构信息】: 
${JSON.stringify(columns, null, 2)}

请从以下维度进行深度分析，并以格式清晰的 Markdown 格式回复：
1. **🚀 性能瓶颈分析**：指出为什么慢（结合执行计划，如是否发生了全表扫描、隐式类型转换、不合理的嵌套循环关联等）。
2. **🎯 索引优化建议**：如果可以通过加索引解决，请直接给出具体的 \`CREATE INDEX\` SQL 语句，并解释为什么这个索引有效。
3. **✍️ SQL 改写建议**：如果当前写法不佳，请提供优化后的 SQL 写法示例（如避免使用 SELECT *，优化 IN 子查询为 JOIN 等）。
4. **💡 综合建议**：其他层面的优化建议（如表数据量过大建议分区、需要更新统计信息等）。
`;

      const response = await client.chat.completions.create({
        model: aiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一个专业的国产数据库(达梦/人大金仓/openGauss)调优助手，精通 SQL 性能诊断。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3 
      });

      return {
        success: true,
        analysis: response.choices[0].message.content
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // 【功能三】：基于表结构的智能测试数据生成
  // ==========================================
  async generateMockData(tableName, columns, count, instruction) {
    try {
      const client = this.getClient();
      const aiConfig = this.store.get('ai.config');

      const prompt = `
你是一名资深的测试工程师兼 DBA。请为数据库表 \`${tableName}\` 生成 ${count} 条高度逼真的测试数据。

【表结构信息】: 
${JSON.stringify(columns, null, 2)}

【用户附加要求】:
${instruction || '无附加要求。'}

请严格遵守以下规则：
1. 请生成符合现实逻辑的数据（例如：真实的中文姓名、11位合法手机号、合理的年龄、符合格式的邮箱、当前时间前后的日期等）。
2. **必须且只能输出可直接执行的 SQL \`INSERT INTO\` 语句**。
3. 为了提高效率，请使用一条 INSERT 语句批量插入多行，如：\`INSERT INTO table_name (c1, c2) VALUES (v1, v2), (v3, v4);\`
4. 字符串必须用单引号 \`'\` 包裹。
5. **绝对不要**包含任何 Markdown 代码块标记（如 \`\`\`sql ）、**绝对不要**有任何前言或后记解释文字！直接输出纯净的 SQL 代码。
`;

      const response = await client.chat.completions.create({
        model: aiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一个严格的 SQL 脚本生成器。你只输出纯 SQL 代码，不输出任何其他文字。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8 // 稍高温度，保证测试数据的多样性
      });

      let sql = response.choices[0].message.content.trim();
      sql = sql.replace(/^```sql/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

      return { success: true, sql };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // 【新增功能四】：AI 数据图表洞察与分析 (Auto-BI)
  // ==========================================
  async generateDataInsight(dataRows) {
    try {
      const client = this.getClient();
      const aiConfig = this.store.get('ai.config');
      
      // 数据量过大时，截取前 50 条防止传入的 Token 超限报错
      const sampleData = dataRows.length > 50 ? dataRows.slice(0, 50) : dataRows;

      const prompt = `
你是一位资深的数据分析师。请分析以下数据库查询结果，并提供两部分内容：图表配置和深度业务洞察。

【数据源】(JSON格式):
${JSON.stringify(sampleData)}

【任务要求】:
1. **必须严格只返回一个 JSON 对象**，绝对不要包含任何 Markdown 标记（如 \`\`\`json ）、前言或解释文字！
2. JSON 必须包含两个字段：\`chartOption\` 和 \`analysis\`。
3. \`chartOption\` 字段：请根据数据的特征，生成一个完整且合法的 ECharts 配置对象 (option)。
   - 自动判断最适合的图表类型（如：有时间维度的用折线图，分类对比用柱状图，占比用饼图）。
   - 必须包含 title, tooltip, legend, xAxis, yAxis, series 等必要组件。
   - 图表设计要美观、现代。
4. \`analysis\` 字段：基于数据特征，写一段 100-200 字左右的深度商业分析或异常预警。

【返回格式示例】:
{
  "chartOption": {
    "title": { "text": "数据趋势分析" },
    "tooltip": { "trigger": "axis" },
    "xAxis": { "type": "category", "data": ["1月", "2月"] },
    "yAxis": { "type": "value" },
    "series": [{ "data": [120, 200], "type": "bar" }]
  },
  "analysis": "数据显示，2月份销量出现显著增长..."
}
`;

      const response = await client.chat.completions.create({
        model: aiConfig.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一个专业的数据可视化与分析引擎，只输出合法的 JSON 字符串。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2 // 低温度保证输出合法的严格 JSON 格式
      });

      let content = response.choices[0].message.content.trim();
      // 容错处理：清除大模型偶尔带上的 markdown json 标记
      content = content.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
      
      const resultJson = JSON.parse(content);
      
      return { 
        success: true, 
        chartOption: resultJson.chartOption,
        analysis: resultJson.analysis
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = AIService;