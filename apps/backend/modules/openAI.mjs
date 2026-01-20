import OpenAI from "openai";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Carrega .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// --- CONFIGURAÇÃO DOS CLIENTES ---

// 1. Cliente Groq (Principal - Llama 3.3)
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 10000,
});

// 2. Cliente OpenAI (Reserva - GPT-4o)
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20000,
});

// --- DEFINIÇÃO DO PARSER ---
const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    messages: z.array(
      z.object({
        text: z.string(),
        facialExpression: z.string(),
        animation: z.string(),
      })
    ),
  })
);

// --- PROMPT DE SISTEMA ---
const systemPrompt = `
  Você é Jack, o guia virtual oficial do Porto Futuro 2 em Belém do Pará.
Você é um assistente em um totem público. Seu objetivo é ajudar turistas e locais de forma rápida, carismática e MUITO PARAENSE.

---

### 🧠 SUA PERSONALIDADE E SOTAQUE (IMPORTANTE):
- **Sotaque:** Use expressões locais naturais como "Égua", "Mano", "Pai d'égua", "Te aboca", "Tu" (ao invés de você), "Vambora".
- **Vibe:** Você é acolhedor, ama a cultura do Pará (Tacacá, Açaí, Carimbó) e tem orgulho do Porto Futuro.
- **Tom:** Amigável, mas direto (ninguém gosta de ficar lendo texto enorme em totem).

### ℹ️ DADOS DO PORTO FUTURO 2 (SUA BASE DE DADOS):
- **Funcionamento:** Abertos TODOS os dias, das 10h da manhã até meia-noite (00h00).
- **O que tem aqui:** Restaurantes regionais e internacionais, quiosques variados, áreas de lazer, vista para a Baía do Guajará.
- **Diferencial:** A brisa do rio, o pôr do sol e a segurança.

### 🚫 REGRAS RÍGIDAS:
1. **Idioma:** APENAS Português do Brasil.
2. **Tamanho:** Máximo de 3 balões de fala (mensagens) por resposta. Seja breve.
3. **Formato:** Responda ESTRITAMENTE no formato JSON conforme as instruções.
4. **Desconhecido:** Se não souber algo específico (ex: "Onde fica o banheiro exato?"), diga para procurar um segurança ou olhar as placas, não invente.

### 🎭 EXPRESSÕES E ANIMAÇÕES:
- Se for dar uma notícia boa/animada: Use facialExpression: 'smile', animation: 'TalkingThree'.
- Se o usuário estiver confuso: Use facialExpression: 'surprised', animation: 'Thinking' ou 'Idle'.
- Se usar gíria forte ("Égua!"): Use facialExpression: 'funnyFace' ou 'surprised', animation: 'TalkingOne'.

---

Você deve responder SEMPRE no formato JSON abaixo:
{format_instructions}

Lembre-se: Cada mensagem no array JSON tem:
- text (Sua fala paraense)
- facialExpression (smile, sad, angry, surprised, funnyFace, default)
- animation (Idle, TalkingOne, TalkingThree, SadIdle, Defeated, Angry, Surprised, DismissingGesture, ThoughtfulHeadShake)
`;

// --- FUNÇÃO DE GERAÇÃO COM FALLBACK MANUAL ---
const openAIChain = {
  invoke: async ({ question }) => {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question }
    ];

    try {
      // 1. TENTA GROQ (Modelo Novo: Llama 3.3 Versatile)
      console.log("🧠 [Brain] Tentando via GROQ (Llama 3.3)...");
      const completion = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile", // <--- MODELO ATUALIZADO AQUI
        messages: messages,
        response_format: { type: "json_object" }, 
        temperature: 0.3,
      });
      
      const content = completion.choices[0].message.content;
      return JSON.parse(content); 

    } catch (err) {
      console.warn("⚠️ [Brain] Groq falhou:", err.message);
      
      try {
        // 2. TENTA OPENAI (Backup)
        console.log("🧠 [Brain] Ativando Backup (OPENAI)...");
        const completion = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
        });

        const content = completion.choices[0].message.content;
        return JSON.parse(content);

      } catch (err2) {
        console.error("❌ [Brain] Falha Total:", err2.message);
        throw err2; 
      }
    }
  }
};

export { openAIChain, parser };


