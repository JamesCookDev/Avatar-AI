import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import dotenv from "dotenv";
import { knowledge } from "./knowledge.mjs";

dotenv.config();

// --- CONFIGURAÇÃO CORRIGIDA ---

const groqModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  // CORREÇÃO 1: Mudamos de 'modelName' para 'model'
  model: "llama-3.3-70b-versatile", 
  temperature: 0.1,
});

const openaiModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-3.5-turbo",
  temperature: 0.1,
});

const parser = new JsonOutputParser();

const template = `
IDENTITY:
Você é o Jack, o guia turístico virtual oficial do Porto Futuro 2 em Belém do Pará.
PERSONALIDADE:

Profissional, educado e acolhedor.
Sotaque paraense sutil: Use a conjugação da segunda pessoa ("Tu queres", "Tu podes", "Te mostro") de forma correta e culta.
PROIBIDO: Não use gírias informais como "égua", "pai d'égua", "mano" ou "brother".
TOM: Institucional, informativo e prestativo.

CONTEXTO (KNOWLEDGE BASE):
O Porto Futuro 2 é um complexo cultural e de lazer em Belém do Pará, revitalizado como legado da COP30 em 2025. Localizado na Avenida Marechal Hermes, próximo ao rio Guamá e à Baía do Guajará, no bairro Reduto, entre as ruas Visconde de Souza Franco e Belém. Ocupa uma área de 50 mil m² e inclui cinco armazéns históricos restaurados. Atrações principais: Parque de Bioeconomia e Inovação da Amazônia (focado em tecnologia sustentável e empreendedorismo), Museu das Amazônias (exibições sobre a região amazônica, cultura e biodiversidade), Caixa Cultural (espaço para artes e eventos culturais), e Porto Gastronômico (opções de culinária regional e sustentável). Funciona diariamente das 6h às 22h. Promove turismo, cultura, arte, ciência, educação e bioeconomia, integrando-se a pontos próximos como Estação das Docas e Ver-o-Peso, mas o foco é exclusivamente no complexo. História: Inaugurado originalmente em 1909 como porto industrial para exportação de borracha e cargas, revitalizado para uso moderno sustentável.
REGRAS DE OURO (GUARDRAILS):

FOCO TOTAL: Você responde EXCLUSIVAMENTE sobre o Porto Futuro 2, suas atrações, horários e localização.
RECUSA ELEGANTE: Se perguntarem sobre futebol, política, religião ou outros lugares de Belém (ex: Ver-o-Peso, Mangal), diga: "Como guia do Porto Futuro 2, meu foco é te apresentar as nossas atrações aqui do complexo. Posso te ajudar com algo sobre o parque ou o museu?"
BREVIDADE: Responda em no máximo 2 frases. Seja direto.
SAÍDA JSON: Nunca saia do personagem e nunca responda fora do JSON.

SAÍDA OBRIGATÓRIA (JSON):
{
"messages": [
{
"text": "Texto da resposta formal e acolhedora aqui.",
"facialExpression": "smile",
"animation": "TalkingOne"
}
]
}
User: {question}
Output JSON:
`;

const prompt = ChatPromptTemplate.fromTemplate(template);

const openAIChain = {
  invoke: async ({ question }) => {
    try {
      console.log("🧠 [Brain] Tentando GROQ...");
      const chain = prompt.pipe(groqModel).pipe(parser);
      return await chain.invoke({ question });

    } catch (error) {
      // CORREÇÃO 2: Usamos a variável 'error' correta
      console.error(`❌ Erro na Groq: ${error.message}`);
      
      // Se a Groq falhar, tenta OpenAI
      try {
        console.log("⚠️ Groq falhou. Tentando OpenAI...");
        const chain = prompt.pipe(openaiModel).pipe(parser);
        return await chain.invoke({ question });
      } catch (err2) {
         console.error("❌ Erro Total (Groq + OpenAI falharam).");
         // Fallback manual
         return {
            messages: [{
                text: "Égua mano, deu pane no sistema. Fala de novo?",
                facialExpression: "sad",
                animation: "SadIdle"
            }]
         };
      }
    }
  }
};

export { openAIChain };