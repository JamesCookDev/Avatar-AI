<<<<<<< HEAD
import { convertTextToSpeech } from "./kokoro.mjs";
=======
// 1. Mude a importação
import kokoro from "./kokoro.mjs"; 
>>>>>>> test/lipsynq
import { getPhonemes } from "./rhubarbLipSync.mjs";
import { readJsonTranscript, audioFileToBase64 } from "../utils/files.mjs";

const lipSync = async ({ messages }) => {
  // 2. Geração do Áudio
  await Promise.all(
    messages.map(async (message, index) => {
      // Mude a extensão para .wav
      const fileName = `audios/message_${index}.wav`; 

<<<<<<< HEAD
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
=======
      // Chame o Kokoro
      await kokoro.generate(message.text, fileName);
      console.log(`Message ${index} converted to speech`);
>>>>>>> test/lipsynq
    })
  );

  // 3. Geração dos Visemas (LipSync)
  await Promise.all(
    messages.map(async (message, index) => {
<<<<<<< HEAD
      const fileName = `audios/message_${index}.mp3`;
=======
      // Ajuste para ler .wav
      const fileName = `audios/message_${index}.wav`;
      const jsonFile = `audios/message_${index}.json`;

>>>>>>> test/lipsynq
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