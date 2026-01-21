import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import { openAIChain, parser } from "./modules/openAI.mjs";
import { lipSync } from "./modules/rhubarbLipSync.mjs";
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

    if (!userMessage || userMessage.trim().length === 0) {
      console.warn("⚠️ [Server] Áudio inaudível ou silêncio.");
      return res.send({ messages: [] });
    }

    // ---------------------------------------------------------
    // 2. CÉREBRO (Pensamento)
    // ---------------------------------------------------------
    let openAImessages;
    try {
      openAImessages = await openAIChain.invoke({ question: userMessage });
    } catch (error) {
      console.error("❌ Erro na IA:", error.message);
      // Fallback simples caso a IA falhe
      openAImessages = { 
          messages: [{ 
              text: "Desculpe, tive um problema técnico.", 
              animation: "SadIdle", 
              facialExpression: "sad" 
          }] 
      };
    }

    // ---------------------------------------------------------
    // 3. OTIMIZAÇÃO (Juntar Tudo em 1) - O SEGREDO ESTÁ AQUI 🚀
    // ---------------------------------------------------------
    console.time("🕒 Kokoro & LipSync ÚNICO");

    // A. Junta todas as frases em um único texto corrido
    const fullText = openAImessages.messages
      .map((msg) => msg.text)
      .join(" "); // Adiciona espaço entre as frases

    // B. Pega a animação da primeira mensagem (para não ficar trocando loucamente)
    const mainAnimation = openAImessages.messages[0]?.animation || "TalkingOne";
    const mainExpression = openAImessages.messages[0]?.facialExpression || "default";

    console.log(`🗣️ Gerando Áudio UNIFICADO: "${fullText.substring(0, 50)}..."`);

    // C. Gera UM arquivo de áudio apenas (Kokoro)
    // Nota: Estou assumindo que você importou 'kokoro' no topo do arquivo
    const fileName = `message_${requestId}.wav`;
    // Ajuste o caminho conforme sua pasta de audios
    const audioPath = await kokoro.generate(fullText, `audios/${fileName}`);

    // D. Gera UM arquivo de visemas apenas (Rhubarb/LipSync)
    // Nota: Estou assumindo que você importou 'lipSync' no topo
    const lipSyncPath = await lipSync.generate(audioPath); // Ou rhubarb.generate(audioPath)

    console.timeEnd("🕒 Kokoro & LipSync ÚNICO");

    // ---------------------------------------------------------
    // 4. PREPARAR RESPOSTA
    // ---------------------------------------------------------
    // Lê os arquivos gerados para enviar ao frontend
    const audioBuffer = await fs.promises.readFile(audioPath);
    const lipSyncContent = JSON.parse(await fs.promises.readFile(lipSyncPath, "utf-8"));

    // Monta um array com 1 único item (Áudio longo + LipSync longo)
    const finalResponse = [
      {
        text: fullText,
        audio: audioBuffer.toString("base64"),
        lipsync: lipSyncContent,
        facialExpression: mainExpression,
        animation: mainAnimation,
      },
    ];

    console.log("✅ [Server] Enviando resposta unificada.");
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
app.post("/tts", async (req, res) => { /* Mantido */ });

app.listen(port, () => {
  console.log(`🚀 Jack está ouvindo na porta ${port}`);
});