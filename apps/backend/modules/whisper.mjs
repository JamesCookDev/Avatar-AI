import fs from "fs";
import path from "path";
import OpenAI, { toFile } from "openai"; // <--- Importação nova 'toFile'
import { convertAudioToWav } from "../utils/audios.mjs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function convertAudioToText({ audioData }) {
  const mp3AudioData = await convertAudioToMp3({ audioData });
  const outputPath = "/tmp/output.mp3";
  fs.writeFileSync(outputPath, mp3AudioData);
  const loader = new OpenAIWhisperAudio(outputPath, {
  clientOptions: { apiKey: openAIApiKey },
  whisperOptions: {
    language: "pt",
    task: "transcribe"
  }
});
  const doc = (await loader.load()).shift();
  const transcribedText = doc.pageContent;
  fs.unlinkSync(outputPath);
  return transcribedText;
}

// --- FLUXO PRINCIPAL ---
async function convertAudioToText({ audioData }) {
  console.log("🔹 [Whisper] Iniciando processamento...");

  try {
    // 1. Converte e já pega o BUFFER (Não o caminho do arquivo)
    // A função convertAudioToWav que fizemos já retorna o buffer no final!
    const wavBuffer = await convertAudioToWav({ audioData });

    // Se o buffer vier vazio, para tudo
    if (!wavBuffer || wavBuffer.length === 0) {
      throw new Error("Buffer de áudio vazio após conversão.");
    }

    let text = "";

    // 2. Tenta GROQ (Grátis)
    if (groqClient) {
      try {
        console.log("🚀 [STT] Tentando via GROQ (Memória)...");
        const response = await transcribe(groqClient, wavBuffer, "whisper-large-v3");
        text = response.text;
        console.log(`✅ [STT] Sucesso via Groq: "${text}"`);
        return text; // Se deu certo, retorna e sai
      } catch (err) {
        console.warn("⚠️ [STT] Groq falhou. Motivo:", err.message);
      }
    }

    // 3. Tenta OPENAI (Pago - Fallback)
    if (openaiClient) {
      try {
        console.log("💸 [STT] Tentando via OPENAI (Memória)...");
        const response = await transcribe(openaiClient, wavBuffer, "whisper-1");
        text = response.text;
        console.log(`✅ [STT] Sucesso via OpenAI: "${text}"`);
        return text;
      } catch (err) {
        console.error("❌ [STT] OpenAI falhou. Motivo:", err.message);
        throw err; // Joga o erro pra cima se o último falhar
      }
    }

    throw new Error("Nenhum cliente de IA configurado ou disponível.");

  } catch (error) {
    console.error("❌ [Whisper] Erro Fatal:", error);
    throw error;
  }
}

export { convertAudioToText };