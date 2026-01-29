import fs from "fs";
import path from "path";
// REMOVI A LINHA DO NODE-FETCH QUE CAUSA O CRASH

const KOKORO_URL = process.env.KOKORO_API_URL || "http://localhost:8880/v1/audio/speech";

const kokoro = {
  generate: async (text, fileName) => {
    try {
      console.log(`🗣️ Gerando áudio Kokoro para: "${text.substring(0, 20)}..."`);
      
      // O 'fetch' já existe nativo no seu Node.js, não precisa importar
      const response = await fetch(KOKORO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: "pm_alex", 
          response_format: "wav", 
          speed: 1.15
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro Kokoro: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const filePath = path.resolve(fileName); 
      await fs.promises.writeFile(filePath, buffer);
      
      console.log(`✅ Arquivo salvo: ${filePath}`);
      return filePath;

    } catch (error) {
      console.error("❌ Erro no Kokoro:", error.message);
      throw error;
    }
  },
};

export default kokoro;