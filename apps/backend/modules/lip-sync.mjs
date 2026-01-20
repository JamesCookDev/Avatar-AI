// 1. Mude a importação
import kokoro from "./kokoro.mjs"; 
import { getPhonemes } from "./rhubarbLipSync.mjs";
import { readJsonTranscript, audioFileToBase64 } from "../utils/files.mjs";

const lipSync = async ({ messages }) => {
  // 2. Geração do Áudio
  await Promise.all(
    messages.map(async (message, index) => {
      // Mude a extensão para .wav
      const fileName = `audios/message_${index}.wav`; 

      // Chame o Kokoro
      await kokoro.generate(message.text, fileName);
      console.log(`Message ${index} converted to speech`);
    })
  );

  // 3. Geração dos Visemas (LipSync)
  await Promise.all(
    messages.map(async (message, index) => {
      // Ajuste para ler .wav
      const fileName = `audios/message_${index}.wav`;
      const jsonFile = `audios/message_${index}.json`;

      try {
        await getPhonemes({ message: index }); // Isso vai ler o .wav e criar o .json
        message.audio = await audioFileToBase64({ fileName }); // Lê o áudio .wav para mandar pro front
        message.lipsync = await readJsonTranscript({ fileName: jsonFile });
      } catch (error) {
        console.error(`Error while getting phonemes for message ${index}:`, error);
      }
    })
  );

  return messages;
};

export { lipSync };