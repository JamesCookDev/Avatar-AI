import { exec } from "child_process";
import fs from "fs";
import path from "path";

const ensureTmpDir = () => {
  const tmpDir = "tmp";
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
};

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

// MUDANÇA: Agora converte para WAV
const convertAudioToWav = async ({ audioData }) => {
  ensureTmpDir();
  
  const inputPath = path.resolve("tmp/input.webm");
  const outputPath = path.resolve("tmp/output.wav");

  // 1. Escreve o WebM no disco
  await fs.promises.writeFile(inputPath, audioData);

  // 2. Converte para WAV (PCM 16kHz Mono - Super rápido e leve para IA)
  // -acodec pcm_s16le: Codec padrão WAV
  // -ar 16000: Taxa de amostragem ideal para Whisper (reduz tamanho)
  // -ac 1: Mono (reduz tamanho pela metade)
  await execCommand(`ffmpeg -y -i "${inputPath}" -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`);

  // 3. Lê o arquivo convertido
  const wavData = await fs.promises.readFile(outputPath);

  return wavData;
};

export { convertAudioToWav };