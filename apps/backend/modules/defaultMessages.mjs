import { audioFileToBase64, readJsonTranscript } from "../utils/files.mjs";
import dotenv from "dotenv";
dotenv.config();

const openAIApiKey = process.env.OPENAI_API_KEY;
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;

const kokoroUrl = (process.env.KOKORO_TTS_URL || "").trim();

async function tryKokoroTTS(text) {
  if (!kokoroUrl) return null;

  try {
    // Endpoint genérico: POST { text } e retorna audio bytes (wav/mp3)
    const res = await fetch(kokoroUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error("Kokoro TTS error:", res.status, await res.text());
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Se o frontend espera "data:audio/wav;base64,", coloque aqui:
    // (vamos ajustar conforme o formato que seu front usa)
    return `data:audio/wav;base64,${base64}`;
  } catch (err) {
    console.error("Kokoro TTS fetch failed:", err);
    return null;
  }
}

async function sendDefaultMessages({ userMessage }) {
  let messages;

  if (!userMessage) {
    messages = [
      {
        text: "Hey there... How was your day?",
        audio: await audioFileToBase64({ fileName: "audios/intro_0.wav" }),
        lipsync: await readJsonTranscript({ fileName: "audios/intro_0.json" }),
        facialExpression: "smile",
        animation: "TalkingOne",
      },
      {
        text: "I'm Jack, your personal AI assistant. I'm here to help you with anything you need.",
        audio: await audioFileToBase64({ fileName: "audios/intro_1.wav" }),
        lipsync: await readJsonTranscript({ fileName: "audios/intro_1.json" }),
        facialExpression: "smile",
        animation: "TalkingTwo",
      },
    ];
    return messages;
  }
}
  // Resposta padrão
const defaultResponse = [
  {
    text: "I'm sorry, there seems to be an error with my brain, or I didn't understand. Could you please repeat your question?",
    facialExpression: "sad",
    animation: "Idle",
  },
];

export { sendDefaultMessages, defaultResponse };
