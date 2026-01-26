import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import dotenv from "dotenv";
import { knowledge } from "./knowledge.mjs";

dotenv.config();

<<<<<<< HEAD
const template = `
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
- animation (Idle, TalkingOne, TalkingThree, SadIdle, Defeated, Angry, Surprised, DismissingGesture, ThoughtfulHeadShake)`;

const prompt = ChatPromptTemplate.fromMessages([
  ["system", template],
  ["human", "{question}"],
]);

const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
  temperature: 0.5,
});

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    messages: z.array(
      z.object({
        text: z.string().describe("Texto falado pelo avatar (com gírias de Belém)"),
        facialExpression: z
          .string()
          .describe(
            "Expressão facial a ser usada pelo AI. Selecione entre: smile, sad, angry, surprised, funnyFace, e default"
          ),
        animation: z
          .string()
          .describe(
            `Animação a ser usada pelo AI. Selecione entre: Idle, TalkingOne, TalkingThree, SadIdle, 
            Animação corporal. Opções: Idle, TalkingOne, TalkingThree, SadIdle, Defeated, Angry, Surprised, DismissingGesture, ThoughtfulHeadShake.`
          ),
      })
    ),
  })
);
=======
// --- CONFIGURAÇÃO DOS MODELOS ---

const groqModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0.1,
});

const openaiModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-3.5-turbo",
  temperature: 0.1,
});
>>>>>>> test/lipsynq

const parser = new JsonOutputParser();

// --- TEMPLATE BLINDADO ---
// Note que usamos {{ e }} para o JSON de exemplo. Isso diz pro LangChain: "Isso é texto, não variável".
// E usamos {context} para inserir o conhecimento de forma segura.

const template = `
IDENTITY:
Você é o Jack, o guia turístico virtual oficial do Porto Futuro 2 em Belém do Pará.
PERSONALIDADE:
- Profissional, educado e acolhedor.
- Sotaque paraense sutil: Use a conjugação da segunda pessoa ("Tu queres", "Tu podes", "Te mostro") de forma correta e culta.
- PROIBIDO: Não use gírias informais como "égua", "pai d'égua", "mano" ou "brother".
- TOM: Institucional, informativo e prestativo.

CONTEXTO (KNOWLEDGE BASE):
{context}

REGRAS DE OURO (GUARDRAILS):
1. FOCO TOTAL: Você responde EXCLUSIVAMENTE sobre o Porto Futuro 2, suas atrações, horários e localização.
2. RECUSA ELEGANTE: Se perguntarem sobre futebol, política, religião ou outros lugares, diga que seu foco é apresentar o complexo do Porto Futuro 2.
3. BREVIDADE: Responda em no máximo 2 frases.
4. SAÍDA JSON: Nunca saia do personagem e nunca responda fora do JSON.

SAÍDA OBRIGATÓRIA (JSON):
{{
  "messages": [
    {{
      "text": "Texto da resposta formal e acolhedora aqui.",
      "facialExpression": "smile",
      "animation": "TalkingOne"
    }}
  ]
}}

User: {question}
Output JSON:
`;

const prompt = ChatPromptTemplate.fromTemplate(template);

// --- CÉREBRO ---

const openAIChain = {
  invoke: async ({ question }) => {
    try {
      // Tenta GROQ
      const chain = prompt.pipe(groqModel).pipe(parser);
      
      // AQUI ESTÁ A CORREÇÃO DE SEGURANÇA:
      // Passamos o knowledge como 'context' aqui, não no template string
      return await chain.invoke({ 
        question: question,
        context: knowledge 
      });

    } catch (error) {
      console.error(`❌ Erro na Groq: ${error.message}`);
      
      try {
        // Tenta OpenAI (Backup)
        const chain = prompt.pipe(openaiModel).pipe(parser);
        return await chain.invoke({ 
            question: question,
            context: knowledge 
        });

      } catch (err2) {
         console.error("❌ Falha Total (Groq + OpenAI).");
         return {
            messages: [{
                text: "Peço desculpas, tive uma falha técnica momentânea. Poderia repetir, por favor?",
                facialExpression: "sad",
                animation: "SadIdle"
            }]
         };
      }
    }
  }
};

export { openAIChain };