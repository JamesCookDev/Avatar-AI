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

dotenv.config();

const port = 3000;
const app = express();
const AUDIO_DIR = "audios";
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

app.use(express.json({ limit: "50mb" }));
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const audioCache = new Map();

app.post("/sts", async (req, res) => {
  const requestId = Date.now();
  const startTime = performance.now();
  
  // LOG DETALHADO
  const log = (emoji, msg) => {
      const t = (performance.now() - startTime).toFixed(0);
      console.log(`[${requestId}][+${t}ms] ${emoji} ${msg}`);
  };

  try {
    log("🔌", "Recebendo requisição...");
    const base64Audio = req.body.audio;
    if (!base64Audio) {
        log("⚠️", "Áudio vazio recebido.");
        return res.json({ messages: [] });
    }
    
    // 1. Whisper
    log("🎤", "Enviando para Whisper...");
    const audioData = Buffer.from(base64Audio, "base64");
    const userMessage = await convertAudioToText({ audioData });
    
    if (!userMessage) {
        log("🔇", "Silêncio ou ruído detectado pelo Whisper.");
        return res.json({ messages: [] });
    }
    log("🗣️", `Texto reconhecido: "${userMessage}"`);

    // Cache
    if (audioCache.has(userMessage.toLowerCase())) {
        log("⚡", "RESPOSTA EM CACHE ENCONTRADA!");
        return res.json({ messages: audioCache.get(userMessage.toLowerCase()) });
    }

    // 2. Stream IA
    log("🧠", "Iniciando Llama (Streaming)...");
    const stream = await streamResponse({ question: userMessage });
    
    let buffer = "";
    const pendingPromises = []; 

    // O EXORCISTA DE SÍMBOLOS (Remove Asteriscos)
    const cleanAndGenerate = (rawText) => {
        if (rawText.includes("Como posso ajudar")) {
            buffer = "";
        }
        
        let cleanText = rawText
            .replace(/[*#\-_•\[\]()]/g, "") // Remove símbolos gráficos
            .replace(/^\d+\.\s*/g, "")      // Remove "1. " no início
            .replace(/\s+/g, " ")           // Remove espaços duplos
            .trim();

        if (cleanText.length < 2) {
            log("🗑️", `Texto ignorado (muito curto/sujo): "${rawText}"`);
            return;
        }

        log("📝", `Frase limpa capturada: "${cleanText}"`);
        
        const fileHash = crypto.createHash('md5').update(cleanText).digest('hex').substring(0, 10);
        const fileName = `${AUDIO_DIR}/speech_${fileHash}.wav`;
        
        const p = (async () => {
            if (!fs.existsSync(fileName)) {
                log("🎙️", `Gerando áudio (Kokoro) para: "${cleanText.substring(0, 15)}..."`);
                await kokoro.generate(cleanText, fileName);
                log("👄", `Gerando LipSync...`);
                await lipSync.generate(fileName);
            } else {
                log("♻️", `Áudio já existe no disco.`);
            }
            
            const audioBuffer = await fs.promises.readFile(fileName);
            const lipSyncPath = fileName.replace(".wav", ".json");
            let lipSyncContent = [];
            try { lipSyncContent = JSON.parse(await fs.promises.readFile(lipSyncPath, "utf-8")); } catch(e) {}

            return {
                text: cleanText,
                audio: audioBuffer.toString("base64"),
                lipsync: lipSyncContent,
                facialExpression: "smile",
                animation: "TalkingOne"
            };
        })();
        
        pendingPromises.push(p);
    };

    // 3. Consome o Stream
    for await (const chunk of stream) {
        buffer += chunk;
        
        // Regex de fim de frase
        if (buffer.match(/[.?!:\n]\s*$/)) {
            const sentence = buffer.trim();
            buffer = ""; 
            cleanAndGenerate(sentence);
        }
    }
    if (buffer.trim()) cleanAndGenerate(buffer.trim());

    log("⏳", "Aguardando finalização dos áudios paralelos...");
    const results = await Promise.all(pendingPromises);
    
    audioCache.set(userMessage.toLowerCase(), results);
    
    log("🏁", `Enviando resposta com ${results.length} frases.`);
    res.json({ messages: results });

  } catch (error) {
    log("❌", `ERRO FATAL: ${error.message}`);
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`🚀 Jack Turbo ON na porta ${port}`));