import fs from "fs/promises";
import path from "path";

<<<<<<< HEAD
const KOKORO_BASE_URL = (process.env.KOKORO_BASE_URL || "http://localhost:8880").trim();
const KOKORO_VOICE = (process.env.KOKORO_VOICE || "af_heart").trim();
const KOKORO_SPEED = Number(process.env.KOKORO_SPEED || "1");
const KOKORO_MODEL = (process.env.KOKORO_MODEL || "kokoro").trim();

// Util: garante pasta de saída
async function ensureDirForFile(fileName) {
  const fullPath = path.join(process.cwd(), fileName);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  return fullPath;
}

/**
 * Gera áudio via Kokoro-FastAPI (OpenAI-compatible) e salva em fileName.
 * Espera fileName como "audios/message_0.mp3"
 */
async function convertTextToSpeech({ text, fileName }) {
  if (!text || !text.trim()) {
    throw new Error("Texto vazio para TTS");
  }

  const url = `${KOKORO_BASE_URL}/v1/audio/speech`;
  const outPath = await ensureDirForFile(fileName);

  // A API é "OpenAI-compatible": input é o campo do texto
  const payload = {
    model: KOKORO_MODEL,
    input: text,
    voice: KOKORO_VOICE,
    response_format: "mp3",
    download_format: "mp3",
    speed: KOKORO_SPEED,
    // IMPORTANTE: para facilitar, vamos desativar stream e pedir retorno direto
    stream: false,
    return_download_link: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pedindo áudio; se o servidor retornar JSON em vez de bytes,
      // o fallback abaixo vai capturar
      Accept: "audio/mpeg,application/octet-stream,application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Kokoro HTTP ${res.status}: ${errText}`);
  }

  // Alguns wrappers retornam bytes de áudio direto; outros retornam JSON (string/link).
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    // Pode ser "string" (ex.: link) conforme o Swagger mostra
    const data = await res.json().catch(async () => await res.text());
    // Se vier uma string, pode ser base64, pode ser filename, pode ser link.
    // Vamos tratar o caso mais comum do remsky: retornar filename quando usa temp storage.
    if (typeof data === "string") {
      // Se parecer um filename, tenta baixar
      // Ex.: "abc123.mp3" → /v1/download/abc123.mp3
      const maybeFile = data.replace(/"/g, "").trim();
      const dl = await fetch(`${KOKORO_BASE_URL}/v1/download/${encodeURIComponent(maybeFile)}`);
      if (!dl.ok) {
        const t = await dl.text().catch(() => "");
        throw new Error(`Kokoro download falhou: ${dl.status} ${t}`);
      }
      const buf = Buffer.from(await dl.arrayBuffer());
      await fs.writeFile(outPath, buf);
      return;
=======
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
>>>>>>> feat/iaLocal
    }

    throw new Error(`Resposta JSON inesperada do Kokoro: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // Caso padrão: bytes do mp3
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

export { convertTextToSpeech };

