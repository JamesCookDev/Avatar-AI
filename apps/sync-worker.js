#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 *  TOTEM SYNC WORKER  —  sync-worker.js  v3.0.0
 * ══════════════════════════════════════════════════════════════
 *
 *  Automatiza TODO o processo de setup e manutenção do totem:
 *
 *  1. Verifica pré-requisitos (Node.js, npm)
 *  2. Cria .env a partir de .env.sync.example se não existir
 *     (solicita o ORG_ID interativamente)
 *  3. Sincroniza arquivos do Hub (manifest.json)
 *  4. Instala dependências automaticamente (npm install)
 *  5. Inicia o servidor de desenvolvimento (npm run dev)
 *  6. Mantém polling de sync + comandos remotos em background
 *
 *  Uso:
 *    node sync-worker.js           # Setup completo + dev server
 *    node sync-worker.js --no-dev  # Apenas sync (sem iniciar dev)
 *    node sync-worker.js --setup   # Apenas setup inicial (sem loop)
 *
 *  Variáveis de ambiente (.env):
 *    HUB_URL, LOCAL_DIR, SYNC_INTERVAL_MS, RESTART_COMMAND,
 *    BACKUP_FILES, VERBOSE, API_KEY, SUPABASE_URL,
 *    AUTO_INSTALL, PACKAGE_MANAGER, AUTO_DEV
 *
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const https         = require('https');
const http          = require('http');
const { exec, spawn } = require('child_process');
const readline      = require('readline');

// ─── Args ────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const FLAG_NO_DEV  = ARGS.includes('--no-dev');
const FLAG_SETUP   = ARGS.includes('--setup');

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

// ─── Utilidades ──────────────────────────────────────────────
const log   = (msg) => console.log(`[Sync] ${msg}`);
const debug = (msg) => VERBOSE && console.log(`[Sync][debug] ${msg}`);
const warn  = (msg) => console.warn(`[Sync] ⚠️  ${msg}`);
const error = (msg) => console.error(`[Sync] ❌  ${msg}`);

let VERBOSE = false; // será definido após loadEnv

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const req = client.get(url, { timeout: 15_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
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

function isCommandAvailable(cmd) {
  try {
    const { execSync } = require('child_process');
    execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch { return false; }
}

function runCommand(cmd, cwd, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\n${stderr || ''}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  FASE 1 — Verificar pré-requisitos
// ══════════════════════════════════════════════════════════════
function checkPrerequisites() {
  log('🔍 Verificando pré-requisitos...');

  if (!isCommandAvailable('node')) {
    error('Node.js não encontrado! Instale em: https://nodejs.org');
    process.exit(1);
  }

  if (!isCommandAvailable('npm')) {
    error('npm não encontrado! Reinstale o Node.js: https://nodejs.org');
    process.exit(1);
  }

  const nodeVersion = require('child_process').execSync('node --version', { encoding: 'utf8' }).trim();
  const npmVersion  = require('child_process').execSync('npm --version', { encoding: 'utf8' }).trim();
  log(`✅ Node.js ${nodeVersion} / npm ${npmVersion}`);
}

// ══════════════════════════════════════════════════════════════
//  FASE 2 — Garantir .env existe
// ══════════════════════════════════════════════════════════════
async function ensureEnvFile() {
  const envPath     = path.join(__dirname, '.env');
  const examplePath = path.join(__dirname, '.env.sync.example');

  if (fs.existsSync(envPath)) {
    // Verificar se ORG_ID está preenchido
    const content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('cole-o-uuid-da-organizacao-aqui')) {
      log('⚠️  VITE_ORG_ID não configurado no .env');
      const orgId = await ask('\n📋 Cole o UUID da organização (encontre em Organizações no Hub): ');
      if (orgId && orgId.length > 10) {
        const updated = content.replace('cole-o-uuid-da-organizacao-aqui', orgId);
        fs.writeFileSync(envPath, updated, 'utf8');
        log(`✅ VITE_ORG_ID configurado: ${orgId.substring(0, 8)}...`);
      } else {
        error('ORG_ID inválido. Configure manualmente no .env');
        process.exit(1);
      }
    }
    log('✅ .env encontrado');
    return;
  }

  // Criar .env a partir do exemplo
  if (!fs.existsSync(examplePath)) {
    error('.env.sync.example não encontrado! Copie do Hub.');
    process.exit(1);
  }

  log('📄 Criando .env a partir de .env.sync.example...');
  let content = fs.readFileSync(examplePath, 'utf8');

  // Ajustar LOCAL_DIR para o diretório atual
  content = content.replace(
    /LOCAL_DIR=.*/,
    `LOCAL_DIR=${__dirname}`
  );

  // Pedir ORG_ID interativamente
  const orgId = await ask('\n📋 Cole o UUID da organização (encontre em Organizações no Hub): ');
  if (orgId && orgId.length > 10) {
    content = content.replace('cole-o-uuid-da-organizacao-aqui', orgId);
  } else {
    error('ORG_ID inválido. Configure manualmente no .env');
    process.exit(1);
  }

  // Perguntar nome do totem (opcional)
  const totemName = await ask('📛 Nome do totem (Enter para pular): ');
  if (totemName) {
    content = content.replace(
      '# VITE_TOTEM_NAME=Totem Recepção',
      `VITE_TOTEM_NAME=${totemName}`
    );
  }

  const totemLocation = await ask('📍 Localização do totem (Enter para pular): ');
  if (totemLocation) {
    content = content.replace(
      '# VITE_TOTEM_LOCATION=Entrada Principal',
      `VITE_TOTEM_LOCATION=${totemLocation}`
    );
  }

  fs.writeFileSync(envPath, content, 'utf8');
  log('✅ .env criado com sucesso');
}

// ══════════════════════════════════════════════════════════════
//  FASE 3 — Sincronizar arquivos do Hub
// ══════════════════════════════════════════════════════════════
const LOCAL_STATE_PATH = () => path.join(LOCAL_DIR(), '.sync-state.json');

// Configurações (lazy, carregadas após loadEnv)
function LOCAL_DIR()      { return process.env.LOCAL_DIR || __dirname; }
function HUB_URL()        { return (process.env.HUB_URL || '').replace(/\/$/, ''); }
function SYNC_INTERVAL()  { return parseInt(process.env.SYNC_INTERVAL_MS || '30000', 10); }
function RESTART_CMD()    { return process.env.RESTART_COMMAND || null; }
function BACKUP_FILES()   { return process.env.BACKUP_FILES !== 'false'; }
function API_KEY()        { return process.env.API_KEY || process.env.API_KEY_2 || null; }
function SUPABASE_URL()   { return (process.env.SUPABASE_URL || '').replace(/\/$/, ''); }
function AUTO_INSTALL()   { return process.env.AUTO_INSTALL !== 'false'; }
function FORCED_PM()      { return process.env.PACKAGE_MANAGER || null; }
function AUTO_DEV()       { return process.env.AUTO_DEV !== 'false'; }

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STATE_PATH(), 'utf8'));
  } catch {
    return { files: {}, last_sync: null, last_install: null };
  }
}

function saveState(state) {
  fs.writeFileSync(LOCAL_STATE_PATH(), JSON.stringify({ ...state, last_sync: new Date().toISOString() }, null, 2));
}

function backupFile(filePath) {
  if (!BACKUP_FILES()) return;
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + '.bak');
    debug(`Backup: ${path.basename(filePath)}.bak`);
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function syncFiles() {
  const hubUrl = HUB_URL();
  if (!hubUrl) {
    error('HUB_URL não configurado!');
    return { updated: 0, packageJsonUpdated: false };
  }

  debug(`Verificando: ${hubUrl}/totem-local/manifest.json`);

  let hubManifest;
  try {
    const text = await fetchText(`${hubUrl}/totem-local/manifest.json`);
    hubManifest = JSON.parse(text);
  } catch (err) {
    error(`Manifest inacessível: ${err.message}`);
    return { updated: 0, packageJsonUpdated: false };
  }

  const state = loadState();
  const updatedFiles = [];
  let hasCritical = false;
  let packageJsonUpdated = false;
  const localDir = LOCAL_DIR();

  for (const [fileName, fileInfo] of Object.entries(hubManifest.files || {})) {
    const installedVersion = state.files[fileName]?.version;
    const hubVersion = fileInfo.version;

    if (installedVersion === hubVersion) {
      debug(`${fileName} — OK (${hubVersion})`);
      continue;
    }

    const action = installedVersion ? `${installedVersion} → ${hubVersion}` : `novo (${hubVersion})`;
    log(`📥 ${fileName} [${action}]`);

    try {
      const content = await fetchText(`${hubUrl}/totem-local/${fileName}`);
      const localPath = path.join(localDir, fileName);

      ensureDir(localPath);
      backupFile(localPath);

      // Cleanup: remover variantes com extensão diferente
      const ext = path.extname(fileName);
      const base = fileName.replace(ext, '');
      const altExts = { '.jsx': ['.js', '.ts', '.tsx'], '.js': ['.jsx', '.ts', '.tsx'], '.ts': ['.js', '.jsx', '.tsx'], '.tsx': ['.js', '.jsx', '.ts'] };
      for (const altExt of (altExts[ext] || [])) {
        const altPath = path.join(localDir, base + altExt);
        if (fs.existsSync(altPath)) {
          log(`🧹 Removendo variante: ${base + altExt}`);
          backupFile(altPath);
          fs.unlinkSync(altPath);
          if (state.files[base + altExt]) delete state.files[base + altExt];
        }
      }

      fs.writeFileSync(localPath, content, 'utf8');
      if (!state.files) state.files = {};
      state.files[fileName] = { version: hubVersion, updated_at: new Date().toISOString() };
      updatedFiles.push(fileName);
      if (fileInfo.critical) hasCritical = true;
      if (fileName === 'package.json' || fileInfo.install) packageJsonUpdated = true;

      log(`✅ ${fileName}`);
    } catch (err) {
      error(`Falha em ${fileName}: ${err.message}`);
    }
  }

  saveState(state);

  if (updatedFiles.length === 0) {
    log(`✔ Sincronizado [${new Date().toLocaleTimeString('pt-BR')}]`);
  } else {
    log(`🔄 ${updatedFiles.length} arquivo(s): ${updatedFiles.join(', ')}`);
    if (hasCritical && RESTART_CMD()) triggerRestart();
  }

  return { updated: updatedFiles.length, packageJsonUpdated };
}

// ══════════════════════════════════════════════════════════════
//  FASE 4 — Instalar dependências
// ══════════════════════════════════════════════════════════════
function detectPackageManager() {
  const forced = FORCED_PM();
  const localDir = LOCAL_DIR();
  if (forced) return isCommandAvailable(forced) ? forced : 'npm';
  if (fs.existsSync(path.join(localDir, 'yarn.lock')) && isCommandAvailable('yarn')) return 'yarn';
  if (fs.existsSync(path.join(localDir, 'pnpm-lock.yaml')) && isCommandAvailable('pnpm')) return 'pnpm';
  return 'npm';
}

async function installDependencies() {
  if (!AUTO_INSTALL()) { debug('AUTO_INSTALL desativado.'); return false; }
  if (!fs.existsSync(path.join(LOCAL_DIR(), 'package.json'))) { debug('Sem package.json.'); return false; }

  const pm = detectPackageManager();
  const cmd = pm === 'yarn' ? 'yarn install --frozen-lockfile || yarn install'
            : pm === 'pnpm' ? 'pnpm install --frozen-lockfile || pnpm install'
            : 'npm ci || npm install';

  log(`📦 Instalando dependências com ${pm}...`);

  try {
    await runCommand(cmd, LOCAL_DIR());
    log(`✅ Dependências instaladas via ${pm}`);
    return true;
  } catch (err) {
    error(`Falha na instalação: ${err.message}`);
    return false;
  }
}

async function checkAndInstall(packageJsonUpdated) {
  if (!AUTO_INSTALL()) return;

  const nodeModulesExists = fs.existsSync(path.join(LOCAL_DIR(), 'node_modules'));

  if (!nodeModulesExists || packageJsonUpdated) {
    const reason = !nodeModulesExists ? 'node_modules ausente' : 'package.json atualizado';
    log(`📦 ${reason} — instalando...`);
    const ok = await installDependencies();
    if (ok) {
      const state = loadState();
      state.last_install = new Date().toISOString();
      saveState(state);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 5 — Iniciar servidor de desenvolvimento
// ══════════════════════════════════════════════════════════════
let devProcess = null;

function startDevServer() {
  if (FLAG_NO_DEV || FLAG_SETUP) return;
  if (!AUTO_DEV()) { log('AUTO_DEV desativado — inicie manualmente com: npm run dev'); return; }
  if (!fs.existsSync(path.join(LOCAL_DIR(), 'package.json'))) return;

  log('🚀 Iniciando servidor de desenvolvimento...');

  const pm = detectPackageManager();
  const cmd = pm === 'npm' ? 'npm' : pm;
  const args = pm === 'npm' ? ['run', 'dev'] : ['dev'];

  devProcess = spawn(cmd, args, {
    cwd: LOCAL_DIR(),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  devProcess.on('error', (err) => {
    error(`Dev server falhou: ${err.message}`);
  });

  devProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      warn(`Dev server encerrou com código ${code}`);
    }
    devProcess = null;
  });

  log('✅ Dev server iniciado (logs abaixo são do Vite)');
}

function restartDevServer() {
  if (devProcess) {
    log('🔃 Reiniciando dev server...');
    devProcess.kill('SIGTERM');
    setTimeout(startDevServer, 2000);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 6 — Comandos remotos
// ══════════════════════════════════════════════════════════════
function triggerRestart() {
  const cmd = RESTART_CMD();
  if (!cmd) {
    // Se temos dev server, reinicia ele
    if (devProcess) { restartDevServer(); return; }
    warn('Configure RESTART_COMMAND no .env para reinício automático');
    return;
  }
  log(`🔃 Executando: ${cmd}`);
  exec(cmd, (err) => {
    if (err) error(`Falha ao reiniciar: ${err.message}`);
    else log('✅ Reinicialização OK');
  });
}

async function checkRemoteCommand() {
  const apiKey = API_KEY();
  const supaUrl = SUPABASE_URL();
  if (!apiKey || !supaUrl) return null;

  try {
    const url = `${supaUrl}/functions/v1/totem-poll-command`;
    const text = await new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const req = client.request(url, {
        method: 'GET',
        headers: { 'x-totem-api-key': apiKey },
        timeout: 10_000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
    return JSON.parse(text).command || null;
  } catch (err) {
    debug(`Poll-command: ${err.message}`);
    return null;
  }
}

async function reportCommandResult(command, status, errorMsg) {
  const apiKey = API_KEY();
  const supaUrl = SUPABASE_URL();
  if (!apiKey || !supaUrl) return;
  try {
    const url = `${supaUrl}/functions/v1/totem-command-report`;
    const payload = JSON.stringify({ command, status, error: errorMsg || undefined });
    await new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const req = client.request(url, {
        method: 'POST',
        headers: { 'x-totem-api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 10_000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    debug(`Report falhou: ${err.message}`);
  }
}

async function handleRemoteCommand() {
  const command = await checkRemoteCommand();
  if (!command) return;

  log(`⚡ Comando: "${command}"`);
  let success = true, errorMsg = null;

  try {
    switch (command) {
      case 'sync':
        await syncFiles();
        break;
      case 'restart':
        triggerRestart();
        break;
      case 'sync_restart':
        await syncFiles();
        triggerRestart();
        break;
      case 'install':
        await installDependencies();
        break;
      case 'reload_config':
        triggerRestart();
        break;
      default:
        warn(`Comando desconhecido: "${command}"`);
        success = false;
        errorMsg = 'Comando desconhecido';
    }
  } catch (err) {
    error(`"${command}" falhou: ${err.message}`);
    success = false;
    errorMsg = err.message;
  }

  await reportCommandResult(command, success ? 'executed' : 'failed', errorMsg);
}

// ══════════════════════════════════════════════════════════════
//  BOOTSTRAP — Orquestra todas as fases
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         TOTEM SYNC WORKER  v3.0.0               ║');
  console.log('║         Setup automático completo                ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Fase 1 — Pré-requisitos
  checkPrerequisites();

  // Fase 2 — Garantir .env
  await ensureEnvFile();
  loadEnv();
  VERBOSE = process.env.VERBOSE === 'true';

  const localDir = LOCAL_DIR();
  const hubUrl = HUB_URL();

  log(`Hub URL      : ${hubUrl || '(não configurado!)'}`);
  log(`Diretório    : ${localDir}`);
  log(`Intervalo    : ${SYNC_INTERVAL() / 1000}s`);
  log(`Auto-install : ${AUTO_INSTALL() ? 'sim' : 'não'}`);
  log(`Auto-dev     : ${!FLAG_NO_DEV && !FLAG_SETUP && AUTO_DEV() ? 'sim' : 'não'}`);
  log(`Cmd remoto   : ${API_KEY() ? 'ativo' : 'inativo'}`);
  console.log('');

  // Fase 3 — Sync inicial
  log('━━━ FASE 1: Sincronizando arquivos do Hub ━━━');
  const { packageJsonUpdated } = await syncFiles();

  // Fase 4 — Instalar dependências
  log('━━━ FASE 2: Verificando dependências ━━━');
  await checkAndInstall(packageJsonUpdated);

  if (FLAG_SETUP) {
    log('');
    log('✅ Setup completo! Para iniciar o totem:');
    log('   npm run dev');
    return;
  }

  // Fase 5 — Iniciar dev server
  log('━━━ FASE 3: Iniciando aplicação ━━━');
  startDevServer();

  // Fase 6 — Loop de sync em background
  log('');
  log('━━━ Sync contínuo ativo ━━━');
  const syncInterval = setInterval(async () => {
    const result = await syncFiles();
    if (result.packageJsonUpdated) {
      await checkAndInstall(true);
      if (devProcess) restartDevServer();
    }
  }, SYNC_INTERVAL());

  // Comandos remotos
  let cmdInterval;
  if (API_KEY() && SUPABASE_URL()) {
    log('🔌 Polling de comandos remotos ativo');
    cmdInterval = setInterval(handleRemoteCommand, 5000);
  }

  // Graceful shutdown
  function shutdown() {
    log('Encerrando...');
    clearInterval(syncInterval);
    if (cmdInterval) clearInterval(cmdInterval);
    if (devProcess) {
      devProcess.kill('SIGTERM');
      setTimeout(() => process.exit(0), 1000);
    } else {
      process.exit(0);
    }
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  error(`Falha fatal: ${err.message}`);
  process.exit(1);
});