import { exec } from "child_process";
import path from "path";
import fs from "fs";

// Ajuste este caminho se o seu rhubarb.exe estiver em outro lugar
// Geralmente está em apps/backend/bin/rhubarb.exe
const RHUBARB_PATH = path.resolve("bin", "rhubarb.exe"); 

const lipSync = {
  generate: async (audioFile) => {
    return new Promise((resolve, reject) => {
      const time = Date.now();
      
      // Define onde salvar o JSON (mesmo nome do audio, mas .json)
      const jsonFile = audioFile.replace(".wav", ".json");
      
      console.log(`👄 [LipSync] Gerando visemas para: ${path.basename(audioFile)}`);

      // Comando: rhubarb -f json -o output.json input.wav -r phonetic
      const args = [
        "-f", "json",
        "-o", `"${jsonFile}"`,
        `"${audioFile}"`,
        "-r", "phonetic"
      ];

      const command = `"${RHUBARB_PATH}" ${args.join(" ")}`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Erro no Rhubarb: ${error.message}`);
          reject(error);
          return;
        }

        console.log(`✅ [LipSync] JSON salvo: ${jsonFile}`);
        resolve(jsonFile);
      });
    });
  },
};

export { lipSync };