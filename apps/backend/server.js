import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import { openAIChain, parser } from "./modules/openAI.mjs";
import { lipSync } from "./modules/lip-sync.mjs";
import { sendDefaultMessages, defaultResponse } from "./modules/defaultMessages.mjs";
import { convertAudioToText } from "./modules/whisper.mjs";
import kokoro from "./modules/kokoro.mjs"; 

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

app.post("/sts", async (req, res) => {
  const requestId = Date.now();
  console.log(`\n=== [${requestId}] Nova requisição /sts ===`);
  console.time(`🕒 Tempo Total ${requestId}`);

  try {
    const base64Audio = req.body.audio;
    if (!base64Audio) throw new Error("Nenhum áudio recebido no body");

    const audioData = Buffer.from(base64Audio, "base64");
    console.log(`📦 [Server] Áudio recebido: ${(audioData.length / 1024).toFixed(2)} KB`);
    
    // 1. WHISPER (Áudio -> Texto)
    const userMessage = await convertAudioToText({ audioData });
    console.log(`🗣️ Usuário disse: "${userMessage}"`);
    
    if (!userMessage || userMessage.trim().length === 0) {
        console.warn("⚠️ [Server] Áudio inaudível ou silêncio.");
        return res.send({ messages: [] });
    }

    // 2. CÉREBRO (Texto -> Resposta JSON)
    let openAImessages;
    try {
      // CORREÇÃO AQUI: Não fazemos mais JSON.parse(), pois openAIChain já retorna objeto!
      openAImessages = await openAIChain.invoke({
        question: userMessage
      });
    } catch (error) {
      console.error("❌ Erro na IA, usando resposta padrão:", error.message);
      openAImessages = { messages: defaultResponse };
    }

    // 3. KOKORO + LIPSYNC (Resposta -> Áudio + Boca)
    console.time("🕒 Kokoro & LipSync");
    
    // CORREÇÃO: Chamamos lipSync apenas uma vez!
    const finalMessages = await lipSync({ messages: openAImessages.messages });
    
    console.timeEnd("🕒 Kokoro & LipSync");

    // 4. RETORNO
    res.send({ messages: finalMessages });
    
    console.log("✅ [Server] Enviando resposta para o frontend.");
    console.timeEnd(`🕒 Tempo Total ${requestId}`);
    console.log("========================================\n");

  } catch (err) {
    console.error("\n❌ [Server] ERRO FATAL EM /sts:");
    console.error(err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/voices", async (req, res) => res.send([]));
app.post("/tts", async (req, res) => { /* Mantido */ });

app.listen(port, () => {
  console.log(`🚀 Jack está ouvindo na porta ${port}`);
});