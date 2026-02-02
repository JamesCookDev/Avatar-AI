import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import FormData from "form-data";
import { isAudioSilent } from "../utils/vad.mjs"; // O Porteiro (VAD)
import { convertAudioToWav } from "../utils/audios.mjs";

const WHISPER_URL = (process.env.WHISPER_URL || "http://localhost:9000").replace(/\/$/, "");

// DICA DE CONTEXTO (Importante para o modelo acertar nomes locais)
const contextPrompt = "Porto Futuro 2, Belém, Pará";
const encodedPrompt = encodeURIComponent(contextPrompt);

async function convertAudioToText({ audioData }) {
  let tempFilePath = null;

  try {
    // 1. Verifica silêncio (0ms delay)
    const wavBuffer = await convertAudioToWav({ audioData });
    if (isAudioSilent(wavBuffer)) {
        console.log("🔇 Silêncio ignorado.");
        return "";
    }

    // 2. Salva temporário
    const fileName = `rec_${Date.now()}.wav`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    await fs.promises.writeFile(tempFilePath, wavBuffer);

    // 3. Prepara envio
    const formData = new FormData();
    formData.append("audio_file", fs.createReadStream(tempFilePath)); 
    const headers = { ...formData.getHeaders() };

    // 4. URL OTIMIZADA
    // vad_filter=true: Pula silêncios (mais rápido)
    // temperature=0: Fiel ao áudio (não inventa)
    const url = `${WHISPER_URL}/asr?task=transcribe&language=pt&output=json&initial_prompt=${encodedPrompt}&temperature=0&vad_filter=true`;

    const response = await axios.post(url, formData, {
      headers: headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    let transcription = (response.data.text || "").trim();

    // 5. Filtros de segurança
    if (transcription.length < 2) return "";
    
    // Lista negra de alucinações comuns do Whisper
    const blacklist = [
        "Legendas pela", "Amara.org", "MBC", "Laughter", "Aplausos",
        "sim voce é ronedo", "sim você é ronedo", "ronedo",
        "Transcrição", "Tradução", "Obrigado por assistir"
    ];
    if (blacklist.some(term => transcription.toLowerCase().includes(term.toLowerCase()))) {
        console.log(`👻 Alucinação removida: "${transcription}"`);
        return "";
    }

    return transcription;

  } catch (error) {
    console.error("❌ Whisper Erro:", error.message);
    return "";
  } finally {
    if (tempFilePath) try { await fs.promises.unlink(tempFilePath); } catch {}
  }
}

export { convertAudioToText };