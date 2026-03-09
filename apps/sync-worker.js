#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 *  TOTEM SYNC WORKER  —  sync-worker.js  v2.0.0
 * ══════════════════════════════════════════════════════════════
 *
 *  Roda no hardware local, independente do processo do totem.
 *  Monitora o manifest.json do Hub e sincroniza automaticamente
 *  os arquivos de public/totem-local/ sempre que houver novidades.
 *
 *  NOVO em v2.0:
 *  - Instala dependências automaticamente (yarn/npm) quando
 *    package.json é atualizado ou node_modules não existe.
 *  - Detecta yarn.lock ou package-lock.json para escolher
 *    o gerenciador de pacotes correto.
 *
 *  Uso:
 *    node sync-worker.js
 *
 *  Variáveis de ambiente (.env ou export):
 *    HUB_URL          URL base do Hub publicado  (obrigatório)
 *    LOCAL_DIR        Caminho da pasta local do totem (padrão: __dirname)
 *    SYNC_INTERVAL_MS Intervalo de verificação em ms  (padrão: 30000)
 *    RESTART_COMMAND  Comando para reiniciar o totem após atualização
 *    BACKUP_FILES     "true" para manter .bak (padrão: true)
 *    VERBOSE          "true" para logs detalhados (padrão: false)
 *    API_KEY          API key do dispositivo (para comandos remotos)
 *    SUPABASE_URL     URL do projeto (sem barra final)
 *    AUTO_INSTALL     "false" para desativar instalação automática (padrão: true)
 *    PACKAGE_MANAGER  Forçar "yarn" ou "npm" (padrão: auto-detecta)
 *
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs          = require('fs');
const path        = require('path');
const https       = require('https');
const http        = require('http');
const { exec }    = require('child_process');

// ─── Carregar .env manualmente (sem dependência de dotenv) ───
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

// ─── Configuração ────────────────────────────────────────────
const HUB_URL          = (process.env.HUB_URL || '').replace(/\/$/, '');
const LOCAL_DIR        = process.env.LOCAL_DIR || __dirname;
const SYNC_INTERVAL    = parseInt(process.env.SYNC_INTERVAL_MS || '30000', 10);
const RESTART_COMMAND  = process.env.RESTART_COMMAND || null;
const BACKUP_FILES     = process.env.BACKUP_FILES !== 'false';
const VERBOSE          = process.env.VERBOSE === 'true';
const API_KEY          = process.env.API_KEY || process.env.API_KEY_2 || null;
const SUPABASE_URL     = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const AUTO_INSTALL     = process.env.AUTO_INSTALL !== 'false';
const FORCED_PM        = process.env.PACKAGE_MANAGER || null;

const LOCAL_STATE_PATH = path.join(LOCAL_DIR, '.sync-state.json');

// ─── Utilidades ──────────────────────────────────────────────
const log   = (msg)  => console.log(`[Sync] ${msg}`);
const debug = (msg)  => VERBOSE && console.log(`[Sync][debug] ${msg}`);
const warn  = (msg)  => console.warn(`[Sync] ⚠️  ${msg}`);
const error = (msg)  => console.error(`[Sync] ❌  ${msg}`);

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const req = client.get(url, { timeout: 10_000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode} ao buscar ${url}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ao buscar ${url}`)); });
  });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, 'utf8'));
  } catch {
    return { files: {}, last_sync: null, last_install: null };
  }
}

function saveState(state) {
  fs.writeFileSync(LOCAL_STATE_PATH, JSON.stringify({ ...state, last_sync: new Date().toISOString() }, null, 2));
}

function backupFile(filePath) {
  if (!BACKUP_FILES) return;
  if (fs.existsSync(filePath)) {
    const bakPath = filePath + '.bak';
    fs.copyFileSync(filePath, bakPath);
    debug(`Backup criado: ${path.basename(bakPath)}`);
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// ─── Detectar gerenciador de pacotes ─────────────────────────
function detectPackageManager() {
  if (FORCED_PM) return FORCED_PM;
  if (fs.existsSync(path.join(LOCAL_DIR, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(LOCAL_DIR, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

// ─── Instalar dependências ───────────────────────────────────
function installDependencies() {
  return new Promise((resolve) => {
    const pm = detectPackageManager();
    const cmd = pm === 'yarn' ? 'yarn install --frozen-lockfile || yarn install'
              : pm === 'pnpm' ? 'pnpm install --frozen-lockfile || pnpm install'
              : 'npm ci || npm install';

    log(`📦 Instalando dependências com ${pm}...`);

    exec(cmd, { cwd: LOCAL_DIR, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) {
        error(`Falha na instalação: ${err.message}`);
        if (stderr) debug(stderr.trim());
        resolve(false);
      } else {
        log(`✅ Dependências instaladas com sucesso via ${pm}`);
        if (stdout && VERBOSE) debug(stdout.trim());
        resolve(true);
      }
    });
  });
}

// ─── Verificar se precisa instalar ───────────────────────────
async function checkAndInstall(packageJsonUpdated) {
  if (!AUTO_INSTALL) {
    debug('AUTO_INSTALL desativado — pulando instalação.');
    return;
  }

  const nodeModulesExists = fs.existsSync(path.join(LOCAL_DIR, 'node_modules'));
  const packageJsonExists = fs.existsSync(path.join(LOCAL_DIR, 'package.json'));

  if (!packageJsonExists) {
    debug('package.json não encontrado — pulando instalação.');
    return;
  }

  // Instala se: node_modules não existe OU package.json foi atualizado
  if (!nodeModulesExists) {
    log('📦 node_modules não encontrado — instalação inicial necessária');
    const ok = await installDependencies();
    if (ok) {
      const state = loadState();
      state.last_install = new Date().toISOString();
      saveState(state);
    }
  } else if (packageJsonUpdated) {
    log('📦 package.json atualizado — reinstalando dependências');
    const ok = await installDependencies();
    if (ok) {
      const state = loadState();
      state.last_install = new Date().toISOString();
      saveState(state);
    }
  } else {
    debug('node_modules OK, package.json sem mudanças.');
  }
}

function triggerRestart() {
  if (!RESTART_COMMAND) {
    warn('Arquivos críticos atualizados — reinicie o totem manualmente (ou configure RESTART_COMMAND no .env)');
    return;
  }
  log(`🔃 Reiniciando totem: ${RESTART_COMMAND}`);
  exec(RESTART_COMMAND, (err, stdout, stderr) => {
    if (err) {
      error(`Falha ao reiniciar: ${err.message}`);
    } else {
      log('✅ Reinicialização disparada com sucesso');
      if (stdout) debug(stdout.trim());
    }
  });
}

// ─── Verificar comando remoto ────────────────────────────────
async function checkRemoteCommand() {
  if (!API_KEY || !SUPABASE_URL) return null;

  try {
    const url = `${SUPABASE_URL}/functions/v1/totem-poll-command`;
    const text = await new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const options = {
        method: 'GET',
        headers: { 'x-totem-api-key': API_KEY },
        timeout: 10_000,
      };
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout poll-command')); });
      req.end();
    });
    const json = JSON.parse(text);
    return json.command || null;
  } catch (err) {
    debug(`Poll-command falhou: ${err.message}`);
    return null;
  }
}

// ─── Reportar resultado de comando ───────────────────────────
async function reportCommandResult(command, status, errorMsg) {
  if (!API_KEY || !SUPABASE_URL) return;
  try {
    const url = `${SUPABASE_URL}/functions/v1/totem-command-report`;
    const payload = JSON.stringify({ command, status, error: errorMsg || undefined });
    await new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const options = {
        method: 'POST',
        headers: { 'x-totem-api-key': API_KEY, 'Content-Type': 'application/json' },
        timeout: 10_000,
      };
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout report')); });
      req.write(payload);
      req.end();
    });
    debug(`Resultado reportado: ${command} → ${status}`);
  } catch (err) {
    debug(`Falha ao reportar resultado: ${err.message}`);
  }
}

// ─── Loop principal ──────────────────────────────────────────
async function syncFiles() {
  if (!HUB_URL) {
    error('HUB_URL não configurado! Defina no .env ou via variável de ambiente.');
    return;
  }

  debug(`Verificando Hub: ${HUB_URL}/totem-local/manifest.json`);

  let hubManifest;
  try {
    const text = await fetchText(`${HUB_URL}/totem-local/manifest.json`);
    hubManifest = JSON.parse(text);
  } catch (err) {
    error(`Não foi possível buscar o manifest: ${err.message}`);
    return;
  }

  const state = loadState();
  const updatedFiles  = [];
  let   hasCritical   = false;
  let   packageJsonUpdated = false;

  for (const [fileName, fileInfo] of Object.entries(hubManifest.files || {})) {
    const installedVersion = state.files[fileName]?.version;
    const hubVersion       = fileInfo.version;

    if (installedVersion === hubVersion) {
      debug(`${fileName} — OK (${hubVersion})`);
      continue;
    }

    const action = installedVersion ? `${installedVersion} → ${hubVersion}` : `novo (${hubVersion})`;
    log(`📥 Atualizando ${fileName}  [${action}]`);

    try {
      const content  = await fetchText(`${HUB_URL}/totem-local/${fileName}`);
      const localPath = path.join(LOCAL_DIR, fileName);

      ensureDir(localPath);
      backupFile(localPath);

      // Cleanup: remover variantes com extensão diferente
      const ext = path.extname(fileName);
      const base = fileName.replace(ext, '');
      const altExts = { '.jsx': ['.js', '.ts', '.tsx'], '.js': ['.jsx', '.ts', '.tsx'], '.ts': ['.js', '.jsx', '.tsx'], '.tsx': ['.js', '.jsx', '.ts'] };
      for (const altExt of (altExts[ext] || [])) {
        const altPath = path.join(LOCAL_DIR, base + altExt);
        if (fs.existsSync(altPath)) {
          log(`🧹 Removendo variante antiga: ${base + altExt}`);
          backupFile(altPath);
          fs.unlinkSync(altPath);
          const altKey = base + altExt;
          if (state.files[altKey]) delete state.files[altKey];
        }
      }

      fs.writeFileSync(localPath, content, 'utf8');

      if (!state.files) state.files = {};
      state.files[fileName] = { version: hubVersion, updated_at: new Date().toISOString() };

      updatedFiles.push(fileName);
      if (fileInfo.critical) hasCritical = true;

      // Detectar se package.json foi atualizado
      if (fileName === 'package.json' || fileInfo.install) {
        packageJsonUpdated = true;
      }

      log(`✅ ${fileName} atualizado`);
    } catch (err) {
      error(`Falha ao atualizar ${fileName}: ${err.message}`);
    }
  }

  saveState(state);

  // ── Instalar dependências se necessário ──
  await checkAndInstall(packageJsonUpdated);

  if (updatedFiles.length === 0) {
    log(`✔ Tudo sincronizado  [${new Date().toLocaleTimeString('pt-BR')}]`);
  } else {
    log(`🔄 ${updatedFiles.length} arquivo(s) sincronizado(s): ${updatedFiles.join(', ')}`);
    if (hasCritical) triggerRestart();
  }
}

// ─── Graceful shutdown ───────────────────────────────────────
let intervalId;

function shutdown() {
  log('Worker encerrado.');
  clearInterval(intervalId);
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ─── Bootstrap ───────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║         TOTEM SYNC WORKER  v2.0.0           ║');
console.log('╚══════════════════════════════════════════════╝');
log(`Hub URL       : ${HUB_URL || '(não configurado!)'}`);
log(`Diretório     : ${LOCAL_DIR}`);
log(`Intervalo     : ${SYNC_INTERVAL / 1000}s`);
log(`Auto-install  : ${AUTO_INSTALL ? 'ativado' : 'desativado'}`);
log(`Pkg manager   : ${FORCED_PM || 'auto-detecta'}`);
log(`Restart cmd   : ${RESTART_COMMAND || '(nenhum — reinicie manualmente)'}`);
log(`Backups       : ${BACKUP_FILES ? 'ativados' : 'desativados'}`);
log(`Cmd remoto    : ${API_KEY ? 'ativado' : 'desativado (API_KEY não configurado)'}`);
console.log('');

// ── Instalação inicial (se node_modules não existe) ──
checkAndInstall(false).then(() => {
  // Primeira execução de sync
  syncFiles();
  intervalId = setInterval(syncFiles, SYNC_INTERVAL);
});

// ── Comandos remotos ──
async function checkLoop() {
  const command = await checkRemoteCommand();
  if (!command) return;

  log(`⚡ Comando "${command}" recebido do Hub`);
  let success = true;
  let errorMsg = null;

  try {
    switch (command) {
      case 'sync':
        log('📥 Sincronizando imediatamente...');
        await syncFiles();
        break;
      case 'restart':
        log('🔃 Reiniciando totem por comando remoto...');
        triggerRestart();
        break;
      case 'sync_restart':
        log('📥 Sync + Restart...');
        await syncFiles();
        triggerRestart();
        break;
      case 'install':
        log('📦 Instalação de dependências solicitada remotamente...');
        await installDependencies();
        break;
      case 'reload_config':
        log('🔄 Reload de configuração...');
        triggerRestart();
        break;
      default:
        warn(`Comando desconhecido: "${command}"`);
        success = false;
        errorMsg = 'Comando desconhecido';
        break;
    }
  } catch (err) {
    error(`Falha ao executar "${command}": ${err.message}`);
    success = false;
    errorMsg = err.message;
  }

  await reportCommandResult(command, success ? 'executed' : 'failed', errorMsg);
}

if (API_KEY && SUPABASE_URL) {
  log('🔌 Polling de comandos remotos ativo (a cada 5s)');
  setInterval(checkLoop, 5000);
}