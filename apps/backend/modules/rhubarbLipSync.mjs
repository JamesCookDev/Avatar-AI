import { execCommand } from "../utils/files.mjs";
import path from "path";
import os from "os";

const getPhonemes = async ({ message }) => {
  try {
    const time = new Date().getTime();
    console.log(`👄 [LipSync] Iniciando visemas para mensagem ${message}`);

    // 1. Detecta se é Windows
    const isWindows = os.platform() === "win32";
    
    // 2. Define o nome do executável correto
    const binName = isWindows ? "rhubarb.exe" : "rhubarb";
    
    // 3. Cria o caminho ABSOLUTO (C:\Users\...\bin\rhubarb.exe)
    // Isso resolve o erro de '.' não reconhecido
    const binPath = path.join(process.cwd(), "bin", binName);

    // 4. Caminhos dos arquivos
    const audioFile = path.join("audios", `message_${message}.wav`);
    const jsonFile = path.join("audios", `message_${message}.json`);

    // 5. Comando blindado com aspas (para evitar erro com espaços na pasta)
    const command = `"${binPath}" -f json -o "${jsonFile}" "${audioFile}" -r phonetic`;

    console.log(`🔧 [LipSync] Executando comando: ${command}`);

    await execCommand({ command });

    console.log(`✅ [LipSync] Sucesso em ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`❌ [LipSync] Erro fatal:`, error);
  }
};

export { getPhonemes };