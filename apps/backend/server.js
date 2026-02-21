import { createClient } from '@supabase/supabase-js';
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { performance } from "perf_hooks";

import { lipSync } from "./modules/rhubarbLipSync.mjs";
import { convertAudioToText } from "./modules/whisper.mjs"; 
import kokoro from "./modules/kokoro.mjs";
import { streamResponse } from "./modules/localLLM.mjs";
import { invalidateCache as invalidateAICache, clearAllCache as clearAllAICache } from "./modules/aiConfig.mjs";

dotenv.config();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES GLOBAIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PORT = 3000;
const AUDIO_DIR = "audios";
const CACHE_FILE = "cache_map.json";
const MAX_RESPONSE_CHARS = 300;
const MAX_AUDIO_FILES = 50;

// Padrões de ruído/alucinações (centralizado)
const NOISE_PATTERNS = [
  /^\s*$/,                    // String vazia
  /^[\.,!?\-_]+$/,            // Só pontuação
  /^(hm+|ah+|eh+|oh+|uh+)$/i, // Sons não-verbais
  /^\[.*\]$/,                 // [inaudible], etc
  /^\(.*\)$/,                 // (music), etc
  /^(music|música|noise|ruído|applause|laughter)$/i,
  /^thank you\.?$/i,
  /^thanks for watching\.?$/i,
  /^\W+$/,                    // Só caracteres especiais
  /ronedo/i,                  // Alucinação comum
  /^sim\s*(voce|você)?/i,     // Alucinação comum
];

const app = express();

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

app.use(express.json({ limit: "50mb" }));
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const audioCache = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNÇÕES AUXILIARES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Logger com timestamp
const createLogger = (requestId, startTime) => (emoji, msg) => {
  const t = (performance.now() - startTime).toFixed(0);
  console.log(`[${requestId}][+${t}ms] ${emoji} ${msg}`);
};

// Valida se texto é ruído/alucinação
const isNoiseText = (text) => {
  const cleaned = text.trim().toLowerCase();
  return cleaned.length < 3 || NOISE_PATTERNS.some(p => p.test(cleaned));
};

// Converte cache items para resposta com base64
async function cacheToResponse(cacheItems, log) {
  return Promise.all(
    cacheItems.map(async (item) => {
      const audioBuffer = await fs.promises.readFile(item.audioPath);
      const lipSyncPath = item.audioPath.replace(".wav", ".json");
      
      let lipsyncContent = [];
      try {
        lipsyncContent = JSON.parse(await fs.promises.readFile(lipSyncPath, "utf-8"));
      } catch (e) {
        if (log) log("⚠️", "LipSync não encontrado no disco");
      }
      
      return {
        text: item.text,
        audio: audioBuffer.toString("base64"),
        lipsync: lipsyncContent,
        facialExpression: item.facialExpression,
        animation: item.animation
      };
    })
  );
}

// 🆕 OTIMIZAÇÃO 1: Cache Persistente em Disco
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      Object.entries(data).forEach(([key, value]) => {
        audioCache.set(key, value);
      });
      console.log(`💾 Cache carregado: ${audioCache.size} perguntas`);
    } catch (e) {
      console.error("❌ Erro ao carregar cache:", e.message);
    }
  } else {
    console.log("📝 Cache vazio (primeira execução)");
  }
}

function saveCache() {
  try {
    const cacheObj = {};
    audioCache.forEach((value, key) => {
      cacheObj[key] = value;
    });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2));
    console.log(`💾 Cache salvo: ${audioCache.size} entradas`);
  } catch (e) {
    console.error("⚠️ Erro ao salvar cache:", e.message);
  }
}

// 🆕 OTIMIZAÇÃO 2: Warm-up de Modelos
async function warmUpModels() {
  console.log("🔥 Iniciando warm-up dos modelos...");
  const startTime = performance.now();
  
  try {
    // O Whisper será aquecido na primeira requisição real
    console.log("  → Whisper: será aquecido na primeira fala");
    
    // 2. Llama: Pergunta dummy
    console.log("  → Aquecendo Llama...");
    const stream = await streamResponse({ question: "teste" });
    for await (const _ of stream) {} // Consome o stream
    
    // 3. Kokoro: Síntese dummy (se não existir)
    console.log("  → Aquecendo Kokoro...");
    const warmupFile = path.join(AUDIO_DIR, "warmup.wav");
    if (!fs.existsSync(warmupFile)) {
      await kokoro.generate("Olá", warmupFile);
    }
    
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Modelos aquecidos em ${elapsed}s!`);
  } catch (e) {
    console.error("⚠️ Erro no warm-up (não crítico):", e.message);
  }
}

// 🆕 FUNÇÃO AUXILIAR: Processa texto e gera áudio/lipsync
async function processTextToSpeech(userMessage, requestId, startTime, tenantId = null) {
  const log = createLogger(requestId, startTime);

  // Cache key inclui tenantId para separar respostas por cliente  
  const cacheKey = tenantId ? `${tenantId}:${userMessage.toLowerCase()}` : userMessage.toLowerCase();

  // Cache check
  if (audioCache.has(cacheKey)) {
      log("⚡", "CACHE HIT! Verificando arquivos...");
      const cachedData = audioCache.get(userMessage.toLowerCase());
      
      // Verifica se TODOS os arquivos existem
      const allFilesExist = cachedData.every(item => fs.existsSync(item.audioPath));
      
      if (allFilesExist) {
        try {
          const results = await cacheToResponse(cachedData, log);
          log("✅", "Cache carregado com sucesso!");
          return results;
        } catch (e) {
          log("⚠️", `Erro ao ler cache: ${e.message}. Regenerando...`);
        }
      } else {
        log("⚠️", "Arquivos do cache não encontrados. Regenerando...");
        audioCache.delete(cacheKey);
        saveCache();
      }
  }

  // Stream IA (com config dinâmica por tenant)
  log("🧠", `Iniciando Llama (Streaming)... ${tenantId ? `Tenant: ${tenantId}` : 'Config padrão'}`);
  const stream = await streamResponse({ question: userMessage, tenantId });
  
  let fullResponse = "";
  
  // Coleta toda a resposta do stream
  for await (const chunk of stream) {
      fullResponse += chunk;
  }
  
  // Limpa a resposta
  let cleanText = fullResponse
      .replace(/[*#\-_•\[\]()]/g, "")  // Remove símbolos
      .replace(/^\d+\.\s*/gm, "")        // Remove numeração
      .replace(/\s+/g, " ")              // Remove espaços duplos
      .replace(/Como posso ajudar.*/gi, "") // Remove auto-perguntas
      .trim();
  
  // Limita tamanho máximo (evita respostas muito longas)
  if (cleanText.length > MAX_RESPONSE_CHARS) {
      // Corta no último ponto antes do limite
      const cutPoint = cleanText.lastIndexOf('.', MAX_RESPONSE_CHARS);
      if (cutPoint > 100) {
          cleanText = cleanText.substring(0, cutPoint + 1);
      } else {
          cleanText = cleanText.substring(0, MAX_RESPONSE_CHARS).trim() + "...";
      }
  }
  
  log("📝", `Resposta completa: "${cleanText}"`);
  
  if (cleanText.length < 2) {
      log("⚠️", "Resposta vazia ou muito curta");
      return [];
  }
  
  // Gera ÁUDIO ÚNICO para toda a resposta
  const fileHash = crypto.createHash('md5').update(cleanText).digest('hex').substring(0, 10);
  const fileName = path.join(AUDIO_DIR, `speech_${fileHash}.wav`);
  
  if (!fs.existsSync(fileName)) {
      log("🎙️", `Gerando áudio...`);
      await kokoro.generate(cleanText, fileName);
      log("👄", `Gerando LipSync...`);
      await lipSync.generate(fileName);
  } else {
      log("♻️", `Áudio já existe no disco.`);
  }
  
  const cacheResults = [{
      text: cleanText,
      audioPath: fileName,
      facialExpression: "smile",
      animation: "TalkingOne"
  }];
  
  // Salva no cache (com tenantId)
  audioCache.set(cacheKey, cacheResults);
  saveCache();
  
  // 🧹 Verifica se precisa limpar
  checkAndCleanup();
  
  // Converte para resposta completa (com base64 e lipsync do disco)
  log("📦", "Convertendo áudios para base64...");
  const results = await cacheToResponse(cacheResults, log);
  
  log("🏁", `Resposta pronta: ${results.length} frase(s).`);
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 🎤 Speech-to-Speech (Voz → IA → Voz)
app.post("/sts", async (req, res) => {
  const requestId = Date.now();
  const startTime = performance.now();
  const log = createLogger(requestId, startTime);

  try {
    log("🔌", "Requisição STS recebida");
    const base64Audio = req.body.audio;
    const tenantId = req.body.tenantId || req.headers['x-tenant-id'] || null;
    
    if (tenantId) {
      log("🏢", `Tenant: ${tenantId}`);
    }
    
    if (!base64Audio) {
        log("⚠️", "Áudio vazio");
        return res.json({ messages: [] });
    }
    
    // 1. Whisper (Speech-to-Text)
    log("🎤", "Transcrevendo com Whisper...");
    const audioData = Buffer.from(base64Audio, "base64");
    const userMessage = await convertAudioToText({ audioData });
    
    if (!userMessage) {
        log("🔇", "Silêncio detectado");
        return res.json({ messages: [] });
    }
    
    // 🚨 VALIDAÇÃO: Ignora ruídos e transcrições inválidas
    if (isNoiseText(userMessage)) {
        log("🚫", `Ruído ignorado: "${userMessage}"`);
        return res.json({ messages: [] });
    }
    
    log("🗣️", `Texto: "${userMessage}"`);

    // 2. Processa (LLM + TTS + LipSync) com config do tenant
    const results = await processTextToSpeech(userMessage, requestId, startTime, tenantId);
    
    res.json({ messages: results });

  } catch (error) {
    log("❌", `ERRO: ${error.message}`);
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 💬 Text-to-Speech (Texto → IA → Voz) - Para botões
app.post("/text", async (req, res) => {
  const requestId = Date.now();
  const startTime = performance.now();
  const log = createLogger(requestId, startTime);

  try {
    log("🔌", "Requisição TEXT recebida");
    const userMessage = req.body.text;
    const tenantId = req.body.tenantId || req.headers['x-tenant-id'] || null;
    
    if (tenantId) {
      log("🏢", `Tenant: ${tenantId}`);
    }
    
    if (!userMessage || typeof userMessage !== 'string') {
        log("⚠️", "Texto inválido");
        return res.json({ messages: [] });
    }
    
    log("💬", `Texto: "${userMessage}"`);

    // Processa (LLM + TTS + LipSync) com config do tenant
    const results = await processTextToSpeech(userMessage, requestId, startTime, tenantId);
    
    res.json({ messages: results });

  } catch (error) {
    log("❌", `ERRO: ${error.message}`);
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 Endpoint de estatísticas do cache
app.get("/stats", (req, res) => {
  const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav'));
  const totalSize = audioFiles.reduce((acc, file) => {
    const filePath = path.join(AUDIO_DIR, file);
    return acc + fs.statSync(filePath).size;
  }, 0);
  
  res.json({
    cacheSize: audioCache.size,
    audioFiles: audioFiles.length,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 🔄 Webhook para invalidar cache da IA (chamado pelo CMS quando config muda)
app.post("/webhook/ai-config-updated", (req, res) => {
  const { tenantId, secret } = req.body;
  
  // Validação simples (você pode melhorar com assinatura HMAC)
  const expectedSecret = process.env.WEBHOOK_SECRET || 'avatar-ai-webhook';
  if (secret !== expectedSecret) {
    console.warn('⚠️ [Webhook] Tentativa com secret inválido');
    return res.status(401).json({ error: 'Invalid secret' });
  }
  
  if (tenantId) {
    invalidateAICache(tenantId);
    console.log(`🔄 [Webhook] Cache invalidado para tenant: ${tenantId}`);
  } else {
    clearAllAICache();
    console.log('🔄 [Webhook] Todo o cache de IA invalidado');
  }
  
  res.json({ success: true, message: 'Cache invalidated' });
});

// 🧹 FUNÇÃO: Verificar e limpar se exceder limite
function checkAndCleanup() {
  try {
    const wavFiles = fs.readdirSync(AUDIO_DIR)
      .filter(f => f.endsWith('.wav') && !f.includes('warmup'));
    
    if (wavFiles.length <= MAX_AUDIO_FILES) {
      return; // Dentro do limite, não faz nada
    }
    
    console.log(`\n🧹 Limite atingido (${wavFiles.length}/${MAX_AUDIO_FILES}). Limpando...`);
    
    // Lista arquivos com data de modificação
    const filesWithStats = wavFiles.map(f => {
      const filePath = path.join(AUDIO_DIR, f);
      return {
        name: f,
        path: filePath,
        modified: fs.statSync(filePath).mtime
      };
    }).sort((a, b) => a.modified - b.modified); // Mais antigos primeiro
    
    // Remove os mais antigos até ficar abaixo do limite
    const toRemove = filesWithStats.length - MAX_AUDIO_FILES + 10; // Remove 10 extras pra dar folga
    let removed = 0;
    
    for (let i = 0; i < toRemove && i < filesWithStats.length; i++) {
      const file = filesWithStats[i];
      
      // Remove .wav
      fs.unlinkSync(file.path);
      
      // Remove .json correspondente
      const jsonPath = file.path.replace('.wav', '.json');
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
      }
      
      removed++;
    }
    
    // Limpa entradas órfãs do cache
    const existingAudios = new Set(
      fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav'))
    );
    
    let orphanCount = 0;
    for (const [key, messages] of audioCache.entries()) {
      const hasOrphan = messages.some(msg => {
        const audioFile = path.basename(msg.audioPath);
        return !existingAudios.has(audioFile);
      });
      
      if (hasOrphan) {
        audioCache.delete(key);
        orphanCount++;
      }
    }
    
    if (orphanCount > 0) {
      saveCache();
    }
    
    console.log(`✅ Limpeza: ${removed} áudios removidos, ${orphanCount} entradas do cache\n`);
    
  } catch (error) {
    console.error("❌ Erro na limpeza:", error.message);
  }
}

// 🧹 Endpoint: Limpar áudios manualmente
app.post("/cleanup", (req, res) => {
  const wavFilesBefore = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav')).length;
  
  checkAndCleanup();
  
  const wavFilesAfter = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav')).length;
  
  res.json({ 
    before: wavFilesBefore, 
    after: wavFilesAfter, 
    removed: wavFilesBefore - wavFilesAfter,
    limit: MAX_AUDIO_FILES
  });
});

// 🧹 Endpoint: Limpar TUDO (reset completo)
app.post("/cleanup/all", (req, res) => {
  console.log("🧹 LIMPEZA TOTAL: Removendo todos os áudios e cache...");
  
  try {
    const files = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav') || f.endsWith('.json'));
    let count = 0;
    
    for (const file of files) {
      if (file.includes('warmup')) continue;
      fs.unlinkSync(path.join(AUDIO_DIR, file));
      count++;
    }
    
    audioCache.clear();
    fs.writeFileSync(CACHE_FILE, '{}');
    
    console.log(`✅ Limpeza total: ${count} arquivos removidos`);
    res.json({ success: true, deletedFiles: count });
    
  } catch (error) {
    console.error("❌ Erro:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 🔌 INTEGRAÇÃO AITI MANAGER
// ==========================================

const CMS_URL = process.env.SUPABASE_URL + '/functions/v1'; // URL das Edge Functions
const TOTEM_API_KEY = process.env.TOTEM_API_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (CMS_URL && TOTEM_API_KEY) {
  console.log("🔌 [AITI] Conectando ao AITI MANAGER...");

  // Heartbeat a cada 30s via Edge Function
  setInterval(async () => {
    try {
      const response = await fetch(`${CMS_URL}/totem-heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-totem-api-key': TOTEM_API_KEY,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          is_speaking: false, // Atualizar conforme estado real
          status_details: {
            uptime: process.uptime(),
            memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            version: '1.0.0',
          },
        }),
      });

      if (response.ok) {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] 💓 Heartbeat OK`);
      } else {
        const err = await response.json();
        console.error("❌ Heartbeat erro:", err.error);
      }
    } catch (err) {
      console.error("⚠️ Heartbeat falhou:", err.message);
    }
  }, 30000);

} else {
  console.log("⚠️ [AITI] Offline: Configure SUPABASE_URL e TOTEM_API_KEY no .env");
}


// ==========================================
// INICIALIZAÇÃO
// ==========================================

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║  🤖 Avatar AI - Porto Futuro 2                ║
║  📍 Belém, Pará                               ║
║  🌐 http://localhost:${PORT}                  ║
╚═══════════════════════════════════════════════╝
  `);
  
  loadCache();           // Carrega cache persistente
  await warmUpModels();  // Aquece os modelos
  
  console.log("\n✅ Sistema pronto! Aguardando requisições...\n");
});