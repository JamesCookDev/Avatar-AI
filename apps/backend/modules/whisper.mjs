import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import FormData from "form-data";
// CORREÇÃO 1: Usa dois pontos (..) porque estamos dentro de 'modules'
import { convertAudioToWav } from "../utils/audios.mjs";

const WHISPER_URL = (process.env.WHISPER_URL || "http://localhost:9000").replace(/\/$/, "");

async function convertAudioToText({ audioData }) {
  let tempFilePath = null;

  try {
    const wavBuffer = await convertAudioToWav({ audioData });
    const fileName = `rec_${Date.now()}.wav`;
    tempFilePath = path.join(os.tmpdir(), fileName);
    await fs.promises.writeFile(tempFilePath, wavBuffer);

    const formData = new FormData();
    // CORREÇÃO 2: A imagem onerahmet exige 'audio_file'
    formData.append("audio_file", fs.createReadStream(tempFilePath)); 

    const headers = { ...formData.getHeaders() };

    // CORREÇÃO 3: Rota compatível com a imagem onerahmet
    const url = `${WHISPER_URL}/asr?task=transcribe&language=pt&output=json`;

    const response = await axios.post(url, formData, {
      headers: headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const transcription = response.data.text || "";
    return transcription.trim();

  } catch (error) {
    console.error("❌ [Whisper Erro]:", error.message);
    if (error.response) console.error("Detalhes:", error.response.data);
    return "";
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { await fs.promises.unlink(tempFilePath); } catch (e) {}
    }
  }
}

export { convertAudioToText };