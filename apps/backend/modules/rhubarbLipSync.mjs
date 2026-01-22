import { exec } from "child_process";
import path from "path";
import fs from "fs";

// Caminhos dos executáveis na pasta 'bin'
const RHUBARB_PATH = path.resolve("bin", "rhubarb.exe");
const FFMPEG_PATH = path.resolve("bin", "ffmpeg.exe");

// Função auxiliar para rodar comandos no terminal
const runCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Erro no comando: ${command}`);
        console.error(stderr);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

const lipSync = {
  generate: async (audioFile) => {
    try {
      const absAudioFile = path.resolve(audioFile);
      const absJsonFile = absAudioFile.replace(".wav", ".json");
      
      // Arquivo temporário "limpo" (16-bit PCM) para o Rhubarb ler
      const tempCleanAudio = absAudioFile.replace(".wav", "_clean.wav");

      console.log(`🛠️ [LipSync] Convertendo áudio para 16-bit compatível...`);

      // 1. CONVERSÃO COM FFMPEG
      // -y: Sobrescreve se existir
      // -ac 1: Mono (Melhor para lipsync)
      // -ar 16000: Taxa de amostragem padrão
      // -acodec pcm_s16le: O formato OBRIGATÓRIO (16-bit)
      const convertCmd = `"${FFMPEG_PATH}" -y -i "${absAudioFile}" -acodec pcm_s16le -ac 1 -ar 16000 "${tempCleanAudio}"`;
      
      await runCommand(convertCmd);

      if (!fs.existsSync(tempCleanAudio)) {
        throw new Error("FFmpeg falhou ao criar o áudio convertido.");
      }

      console.log(`👄 [LipSync] Gerando visemas (Rhubarb)...`);

      // 2. GERAÇÃO DE VISEMAS COM RHUBARB (Usando o áudio limpo)
      const rhubarbCmd = `"${RHUBARB_PATH}" -f json -o "${absJsonFile}" "${tempCleanAudio}" -r phonetic`;
      
      await runCommand(rhubarbCmd);

      // 3. VERIFICAÇÃO FINAL
      if (fs.existsSync(absJsonFile)) {
        const stats = fs.statSync(absJsonFile);
        if (stats.size > 0) {
          console.log(`✅ [LipSync] Sucesso! JSON gerado (${stats.size} bytes).`);
          
          // Limpeza: Apaga o áudio temporário para não encher o disco
          try { fs.unlinkSync(tempCleanAudio); } catch (e) {}
          
          return absJsonFile;
        }
      }

      throw new Error("Arquivo JSON foi criado mas está vazio.");

    } catch (error) {
      console.error("❌ ERRO FATAL NO LIPSYNC:", error.message);
      throw error; // Repassa o erro para o server.js tratar
    }
  },
};

export { lipSync };