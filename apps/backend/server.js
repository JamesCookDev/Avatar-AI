import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import { openAIChain } from "./modules/openAI.mjs"; o
import { lipSync } from "./modules/rhubarbLipSync.mjs";
import { convertAudioToText } from "./modules/whisper.mjs";
import kokoro from "./modules/kokoro.mjs"; 
import crypto from "crypto"; 

dotenv.config();

const groqKey = process.env.GROQ_API_KEY;
console.log("\n🔑 --- DIAGNÓSTICO DE CHAVES ---");
if (!groqKey) {
  console.error("❌ ERRO: A variável GROQ_API_KEY não existe no .env!");
} else {
  console.log(`✅ Chave Groq detectada. Tamanho: ${groqKey.length} caracteres.`);
}
console.log("----------------------------------\n");

const app = express();
app.use(express.json({ limit: "50mb" })); 
app.use(cors());
const port = 3000;

// 🧠 MEMÓRIA DE TOTEM (Cache em RAM)
const audioCache = new Map();

app.post("/sts", async (req, res) => {
  const requestId = Date.now();
  console.log(`\n=== [${requestId}] Nova requisição /sts ===`);
  console.time(`🕒 Tempo Total ${requestId}`);
  
  try {
    // ---------------------------------------------------------
    // 0. RECEBIMENTO DO ÁUDIO
    // ---------------------------------------------------------
    const base64Audio = req.body.audio;
    if (!base64Audio) throw new Error("Nenhum áudio recebido no body");

    const audioData = Buffer.from(base64Audio, "base64");
    console.log(`📦 [Server] Áudio recebido: ${(audioData.length / 1024).toFixed(2)} KB`);

    // ---------------------------------------------------------
    // 1. WHISPER (Ouvido)
    // ---------------------------------------------------------
    const userMessage = await convertAudioToText({ audioData });
    console.log(`🗣️ Usuário disse: "${userMessage}"`);

    // Se não entendeu nada, retorna vazio
    if (!userMessage || userMessage.trim().length === 0) {
      console.warn("⚠️ [Server] Áudio inaudível ou silêncio.");
      return res.send({ messages: [] });
    }

    // ---------------------------------------------------------
    // ⚡ CACHE CHECK (A Otimização de Velocidade)
    // ---------------------------------------------------------
    // Cria uma chave única (ex: "que horas abre" == "que horas abre?")
    const cacheKey = userMessage.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos

    if (audioCache.has(cacheKey)) {
      console.log(`⚡ CACHE HIT! Respondendo instantaneamente para: "${userMessage}"`);
      const cachedData = audioCache.get(cacheKey);
      
      res.send({ messages: cachedData });
      
      console.timeEnd(`🕒 Tempo Total ${requestId}`);
      return; // <--- ENCERRA AQUI SE ACHAR NO CACHE
    }

    // ---------------------------------------------------------
    // 2. CÉREBRO (Se não estava no cache, pensa...)
    // ---------------------------------------------------------
    let openAImessages;
    try {
      openAImessages = await openAIChain.invoke({ question: userMessage });
    } catch (error) {
      console.error("❌ Erro na IA:", error.message);
      openAImessages = { 
          messages: [{ 
              text: "Desculpe, mano, deu um erro aqui.", 
              animation: "SadIdle", 
              facialExpression: "sad" 
          }] 
      };
    }

    // ---------------------------------------------------------
    // 3. GERAÇÃO DE ÁUDIO UNIFICADO
    // ---------------------------------------------------------
    console.time("🕒 Kokoro & LipSync ÚNICO");

    // A. Junta tudo num texto só
    const fullText = openAImessages.messages
      .map((msg) => msg.text)
      .join(" ");

    // B. Pega animação da primeira mensagem
    const mainAnimation = openAImessages.messages[0]?.animation || "TalkingOne";
    const mainExpression = openAImessages.messages[0]?.facialExpression || "default";

    console.log(`🗣️ Gerando Novo Áudio: "${fullText.substring(0, 40)}..."`);

    // C. Gera arquivos com nome baseado no conteúdo (hash) para não sobrescrever
    // Usamos um Hash MD5 da pergunta para o nome do arquivo, ajuda no debug
    const fileHash = crypto.createHash('md5').update(cacheKey).digest('hex');
    const fileName = `speech_${fileHash}.wav`;
    
    // Gera áudio (Kokoro)
    const audioPath = await kokoro.generate(fullText, `audios/${fileName}`);

    // Gera boca (Rhubarb)
    const lipSyncPath = await lipSync.generate(audioPath);

    console.timeEnd("🕒 Kokoro & LipSync ÚNICO");

    // ---------------------------------------------------------
    // 4. LEITURA E ENVIO
    // ---------------------------------------------------------
    const audioBuffer = await fs.promises.readFile(audioPath);
    const lipSyncContent = JSON.parse(await fs.promises.readFile(lipSyncPath, "utf-8"));

    const finalResponse = [
      {
        text: fullText,
        audio: audioBuffer.toString("base64"),
        lipsync: lipSyncContent,
        facialExpression: mainExpression,
        animation: mainAnimation,
      },
    ];

    // 💾 SALVA NO CACHE (Para a próxima vez ser rápido)
    audioCache.set(cacheKey, finalResponse);
    console.log(`💾 Guardado na memória: "${cacheKey}"`);

    console.log("✅ [Server] Enviando resposta nova.");
    res.send({ messages: finalResponse });
    
    console.timeEnd(`🕒 Tempo Total ${requestId}`);
    console.log("========================================\n");

  } catch (err) {
    console.error("\n❌ [Server] ERRO FATAL EM /sts:");
    console.error(err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/voices", async (req, res) => res.send([]));

app.listen(port, () => {
  console.log(`🚀 Jack (Versão Totem Cache) ouvindo na porta ${port}`);
});