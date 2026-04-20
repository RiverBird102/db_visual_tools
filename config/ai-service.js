const { OpenAI } = require('openai');
const dbConfig = require('./db-config');

class AIService {
  constructor(store) {
    this.store = store;
  }

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
      
      // 2. 为了避免上下文过大（Token超出），我们最多取前 10 个表的结构（或者你可以优化为只取用户关心的表）
      // 这里我们为了演示，取全部或最多20个表
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

  // 将自然语言转换为 SQL (NL2SQL)
  async generateSql(prompt, connectionConfig, schema) {
    try {
      const client = this.getClient();
      const aiConfig = this.store.get('ai.config');
      
      // 获取数据库上下文
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
}

module.exports = AIService;