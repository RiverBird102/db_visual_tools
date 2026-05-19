const odbc = require('odbc'); // 通用ODBC驱动

// 数据库连接池
const connections = {};

function normalizeInt(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function isPgFamily(dbType) {
  return dbType === 'postgresql' || dbType === 'kingbase' || dbType === 'gauss';
}

function pickFirst(row, keys) {
  if (!row) return undefined;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

async function withConnection(config, fn) {
  const { dbType, host, port, username, password, database } = config;

  if (dbType === 'dm') {
    const connectionString = `DRIVER={DM8 ODBC DRIVER};SERVER=${host || '127.0.0.1'};PORT=${normalizeInt(port) || 5236};DATABASE=${database || 'DMHR'};UID=${username || 'SYSDBA'};PWD=${password || 'SYSDBA'};`;
    const conn = await odbc.connect(connectionString);
    try {
      return await fn({ dbType, conn });
    } finally {
      await conn.close().catch(() => {});
    }
  }

  if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host,
      port: normalizeInt(port),
      user: username,
      password,
      database
    });
    try {
      return await fn({ dbType, conn });
    } finally {
      await conn.end().catch(() => {});
    }
  }

  if (isPgFamily(dbType)) {
    const { Client } = require('pg');
    const client = new Client({
      host,
      port: normalizeInt(port),
      user: username,
      password,
      database
    });
    try {
      await client.connect();
      return await fn({ dbType, conn: client });
    } finally {
      await client.end().catch(() => {});
    }
  }

  throw new Error(`暂不支持的数据库类型: ${dbType}`);
}

async function testConnection(config) {
  const { dbType, host, port, username, password, database } = config;
  
  if (dbType === 'dm') {
    const connectionString = `DRIVER={DM8 ODBC DRIVER};SERVER=${host || '127.0.0.1'};PORT=${port || 5236};DATABASE=${database || 'DMHR'};UID=${username || 'SYSDBA'};PWD=${password || 'SYSDBA'};`;
    let connection;
    try {
      connection = await odbc.connect(connectionString);
      await connection.query('SELECT 1 FROM DUAL');
      return { message: '本地达梦数据库连接成功（ODBC）' };
    } catch (error) {
      throw new Error(`达梦连接失败: ${error.message}`);
    } finally {
      if (connection) await connection.close();
    }
  }
  else if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    let connection;
    try {
      connection = await mysql.createConnection({
        host,
        port: port ? parseInt(port) : undefined,
        user: username,
        password,
        database
      });
      await connection.connect();
      return { message: 'MySQL连接成功' };
    } catch (error) {
      throw new Error(`MySQL连接失败: ${error.message}`);
    } finally {
      if (connection) await connection.end();
    }
  }
  else if (dbType === 'postgresql' || dbType === 'kingbase' || dbType === 'gauss') {
    const { Client } = require('pg');
    const client = new Client({
      host,
      port: port ? parseInt(port) : undefined,
      user: username,
      password,
      database
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return { message: '连接成功' };
    } catch (error) {
      throw new Error(`PostgreSQL连接失败: ${error.message}`);
    } finally {
      await client.end().catch(() => {});
    }
  }

  throw new Error(`暂不支持的数据库类型: ${dbType}`);
}

async function listSchemas(config) {
  return withConnection(config, async ({ dbType, conn }) => {
    if (dbType === 'dm') {
      try {
        const rows = await conn.query("SELECT USERNAME AS name FROM ALL_USERS WHERE USERNAME NOT IN ('SYS', 'SYSSSO', 'SYSAUDITOR', 'SYSINFO', 'CTXSYS') ORDER BY USERNAME");
        if (rows && rows.length > 0) {
          return rows.map(r => pickFirst(r, ['name', 'NAME', 'USERNAME'])).filter(Boolean).map(String);
        }
      } catch (error) {
        console.warn("达梦获取模式失败，可能权限受限，降级为当前用户:", error);
      }
      return [String(config.username || 'SYSDBA').toUpperCase()];
    }

    if (dbType === 'mysql') {
      const [rows] = await conn.query('SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME');
      return rows.map(r => r.name);
    }
    
    // 【核心修改】：过滤人大金仓等 PG 系数据库的内置系统 Schema
    if (isPgFamily(dbType)) {
      const result = await conn.query(
        `SELECT nspname AS name 
         FROM pg_namespace 
         WHERE nspname NOT LIKE 'pg_%' 
           AND nspname <> 'information_schema' 
           AND nspname NOT LIKE 'sys%' 
           AND nspname NOT LIKE 'dbms_%' 
           AND nspname NOT LIKE 'kdb_%'
           AND nspname NOT IN ('anon', 'perf', 'src_restrict', 'wmsys', 'xlog_record_read', 'sysaudit', 'sysmac', 'sys_catalog', 'sys_hm') 
         ORDER BY nspname`
      );
      return result.rows.map(r => r.name);
    }
    return [];
  });
}

async function listTables(config, { schema } = {}) {
  return withConnection(config, async ({ dbType, conn }) => {
    if (dbType === 'mysql') {
      const db = schema || config.database;
      const [rows] = await conn.query(
        'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME',
        [db]
      );
      return rows.map(r => r.name);
    }
    if (isPgFamily(dbType)) {
      const sch = schema || 'public';
      const result = await conn.query(
        'SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
        [sch]
      );
      return result.rows.map(r => r.name);
    }
    
    if (dbType === 'dm') {
      const owner = String(schema || config.username || 'SYSDBA').toUpperCase();
      const rows = await conn.query(
        'SELECT TABLE_NAME AS name FROM ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME',
        [owner]
      );
      return (rows || [])
        .map(r => pickFirst(r, ['name', 'NAME', 'TABLE_NAME']))
        .filter(Boolean)
        .map(v => String(v));
    }
    return [];
  });
}

async function getTableColumns(config, { schema, table } = {}) {
  if (!table) throw new Error('table不能为空');
  return withConnection(config, async ({ dbType, conn }) => {
    if (dbType === 'mysql') {
      const db = schema || config.database;
      const [rows] = await conn.query(
        `SELECT 
            COLUMN_NAME AS name,
            DATA_TYPE AS dataType,
            CHARACTER_MAXIMUM_LENGTH AS charLength,
            NUMERIC_PRECISION AS numPrecision,
            NUMERIC_SCALE AS numScale,
            IS_NULLABLE AS isNullable,
            COLUMN_DEFAULT AS defaultValue,
            EXTRA AS extra,
            COLUMN_KEY AS columnKey
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        [db, table]
      );
      return rows.map(r => ({
        name: r.name,
        dataType: r.dataType,
        length: r.charLength ?? r.numPrecision ?? null,
        scale: r.numScale ?? null,
        notNull: String(r.isNullable).toUpperCase() === 'NO',
        defaultValue: r.defaultValue,
        primaryKey: r.columnKey === 'PRI',
        autoIncrement: typeof r.extra === 'string' && r.extra.toLowerCase().includes('auto_increment')
      }));
    }

    if (isPgFamily(dbType)) {
      const sch = schema || 'public';
      const result = await conn.query(
        `SELECT
            a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS fullType,
            NOT a.attnotnull AS isNullable,
            pg_get_expr(ad.adbin, ad.adrelid) AS defaultValue,
            (ct.contype = 'p') AS primaryKey
          FROM pg_attribute a
          JOIN pg_class c ON a.attrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
          LEFT JOIN pg_constraint ct ON ct.conrelid = c.oid AND a.attnum = ANY (ct.conkey) AND ct.contype = 'p'
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum`,
        [sch, table]
      );
      
      return result.rows.map(r => {
        // 🌟 核心修改区域：智能拆分 PG 系数据库的类型和精度
        let typeName = r.fullType || '';
        let parsedLen = null;
        
        // 匹配类似 "character varying(255)" 或 "numeric(10,2)"
        // 正则解释：匹配字母/下划线/空格，然后匹配括号里的内容
        const match = typeName.match(/^([a-zA-Z_\s]+)\(([^)]+)\)/);
        if (match) {
          typeName = match[1].trim();     // 拿到干净的类型，例如 "character varying"
          parsedLen = match[2].trim();    // 拿到纯精度，例如 "255" 或 "10,2"
        }

        return {
          name: r.name,
          dataType: typeName.toUpperCase(), // 统一转大写，方便前端下拉框匹配
          length: parsedLen,                // 🎯 填入解析好的真实精度，不再写死 null！
          scale: null,
          notNull: String(r.isNullable).toUpperCase() === 'NO',
          defaultValue: r.defaultValue,
          primaryKey: !!r.primaryKey,
          autoIncrement: typeof r.defaultValue === 'string' && r.defaultValue.includes('nextval(')
        };
      });
    }

    if (dbType === 'dm') {
      const owner = String(schema || config.username || 'SYSDBA').toUpperCase();
      const tableName = String(table).toUpperCase();

      const pkRows = await conn.query(
        `SELECT col.COLUMN_NAME AS name
         FROM ALL_CONSTRAINTS con
         JOIN ALL_CONS_COLUMNS col ON con.CONSTRAINT_NAME = col.CONSTRAINT_NAME AND con.OWNER = col.OWNER
         WHERE con.CONSTRAINT_TYPE = 'P' AND con.TABLE_NAME = ? AND con.OWNER = ?`,
        [tableName, owner]
      );
      const pkSet = new Set(
        (pkRows || [])
          .map(r => pickFirst(r, ['name', 'NAME', 'COLUMN_NAME']))
          .filter(Boolean)
          .map(v => String(v).toUpperCase())
      );
      
      const rows = await conn.query(
        `SELECT
            COLUMN_NAME AS name,
            DATA_TYPE AS dataType,
            DATA_LENGTH AS dataLength,
            DATA_PRECISION AS dataPrecision,
            DATA_SCALE AS dataScale,
            NULLABLE AS nullable,
            DATA_DEFAULT AS defaultValue
          FROM ALL_TAB_COLUMNS
          WHERE TABLE_NAME = ? AND OWNER = ?
          ORDER BY COLUMN_ID`,
        [tableName, owner]
      );
      return (rows || []).map(r => {
        const colName = pickFirst(r, ['name', 'NAME', 'COLUMN_NAME']);
        const nullable = pickFirst(r, ['nullable', 'NULLABLE']);
        const dataType = pickFirst(r, ['dataType', 'DATATYPE', 'DATA_TYPE']);
        const dataLength = pickFirst(r, ['dataLength', 'DATA_LENGTH']);
        const dataPrecision = pickFirst(r, ['dataPrecision', 'DATA_PRECISION']);
        const dataScale = pickFirst(r, ['dataScale', 'DATA_SCALE']);
        const defaultValue = pickFirst(r, ['defaultValue', 'DEFAULTVALUE', 'DATA_DEFAULT']);

        return {
          name: colName,
          dataType,
          length: dataLength ?? dataPrecision ?? null,
          scale: dataScale ?? null,
          notNull: String(nullable).toUpperCase() === 'N',
          defaultValue,
          primaryKey: pkSet.has(String(colName).toUpperCase()),
          autoIncrement: false
        };
      });
    }

    return [];
  });
}


// 在 config/db-config.js 中替换原有的方法
async function getRelationships(connection, { schema }) {
    let sql = "";
    
    if (connection.dbType === 'mysql') {
      sql = `
        SELECT 
          TABLE_NAME as source_table, 
          COLUMN_NAME as source_column, 
          REFERENCED_TABLE_NAME as target_table, 
          REFERENCED_COLUMN_NAME as target_column
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '${schema}' AND REFERENCED_TABLE_NAME IS NOT NULL;
      `;
    } else {
      // 针对达梦 (DM) / Oracle 等信创数据库的专属外键查询逻辑
      // 达梦中的 OWNER 等同于 Schema 模式名
      sql = `
        SELECT
            a.TABLE_NAME as "source_table",
            b.COLUMN_NAME as "source_column",
            c.TABLE_NAME as "target_table",
            d.COLUMN_NAME as "target_column"
        FROM
            ALL_CONSTRAINTS a
        JOIN ALL_CONS_COLUMNS b ON a.CONSTRAINT_NAME = b.CONSTRAINT_NAME AND a.OWNER = b.OWNER
        JOIN ALL_CONSTRAINTS c ON a.R_CONSTRAINT_NAME = c.CONSTRAINT_NAME AND a.OWNER = c.OWNER
        JOIN ALL_CONS_COLUMNS d ON c.CONSTRAINT_NAME = d.CONSTRAINT_NAME AND c.OWNER = d.OWNER
        WHERE
            a.CONSTRAINT_TYPE = 'R'
            AND a.OWNER = '${schema}'
      `;
    }

    try {
      const res = await this.executeSql(connection, sql, schema);
      const rows = res.rows || [];
      
      // 兼容性处理：达梦等数据库返回的字段名默认是大写的，这里强制映射为前端需要的小写字段
      return rows.map(row => ({
        source_table: row.source_table || row.SOURCE_TABLE,
        source_column: row.source_column || row.SOURCE_COLUMN,
        target_table: row.target_table || row.TARGET_TABLE,
        target_column: row.target_column || row.TARGET_COLUMN
      }));
    } catch (e) {
      console.error('获取表关联关系失败:', e);
      return [];
    }
}


/**
 * 执行SQL（支持判断 DML/DDL 并返回具体提示）
 */
async function executeSql(connectionConfig, sql, targetSchema) {
  const { dbType, host, port, username, password, database } = connectionConfig;
  const activeDatabase = targetSchema || database;
  
  if (dbType === 'dm') {
    const connectionString = `DRIVER={DM8 ODBC DRIVER};SERVER=${host || '127.0.0.1'};PORT=${port || 5236};DATABASE=${database || 'DMHR'};UID=${username || 'SYSDBA'};PWD=${password || 'SYSDBA'};`;
    const connection = await odbc.connect(connectionString);
    try {
      if (targetSchema) await connection.query(`SET SCHEMA "${targetSchema}"`);

      let cleanSql = typeof sql === 'string' ? sql.trim() : '';
      if (cleanSql.endsWith(';')) cleanSql = cleanSql.slice(0, -1).trim();

      const result = await connection.query(cleanSql);
      
      const isQuery = /^\s*(SELECT|WITH|SHOW|DESCRIBE|DESC)\b/i.test(cleanSql);
      
      if (isQuery) {
        return {
          isQuery: true,
          rows: Array.isArray(result) ? result : [],
          fields: (result.columns || []).map(c => c.name) || (result.length > 0 ? Object.keys(result[0]) : [])
        };
      } else {
        return {
          isQuery: false,
          affectedRows: result.count !== undefined ? result.count : 0,
          message: '执行成功 (OK)'
        };
      }
    } catch (error) {
      const details = error && Array.isArray(error.odbcErrors) ? error.odbcErrors.map(e => `[odbc] message=${e.message}`).join(' | ') : '';
      throw new Error(`SQL执行失败: ${error.message}${details ? ` (${details})` : ''}`);
    } finally {
      await connection.close();
    }
  }
  else if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host, port: port ? parseInt(port) : undefined, user: username, password, database: activeDatabase
    });
    try {
      const [result, fields] = await connection.query(sql);
      
      if (fields) {
        return {
          isQuery: true,
          rows: result, 
          fields: fields.map(f => f.name)
        };
      } else {
        return {
          isQuery: false,
          affectedRows: result.affectedRows,
          message: result.warningStatus ? '执行成功，但带有警告' : '执行成功 (OK)'
        };
      }
    } catch (error) {
      throw new Error(`SQL执行失败: ${error.message}`);
    } finally {
      await connection.end();
    }
  }
  else if (dbType === 'postgresql' || dbType === 'kingbase' || dbType === 'gauss') {
    const { Client } = require('pg');
    const client = new Client({
      host, port: port ? parseInt(port) : undefined, user: username, password, database
    });
    try {
      await client.connect();
      if (targetSchema) await client.query(`SET search_path TO "${targetSchema}"`);
      const result = await client.query(sql);
      
      if (result.command === 'SELECT' || result.fields) {
        return {
          isQuery: true,
          rows: result.rows || [],
          fields: (result.fields || []).map(f => f.name)
        };
      } else {
        return {
          isQuery: false,
          affectedRows: result.rowCount,
          message: `${result.command} 执行成功`
        };
      }
    } catch (error) {
      throw new Error(`SQL执行失败: ${error.message}`);
    } finally {
      await client.end().catch(() => {});
    }
  }

  throw new Error(`暂不支持的数据库类型: ${dbType}`);
}

async function getXinchuangRole(config) {
  return withConnection(config, async ({ dbType, conn }) => {
    const user = String(config.username).toUpperCase();
    let role = 'NORMAL'; // 默认普通用户
    
    if (dbType === 'dm') {
      // 达梦的内置三权账号
      if (user === 'SYSDBA') role = 'DBA';
      else if (user === 'SYSSSO') role = 'SSO';
      else if (user === 'SYSAUDITOR') role = 'AUDITOR';
      return { user, role, message: `已识别达梦三权分立角色: ${role}` };
    } 
    
    if (dbType === 'kingbase' || dbType === 'postgresql' || dbType === 'gauss') {
      // 人大金仓/PG系 查询用户是否具有审计(AUDIT)或超级管理员权限
      const res = await conn.query(`SELECT rolsuper, rolaudit FROM pg_authid WHERE rolname = $1`, [config.username]);
      if (res.rows && res.rows.length > 0) {
        if (res.rows[0].rolaudit) role = 'AUDITOR';
        else if (res.rows[0].rolsuper) role = 'DBA';
      }
      return { user, role, message: `已识别人大金仓/PG系安全角色: ${role}` };
    }
    
    return { user, role: 'DBA', message: '通用数据库环境，默认放行' };
  });
}

/**
 * 获取国产数据库的表空间及物理存储使用情况
 */
async function getTablespaceUsage(config) {
  return withConnection(config, async ({ dbType, conn }) => {
    if (dbType === 'dm') {
      // 达梦专属：查询表空间物理文件及大小 (返回 MB)
      const rows = await conn.query(`
        SELECT 
          t.NAME AS tablespace_name, 
          d.PATH AS file_path, 
          (d.TOTAL_SIZE * 8 / 1024) AS total_mb, 
          (d.FREE_SIZE * 8 / 1024) AS free_mb
        FROM V$TABLESPACE t 
        JOIN V$DATAFILE d ON t.ID = d.GROUP_ID
      `);
      // 统一小写属性名，方便前端取值
      return rows.map(r => ({
        tablespace_name: r.TABLESPACE_NAME || r.NAME || r.tablespace_name,
        file_path: r.FILE_PATH || r.PATH || r.file_path,
        total_mb: r.TOTAL_MB || r.total_mb,
        free_mb: r.FREE_MB || r.free_mb
      }));
    }
    
    if (dbType === 'kingbase' || dbType === 'postgresql' || dbType === 'gauss') {
      // 人大金仓专属：查询表空间及物理路径，计算 MB
      const res = await conn.query(`
        SELECT 
          spcname AS tablespace_name,
          pg_catalog.pg_tablespace_location(oid) AS file_path,
          (pg_tablespace_size(spcname) / 1048576.0) AS total_mb
        FROM pg_tablespace
      `);
      return res.rows;
    }
    
    throw new Error('通用数据库(如MySQL)不支持底层的物理表空间透视');
  });
}

// 获取国产数据库的底层执行计划
async function getExplainPlan(connectionConfig, sql, targetSchema) {
  return withConnection(connectionConfig, async ({ dbType, conn }) => {
    // 自动对用户的 SQL 追加 EXPLAIN 前缀
    const explainSql = `EXPLAIN ${sql}`;
    
    if (dbType === 'dm') {
      if (targetSchema) await conn.query(`SET SCHEMA "${targetSchema}"`);
      const result = await conn.query(explainSql);
      // 达梦的执行计划通常返回在单个字段中，提取纯文本
      return result.map(r => Object.values(r)[0]).join('\n');
    }
    
    if (dbType === 'kingbase' || dbType === 'postgresql' || dbType === 'gauss') {
      if (targetSchema) await conn.query(`SET search_path TO "${targetSchema}"`);
      const result = await conn.query(explainSql);
      // 人大金仓的执行计划在 QUERY PLAN 字段中
      return result.rows.map(r => r['QUERY PLAN']).join('\n');
    }
    
    // MySQL 兼容
    const [result] = await conn.query(explainSql);
    return JSON.stringify(result, null, 2);
  });
}

// 别忘了在 module.exports 中导出
module.exports = {
  // ... 其他原有导出
  getExplainPlan 
};



module.exports = {
  testConnection,
  executeSql,
  listSchemas,
  listTables,
  getTableColumns,
  getRelationships,
  getXinchuangRole,
  getTablespaceUsage,
  getExplainPlan
};