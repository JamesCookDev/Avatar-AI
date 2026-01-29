import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { performance } from "perf_hooks";

// Importação dos módulos
import { openAIChain } from "./modules/openAI.mjs";
import { lipSync } from "./modules/rhubarbLipSync.mjs";
import { convertAudioToText } from "./modules/whisper.mjs"; 
import kokoro from "./modules/kokoro.mjs";

dotenv.config();

const port = 3000;
const app = express();

// Configurações
const MAX_FILES_IN_DISK = 50; // Mantém a pasta limpa
const AUDIO_DIR = "audios";

app.use(express.json({ limit: "50mb" }));
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// 🧠 CACHE DE MEMÓRIA (RAM) - O SEGREDO DA VELOCIDADE
// Armazena a resposta pronta (JSON + Base64) para perguntas repetidas
const audioCache = new Map();

// --- FUNÇÃO DE LIMPEZA DE DISCO ---
async function manageDiskSpace() {
    try {
        if (!fs.existsSync(AUDIO_DIR)) return;

        const files = await fs.promises.readdir(AUDIO_DIR);
        if (files.length <= MAX_FILES_IN_DISK) return;

        // Mapeia e ordena por data (mais antigos primeiro)
        const fileStats = await Promise.all(files.map(async file => {
            const filePath = path.join(AUDIO_DIR, file);
            const stats = await fs.promises.stat(filePath);
            return { filePath, mtime: stats.mtime };
        }));

        fileStats.sort((a, b) => a.mtime - b.mtime);

        // Apaga o excesso
        const filesToDelete = fileStats.slice(0, files.length - MAX_FILES_IN_DISK);
        if (filesToDelete.length > 0) {
            console.log(`🧹 [Limpeza] Removendo ${filesToDelete.length} arquivos antigos...`);
            for (const file of filesToDelete) {
                await fs.promises.unlink(file.filePath).catch(() => {});
            }
        }
    } catch (error) {
        console.error("⚠️ Erro na limpeza:", error.message);
    }
}

// --- Rota Principal (/sts) ---
app.post("/sts", async (req, res) => {
  const requestId = Date.now();
  const startTime = performance.now();

  const log = (emoji, msg) => {
    const timeDiff = (performance.now() - startTime).toFixed(0);
    console.log(`[${requestId}][+${timeDiff}ms] ${emoji} ${msg}`);
  };

  log("🚀", "Nova requisição iniciada.");

  try {
    // 1. Validação
    const base64Audio = req.body.audio;
    if (!base64Audio) throw new Error("Nenhum áudio recebido.");
    
    const audioData = Buffer.from(base64Audio, "base64");
    log("📦", `Áudio: ${(audioData.length / 1024).toFixed(2)} KB`);

    // 2. Transcrição (Whisper)
    const t0_whisper = performance.now();
    const userMessage = await convertAudioToText({ audioData });
    log("✅", `Whisper (${(performance.now() - t0_whisper).toFixed(0)}ms): "${userMessage}"`);

    if (!userMessage || userMessage.trim() === "") {
        return res.send({ messages: [] });
    }

    // =========================================================
    // ⚡ SISTEMA DE CACHE (RAM) - RESTAURADO E PRIORITÁRIO
    // =========================================================
    const cacheKey = userMessage.toLowerCase().trim();
    
    if (audioCache.has(cacheKey)) {
        log("⚡", "CACHE HIT! Pergunta repetida. Respondendo instantaneamente da RAM.");
        
        // Pega a resposta pronta da memória e envia
        const cachedResponse = audioCache.get(cacheKey);
        res.send({ messages: cachedResponse });
        
        log("🏁", `Finalizado via Cache em ${(performance.now() - startTime).toFixed(0)}ms`);
        return; // <--- ENCERRA AQUI, NÃO GASTA MAIS NADA
    } else {
        log("💨", "Cache Miss. É uma pergunta nova. Processando...");
    }
    // =========================================================

    // 4. Inteligência (LLM)
    const t0_llm = performance.now();
    const aiResponse = await openAIChain.invoke({ question: userMessage });
    log("✅", `LLM (${(performance.now() - t0_llm).toFixed(0)}ms)`);

    // 5. Geração de Áudio e Boca
    const messages = [];
    if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

    for (const msg of aiResponse.messages) {
        // Hash curto para nome do arquivo
        const fileHash = crypto.createHash('md5').update(msg.text).digest('hex').substring(0, 10);
        const fileName = `${AUDIO_DIR}/speech_${fileHash}.wav`;

        // Cache de Disco (Evita regerar o mesmo áudio se ele ainda existir na pasta)
        if (!fs.existsSync(fileName)) {
            log("🎙️", `Gerando voz (Kokoro)...`);
            await kokoro.generate(msg.text, fileName);
            
            log("👄", `Gerando lipsync...`);
            await lipSync.generate(fileName);
        } else {
            log("⏩", `Áudio já existe no disco, reutilizando arquivo.`);
        }

        // Leitura dos arquivos
        const lipSyncPath = fileName.replace(".wav", ".json");
        const audioBuffer = await fs.promises.readFile(fileName);
        let lipSyncContent = [];
        
        try {
            lipSyncContent = JSON.parse(await fs.promises.readFile(lipSyncPath, "utf-8"));
        } catch (e) {
            log("⚠️", "JSON do lipsync não encontrado, usando padrão.");
        }

        messages.push({
            text: msg.text,
            audio: audioBuffer.toString("base64"),
            lipsync: lipSyncContent,
            facialExpression: msg.facialExpression || "smile",
            animation: msg.animation || "TalkingOne"
        });
    }

    // 💾 SALVA NO CACHE DE RAM AGORA
    // Da próxima vez que perguntarem isso, a resposta sai na hora.
    audioCache.set(cacheKey, messages);
    log("💾", "Resposta salva no Cache de RAM.");
    
    // Envia resposta
    res.send({ messages });
    log("🏁", `Concluído em ${(performance.now() - startTime).toFixed(0)}ms`);

    // Limpeza de disco em segundo plano
    setTimeout(manageDiskSpace, 100); 

  } catch (error) {
    log("❌", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.get("/health", (req, res) => res.send("Jack está ON com Cache!"));

app.listen(port, () => {
  console.log(`🚀 Jack ouvindo na porta ${port}`);
  console.log(`⚡ Cache de RAM: ATIVADO`);
  console.log(`🧹 Limpeza de Disco: ATIVADO (Max ${MAX_FILES_IN_DISK} arquivos)`);
});