import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// URL do Kokoro (ajuste se necessário, mas o padrão do container é esse)
const KOKORO_URL = process.env.KOKORO_API_URL || "http://localhost:8880/v1/audio/speech";

const kokoro = {
  generate: async (text, fileName) => {
    try {
      console.log(`🗣️ Gerando áudio Kokoro para: "${text.substring(0, 20)}..."`);
      
      const response = await fetch(KOKORO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: "pm_alex", // Escolha sua voz aqui
          response_format: "wav", // Importante: WAV para o Rhubarb
          speed: 1.0
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro Kokoro: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Salva o arquivo na pasta audios (ex: audios/message_0.wav)
      const filePath = path.resolve(fileName); 
      await fs.promises.writeFile(filePath, buffer);
      
      console.log(`✅ Arquivo salvo: ${filePath}`);
      return filePath;

    } catch (error) {
      console.error("❌ Erro no Kokoro:", error);
      throw error;
    }
  },
};

export default kokoro;