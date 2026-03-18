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

/**
 * 适配达梦ODBC连接（无需专属Node.js驱动）
 */
async function testConnection(config) {
  const { dbType, host, port, username, password, database } = config;
  
  // 达梦ODBC连接字符串（核心）
  if (dbType === 'dm') {
    const connectionString = `DRIVER={DM8 ODBC DRIVER};SERVER=${host || '127.0.0.1'};PORT=${port || 5236};DATABASE=${database || 'DMHR'};UID=${username || 'SYSDBA'};PWD=${password || 'SYSDBA'};`;
    
    let connection;
    try {
      connection = await odbc.connect(connectionString);
      await connection.query('SELECT 1 FROM DUAL'); // 测试达梦查询
      return { message: '本地达梦数据库连接成功（ODBC）' };
    } catch (error) {
      throw new Error(`达梦连接失败: ${error.message}`);
    } finally {
      if (connection) await connection.close();
    }
  }
  // MySQL 连接
  else if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    let connection;
    try {
      connection = await mysql.createConnection({
        host,
        port: port ? parseInt(port) : undefined, // 不填端口时走驱动默认
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
  // PostgreSQL / 人大金仓 / 华为高斯（均走 PG 协议）
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
  // 达梦这边很多环境对 SYS.SYSUSERS 等系统表权限受限，直接用当前用户名作为唯一 schema，避免 ODBC 报错
  if (config.dbType === 'dm') {
    const name = String(config.username || 'SYSDBA').toUpperCase();
    return [name];
  }

  return withConnection(config, async ({ dbType, conn }) => {
    if (dbType === 'mysql') {
      const [rows] = await conn.query('SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME');
      return rows.map(r => r.name);
    }
    if (isPgFamily(dbType)) {
      const result = await conn.query(
        "SELECT nspname AS name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname"
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
      // DM：默认取当前用户下表
      const rows = await conn.query('SELECT TABLE_NAME AS name FROM USER_TABLES ORDER BY TABLE_NAME');
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
      return result.rows.map(r => ({
        name: r.name,
        dataType: r.fullType,
        length: null,
        scale: null,
        notNull: String(r.isNullable).toUpperCase() === 'NO',
        defaultValue: r.defaultValue,
        primaryKey: !!r.primaryKey,
        autoIncrement: typeof r.defaultValue === 'string' && r.defaultValue.includes('nextval(')
      }));
    }

    if (dbType === 'dm') {
      // DM：列信息 + 主键
      const pkRows = await conn.query(
        `SELECT col.COLUMN_NAME AS name
         FROM USER_CONSTRAINTS con
         JOIN USER_CONS_COLUMNS col ON con.CONSTRAINT_NAME = col.CONSTRAINT_NAME
         WHERE con.CONSTRAINT_TYPE = 'P' AND con.TABLE_NAME = ?`,
        [String(table).toUpperCase()]
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
          FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = ?
          ORDER BY COLUMN_ID`,
        [String(table).toUpperCase()]
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
        autoIncrement: false // DM 自增需 identity/sequence，后续再精确识别
        };
      });
    }

    return [];
  });
}

/**
 * 执行达梦SQL（ODBC方式）
 */
async function executeSql(connectionConfig, sql) {
  const { dbType, host, port, username, password, database } = connectionConfig;
  
  if (dbType === 'dm') {
    const connectionString = `DRIVER={DM8 ODBC DRIVER};SERVER=${host || '127.0.0.1'};PORT=${port || 5236};DATABASE=${database || 'DMHR'};UID=${username || 'SYSDBA'};PWD=${password || 'SYSDBA'};`;
    
    const connection = await odbc.connect(connectionString);
    try {
      // 兼容部分 ODBC 驱动：末尾分号可能导致执行失败
      let cleanSql = typeof sql === 'string' ? sql.trim() : '';
      if (cleanSql.endsWith(';')) cleanSql = cleanSql.slice(0, -1).trim();

      const result = await connection.query(cleanSql);
      // 适配返回格式
      return {
        rows: Array.isArray(result) ? result : [],
        fields: Array.isArray(result) && result.length > 0 ? Object.keys(result[0]) : []
      };
    } catch (error) {
      const details =
        error && Array.isArray(error.odbcErrors)
          ? error.odbcErrors
              .map(e => {
                const state = e.sqlstate ? ` sqlstate=${e.sqlstate}` : '';
                const code = e.code ? ` code=${e.code}` : '';
                const msg = e.message ? ` message=${e.message}` : '';
                return `[odbc]${state}${code}${msg}`.trim();
              })
              .join(' | ')
          : '';
      throw new Error(`SQL执行失败: ${error.message}${details ? ` (${details})` : ''}`);
    } finally {
      await connection.close();
    }
  }
  // MySQL执行
  else if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host,
      port: port ? parseInt(port) : undefined,
      user: username,
      password,
      database
    });
    try {
      const [result] = await connection.execute(sql);
      return {
        rows: result,
        fields: result.length > 0 ? Object.keys(result[0]) : []
      };
    } catch (error) {
      throw new Error(`SQL执行失败: ${error.message}`);
    } finally {
      await connection.end();
    }
  }
  // PostgreSQL / 人大金仓 / 华为高斯执行 SQL
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
      const result = await client.query(sql);
      return {
        rows: result.rows || [],
        fields: (result.fields || []).map(f => f.name)
      };
    } catch (error) {
      throw new Error(`SQL执行失败: ${error.message}`);
    } finally {
      await client.end().catch(() => {});
    }
  }

  throw new Error(`暂不支持的数据库类型: ${dbType}`);
}

module.exports = {
  testConnection,
  executeSql,
  listSchemas,
  listTables,
  getTableColumns
};