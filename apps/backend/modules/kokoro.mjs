import fs from "fs";
import path from "path";

// URL do Docker do Kokoro
const KOKORO_URL = process.env.KOKORO_API_URL || "http://localhost:8880/v1/audio/speech";

const kokoro = {
  generate: async (text, fileName) => {
    try {
      // 1. Otimização de Texto: Remove quebras de linha que confundem a IA
      const cleanText = text.replace(/\n/g, " ").trim();
      
      console.log(`🗣️ [Kokoro] Gerando (${cleanText.length} chars)...`);
      const t0 = performance.now();

      const response = await fetch(KOKORO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: cleanText,
          voice: "pm_alex", // Voz masculina padrão rápida
          response_format: "wav",
          
          // --- OTIMIZAÇÃO DE VELOCIDADE ---
          // 1.0 = Normal | 1.25 = 25% mais rápido (Gera o arquivo mais rápido)
          speed: 1.25 
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro Kokoro API: ${response.statusText}`);
      }

      // Baixa e salva o binário
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const filePath = path.resolve(fileName); 
      await fs.promises.writeFile(filePath, buffer);

      const timeTaken = (performance.now() - t0).toFixed(0);
      console.log(`✅ Áudio salvo em ${timeTaken}ms`);
      
      return filePath;

    } catch (error) {
      console.error("❌ Erro CRÍTICO no Kokoro:", error.message);
      // Se falhar, joga o erro para o servidor tentar tratar ou ignorar
      throw error;
    }
  },
};

export default kokoro;