import { convertTextToSpeech } from "./kokoro.mjs";
import { getPhonemes } from "./rhubarbLipSync.mjs";
import { readJsonTranscript, audioFileToBase64 } from "../utils/files.mjs";

const lipSync = async ({ messages }) => {
  // 2. Geração do Áudio
  await Promise.all(
    messages.map(async (message, index) => {
      // Mude a extensão para .wav
      const fileName = `audios/message_${index}.wav`; 

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await convertTextToSpeech({ text: message.text, fileName });
          await delay(RETRY_DELAY);
          break;
        } catch (error) {
          console.error("Erro no Kokoro TTS:", error);
          // mantém retry simples
          if (attempt < MAX_RETRIES - 1) await delay(RETRY_DELAY);
          else throw error;
        }
      }
      console.log(`Message ${index} converted to speech (Kokoro)`);
    })
  );

  // 3. Geração dos Visemas (LipSync)
  await Promise.all(
    messages.map(async (message, index) => {
      const fileName = `audios/message_${index}.mp3`;
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