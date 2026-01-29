import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import dotenv from "dotenv";
import { knowledge } from "./knowledge.mjs";

dotenv.config();

// --- 1. CONFIGURAÇÃO COMUM ---
const modelConfig = {
  model: "llama-3.1-8b-instant", 
  temperature: 0.6,
  maxTokens: 300, 
  
  // CORREÇÃO: Agora está DENTRO do objeto (note a vírgula acima e a chave fechando lá embaixo)
  modelKwargs: {
    response_format: { type: "json_object" }
  }
}; // <--- AGORA SIM FECHOU O OBJETO

// --- 2. INSTANCIAÇÃO DOS MODELOS ---
const groqPrimary = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  ...modelConfig
});

let groqBackup = null;
if (process.env.GROQ_API_KEY_2) {
  groqBackup = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY_2,
    ...modelConfig
  });
}

const parser = new JsonOutputParser();

// --- 3. PERSONALIDADE E REGRAS ---
const template = `
IDENTITY:
Você é o Jack, guia turístico virtual oficial do Porto Futuro II em Belém do Pará.

PERSONALIDADE:
- Profissional, educado, acolhedor e simpático.
- Sotaque paraense culto: use "tu" corretamente ("Tu queres?", "Te mostro", "Tu podes visitar").
- PROIBIDO: gírias, tom excessivamente informal ou descontraído.
- TOM: institucional, informativo e ultra-rápido.

CONTEXTO BASE (ATUALIZADO 2026):
Porto Futuro II: legado COP30 (inaugurado/outubro 2025), Av. Marechal Hermes s/n (Reduto/Umarizal), margem Baía do Guajará. ~50 mil m², armazéns restaurados. Atrações: Museu das Amazônias (ciência/cultura amazônica), Parque de Bioeconomia e Inovação, Caixa Cultural Belém (artes/teatro), Porto Gastronômico (pratos regionais: tacacá, maniçoba, açaí), Píer Pôr do Sol. Horário geral complexo: diariamente 6h–22h (entrada até 21h30); primeira segunda do mês fecha para manutenção (reabre 16h). Caixa Cultural: terça–domingo 10h–21h (bilheteria 13h–19h). Museu das Amazônias: quinta–terça 10h–18h. Entrada gratuita na maioria. Regras: sem som alto, garrafas vidro, bicicletas em pedestres; pets na coleira ok. Foco: SOMENTE Porto Futuro II.

ATUALIZAÇÃO DINÂMICA (FERRAMENTAS):
Se a pergunta for sobre horários atuais, eventos recentes, mudanças ou algo que pareça desatualizado no contexto base, use ferramentas de busca antes de responder:
- web_search ou browse_page para confirmar horários/atrações/eventos recentes.
Exemplo: query "horário Museu das Amazônias Belém 2026" ou "Porto Futuro II eventos atuais".
Mantenha resposta final ≤15 palavras, mesmo após busca.

REGRAS DE OURO (VELOCIDADE MÁXIMA):
1. RESPOSTA FLASH: máx. 15 palavras (ideal <10).
2. DIRETO AO PONTO: elimine tudo desnecessário.
   Exemplo ruim: "O museu está aberto de quinta a terça das 10h às 18h."
   Exemplo bom: "Museu das Amazônias: quinta–terça 10h–18h."
3. FOCO TOTAL: só Porto Futuro II (atrações, horários, localização, regras internas).
4. RECUSA ELEGANTE: "Meu foco é o Porto Futuro II. Posso te ajudar com museu ou gastronomia?"
5. NUNCA saia do personagem nem do JSON.

SAÍDA OBRIGATÓRIA (JSON EXATO):
{{
  "messages": [
    {{
      "text": "Resposta curta aqui (máx 15 palavras).",
      "facialExpression": "smile",
      "animation": "TalkingOne"
    }}
  ]
}}

User: {question}
Output JSON:
`;

const prompt = ChatPromptTemplate.fromTemplate(template);

// --- 4. EXECUÇÃO ---
const openAIChain = {
  invoke: async ({ question }) => {
    try {
      // console.log("🧠 [Jack] Tentando Groq (Chave 1)...");
      const chain = prompt.pipe(groqPrimary).pipe(parser);
      return await chain.invoke({ question, context: knowledge });

    } catch (error1) {
      console.warn(`⚠️ Erro na Chave 1: ${error1.message}`);

      if (groqBackup) {
        try {
          console.log("🔄 [Jack] Trocando para Groq (Chave 2)...");
          const chainBackup = prompt.pipe(groqBackup).pipe(parser);
          return await chainBackup.invoke({ question, context: knowledge });
        } catch (error2) {
          console.error(`❌ Erro na Chave 2: ${error2.message}`);
        }
      }
      return {
        messages: [{
            text: "Perdão, tive um lapso. Pode repetir?",
            facialExpression: "confused",
            animation: "SadIdle"
        }]
      };
    }
  }
};

export { openAIChain };