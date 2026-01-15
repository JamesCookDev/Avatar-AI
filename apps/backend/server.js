import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { openAIChain, parser } from "./modules/openAI.mjs";
import { lipSync } from "./modules/lip-sync.mjs";
import { sendDefaultMessages, defaultResponse } from "./modules/defaultMessages.mjs";
import { convertAudioToText } from "./modules/whisper.mjs";
import multer from "multer";


dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const openAIApiKey = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

app.post("/tts", async (req, res) => {
  const userMessage = await req.body.message;
  const defaultMessages = await sendDefaultMessages({ userMessage });
  if (defaultMessages) {
    res.send({ messages: defaultMessages });
    return;
  }
const openAIApiKey = process.env.OPENAI_API_KEY;

if (!openAIApiKey) {
  const local = {
    messages: [
      {
        text: req.body.message,
        facialExpression: "smile",
        animation: "TalkingOne",
      },
    ],
  };
  const withLip = await lipSync({ messages: local.messages });
  res.send({ messages: withLip });
  return;
}
  let openAImessages;
  if (!openAIApiKey) {
  const local = {
    messages: [
      {
        text: userMessage,
        facialExpression: "smile",
        animation: "TalkingOne",
      },
    ],
  };
  const withLip = await lipSync({ messages: local.messages });
  res.send({ messages: withLip });
  return;
}
  try {
    openAImessages = await openAIChain.invoke({
      question: userMessage,
      format_instructions: parser.getFormatInstructions(),
    });
  } catch (error) {
    openAImessages = defaultResponse;
  }
  openAImessages = await lipSync({ messages: openAImessages.messages });
  res.send({ messages: openAImessages });
});

app.post("/sts", async (req, res) => {
  console.log("STS hit: bytes(base64) =", (req.body.audio || "").length);
  const base64Audio = req.body.audio;
  const audioData = Buffer.from(base64Audio, "base64");
  const userMessage = await convertAudioToText({ audioData });
  let openAImessages;
  try {
    openAImessages = await openAIChain.invoke({
      question: userMessage,
      format_instructions: parser.getFormatInstructions(),
    });
  } catch (error) {
    openAImessages = defaultResponse;
  }
  openAImessages = await lipSync({ messages: openAImessages.messages });
  res.send({ messages: openAImessages });
});

app.listen(port, () => {
  console.log(`Jack are listening on port ${port}`);
});

app.post("/whisper", upload.single("audio_file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "audio_file ausente" });
    }
    const text = await convertAudioToText({ audioData: req.file.buffer });
    return res.json({ text });
  } catch (e) {
    console.error("Whisper /whisper error:", e);
    return res.status(500).json({ error: "whisper_failed" });
  }
});

app.post("/chat", async (req, res) => {
  // reaproveita exatamente a mesma lógica do /tts
  req.url = "/tts";
  return app._router.handle(req, res);
});
