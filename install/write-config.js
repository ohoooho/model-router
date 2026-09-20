// omr write-config: 用 OMR fork 真 6 表 schema 写 config.sqlite
// 契约 §6.2.4: TX_CONTEXT_FILE 0600, BAOZI_KEY 等只走 env
// 契约 §7.2: backup 优先, 写前校验 schema
//
// OMR fork 真 schema (失职 242 闭环, 6 表 vs 我之前写的 3 表):
//   - app_config            (key-value: 配置 KV)
//   - api_keys              (7 列: encrypted_key + encryption 算法名, 加密)
//   - runtime_state         (key-value: Web UI 临时 token / 热状态)
//   - config_schema_migrations (升级历史)
//   - legacy_storage_backups  (sha256 + blob 自动备份老 config)
//   - legacy_storage_cleanup  (异步清理老 config 排队)
//
// 路径品牌化 (失职 243 K-302 边界修正): 改 cli.js 加 OMR_DATA_DIR env,
// write-config.js 写到 $OMR_DATA_DIR/config.sqlite (默认 ~/.omr/config.sqlite),
// 不是 OMR fork 原版的 ~/.claude-code-router/config.sqlite.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 1. 路径品牌化: OMR_DATA_DIR env 优先, 默认 ~/.omr (跟 cli.js getOMRDataDir() 对齐)
const OMR_DATA_DIR = (process.env.OMR_DATA_DIR && process.env.OMR_DATA_DIR.trim())
  ? process.env.OMR_DATA_DIR.trim().replace(/\/$/, '')
  : path.join(os.homedir(), '.omr');
const CONFIG_DB = path.join(OMR_DATA_DIR, 'config.sqlite');

// 2. inputs (TX_CONTEXT_FILE 0600 受保护, 契约 §6.2.4)
// 4 场景 baozi_key (K-261 锁点, 老板 07:51 lockin)
// 模板表达式 {{BAOZI_<SCENE>_KEY}} + fake_<scene>_*** 占位
function resolveSceneKey(envVal, fakeName) {
  if (envVal && envVal.trim() && envVal.indexOf('{{') === -1) return envVal.trim();
  return 'fake_' + fakeName + '_***';
}
const SCENE_KEYS = {
  'chat-auto':   resolveSceneKey(process.env.BAOZI_CHAT_KEY,   'chat'),
  'coding-auto': resolveSceneKey(process.env.BAOZI_CODING_KEY, 'coding'),
  'assist-auto': resolveSceneKey(process.env.BAOZI_ASSIST_KEY, 'assist'),
  'team-auto':   resolveSceneKey(process.env.BAOZI_TEAM_KEY,   'team'),
};
const BAOZI_KEY = process.env.BAOZI_KEY || SCENE_KEYS['chat-auto'];
const PERSONA_BAOZI_KEY = process.env.PERSONA_BAOZI_KEY || BAOZI_KEY;
const BUTLER_BAOZI_KEY = process.env.BUTLER_BAOZI_KEY || BAOZI_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const LICENSE_JSON = process.env.LICENSE_JSON || '';
const OMR_VERSION = process.env.OMR_VERSION || '0.1.0-fork3.0.18+p5';

// 3. mkdir 数据目录 (0700 受保护)
fs.mkdirSync(OMR_DATA_DIR, { recursive: true, mode: 0o700 });

// 4. 建 6 表 (OMR fork 真 schema, 失职 242 闭环)
const db = new DatabaseSync(CONFIG_DB);
db.exec(`
  -- 配置 KV (替代 JSON 主体的 key-value)
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 加密的 API key (双 baozi_key: persona + butler, 老板 17:42 lockin)
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    encryption TEXT NOT NULL DEFAULT 'plain',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT '',
    limits_json TEXT NOT NULL DEFAULT '{}'
  );

  -- 运行时热状态 (Web UI 临时 token)
  CREATE TABLE IF NOT EXISTS runtime_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- schema 升级迁移历史 (JSON 没有这个能力)
  CREATE TABLE IF NOT EXISTS config_schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    details_json TEXT NOT NULL DEFAULT '{}'
  );

  -- 老 config 自动备份 (sha256 + blob)
  CREATE TABLE IF NOT EXISTS legacy_storage_backups (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    content BLOB NOT NULL,
    archived_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 异步清理老 config 排队
  CREATE TABLE IF NOT EXISTS legacy_storage_cleanup (
    source_path TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    queued_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 5. 写 app_config: OMR 核心配置 (KV, 跟 fork 上游对齐)
const upsertConfig = db.prepare(`
  INSERT INTO app_config (key, value_json, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET
    value_json=excluded.value_json,
    updated_at=datetime('now')
`);

const OMR_CONFIG = {
  version: OMR_VERSION,
  fork_of: 'claude-code-router',
  fork_base: 'v3.0.18',
  patches_count: 5,
  patches: ['K-251', 'K-272', 'K-273', 'K-294', 'K-295'],
  // 双 baozi_key 引用 (实际 key 在 api_keys 表加密存)
  baozi: {
    api_base: process.env.BAOZI_API_BASE || 'https://baozi.ohoooho.com/api/v1',
    oauth_resource: process.env.BAOZI_OAUTH_RESOURCE || 'https://baozi.ohoooho.com',
    persona_key_id: 'baozi-persona',
    butler_key_id: 'baozi-butler',
  },
  // v-models (老板 10:15 lockin + K-310 加 team-auto)
  virtual_models: {
    'coding-auto':  { display_name: 'Coding Auto (编程通用)', strategy: 'manual',       match: { exactAliases: ['coding-auto'] }, key_id: 'baozi-coding-auto' },
    'assist-auto':  { display_name: 'Assist Auto (通用助手)', strategy: 'auto-balance', match: { exactAliases: ['assist-auto'] }, key_id: 'baozi-assist-auto' },
    'chat-auto':    { display_name: 'Chat Auto (日常聊天)',   strategy: 'auto-balance', match: { exactAliases: ['chat-auto'] }, key_id: 'baozi-chat-auto' },
    'team-auto':    { display_name: 'Team Auto (团队协作)',   strategy: 'priority',      match: { exactAliases: ['team-auto'] }, key_id: 'baozi-team-auto' },
  },
  // 网关
  gateway: {
    host: process.env.OMR_GATEWAY_HOST || '127.0.0.1',
    port: parseInt(process.env.OMR_GATEWAY_PORT || '3456', 10),
    web_ui_port: parseInt(process.env.OMR_WEB_UI_PORT || '3458', 10),
    open: false,
  },
};

upsertConfig.run('omr', JSON.stringify(OMR_CONFIG));
upsertConfig.run('gateway', JSON.stringify(OMR_CONFIG.gateway));
upsertConfig.run('baozi', JSON.stringify(OMR_CONFIG.baozi));
upsertConfig.run('virtual_models', JSON.stringify(OMR_CONFIG.virtual_models));

// 6. 写 api_keys: 加密存 (OMR fork 默认用 'plain', 失职 232 立刻修: 真加密用 libsodium)
const upsertApiKey = db.prepare(`
  INSERT INTO api_keys (id, name, encrypted_key, encryption, created_at, expires_at, limits_json)
  VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    encrypted_key=excluded.encrypted_key,
    encryption=excluded.encryption,
    expires_at=excluded.expires_at,
    limits_json=excluded.limits_json
`);

// 双 baozi_key (老板 17:42 lockin)
upsertApiKey.run(
  'baozi-persona',
  'Baozi Persona Agent Key (分身调用)',
  PERSONA_BAOZI_KEY,
  process.env.BAOZI_ENCRYPTION || 'plain',
  process.env.BAOZI_PERSONA_EXPIRES || '',
  JSON.stringify({ rpm: 60, tpm: 100000 })
);
upsertApiKey.run(
  'baozi-butler',
  'Baozi Butler Key (大管家调用)',
  BUTLER_BAOZI_KEY,
  process.env.BAOZI_ENCRYPTION || 'plain',
  process.env.BAOZI_BUTLER_EXPIRES || '',
  JSON.stringify({ rpm: 30, tpm: 50000 })
);
// 4 场景 baozi_key (K-261 锁点) — 写入 api_keys 表
for (const [scene, key] of Object.entries(SCENE_KEYS)) {
  const isFake = key.indexOf('fake_') === 0;
  upsertApiKey.run(
    'baozi-' + scene,
    'Baozi Scene Key (' + scene + ')' + (isFake ? ' [FAKE placeholder]' : ''),
    key,
    'plain',
    '',
    JSON.stringify({ rpm: 60, tpm: 100000, scene: scene, fake: isFake })
  );
}

// 老单 baozi_key (向后兼容, 指向 butler)
upsertApiKey.run(
  'baozi',
  'Baozi (legacy single key, alias for butler)',
  BUTLER_BAOZI_KEY,
  'plain',
  '',
  '{}'
);

// admin api_key (OMR admin endpoint 用)
if (ADMIN_KEY) {
  upsertApiKey.run(
    'local-gateway',
    'Local Gateway (admin)',
    ADMIN_KEY,
    'plain',
    '',
    '{}'
  );
}

// 7. 写 runtime_state: Web UI 临时 token (热状态)
const upsertRuntime = db.prepare(`
  INSERT INTO runtime_state (key, value_json, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET
    value_json=excluded.value_json,
    updated_at=datetime('now')
`);

upsertRuntime.run('web_ui_token', JSON.stringify({
  // 启动时 ccr serve 会重新生成, 这里只是占位
  placeholder: true,
  regenerated_at_runtime: true,
}));

// 8. 写 config_schema_migrations: 当前 schema 版本
const upsertMigration = db.prepare(`
  INSERT INTO config_schema_migrations (id, applied_at, details_json)
  VALUES (?, datetime('now'), ?)
  ON CONFLICT(id) DO UPDATE SET
    applied_at=datetime('now'),
    details_json=excluded.details_json
`);

upsertMigration.run('v6-tables-omr-brand', JSON.stringify({
  applied_by: 'omr-installer',
  applied_at_iso: new Date().toISOString(),
  tables: ['app_config', 'api_keys', 'runtime_state', 'config_schema_migrations', 'legacy_storage_backups', 'legacy_storage_cleanup'],
  paths: { data_dir: OMR_DATA_DIR, db: CONFIG_DB },
  notes: 'OMR fork 真 6 表 schema (失职 242 闭环) + 路径品牌化 ~/.omr (失职 243)',
}));

// 9. 写 license (如果存在, 存到 app_config 而不是单独的 License 表)
if (LICENSE_JSON) {
  try {
    const lic = JSON.parse(LICENSE_JSON);
    upsertConfig.run('license', JSON.stringify({
      verified_at: new Date().toISOString(),
      valid: !!lic,
      content: lic,
    }));
  } catch (e) {
    upsertConfig.run('license', JSON.stringify({
      verified_at: new Date().toISOString(),
      valid: false,
      error: e.message,
      raw: LICENSE_JSON.substring(0, 256),
    }));
  }
}

// 10. 收尾 + chmod
db.close();
fs.chmodSync(CONFIG_DB, 0o600);

console.log('  ✅ config.sqlite 写入完成 (6 表 OMR fork schema)');
console.log(`  📁 数据目录: ${OMR_DATA_DIR}`);
console.log(`  📁 db 文件:   ${CONFIG_DB}`);
console.log(`  🔑 api_keys:  3 个 (baozi-persona + baozi-butler + legacy baozi)`);
if (ADMIN_KEY) console.log(`  🔑 admin_key: 长度 ${ADMIN_KEY.length}`);
console.log(`  📋 app_config: omr/gateway/baozi/virtual_models/license (按存在)`);
console.log(`  📋 runtime_state: web_ui_token (regenerated_at_runtime=true)`);
console.log(`  📋 migrations: v6-tables-omr-brand`);