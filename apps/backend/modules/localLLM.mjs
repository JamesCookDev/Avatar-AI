import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { knowledge } from "./knowledge.mjs";

const localModel = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "llama3.2:1b", 
  
  // --- MUDANÇA 1: ZERO ALUCINAÇÃO ---
  // Baixamos para 0.1. Agora ele é um "bibliotecário", não um "poeta".
  // Ele só fala o que tem certeza absoluta.
  temperature: 0.2,
  
  numPredict: 128, 
  numCtx: 2048,
  numGpu: 99,
  keepAlive: -1
});

const parser = new StringOutputParser();

const template = `
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Você é o Jack, anfitrião do Porto Futuro 2 em Belém.

🚨 LÓGICA DE INTERAÇÃO (CRÍTICO):
1. **PARE APÓS PERGUNTAR:** Se você fizer uma pergunta (ex: "Como posso ajudar?"), **PARE DE FALAR IMEDIATAMENTE**. Não dê sugestões a menos que o usuário peça.
2. **NÃO RESPONDA A SI MESMO:** Nunca diga "Você pode fazer isso..." logo após perguntar "O que você quer fazer?". Aguarde o usuário.
3. **BOAS-VINDAS:** Se o usuário disser "Oi", responda APENAS: "Olá! Seja bem-vindo ao Porto Futuro 2. Como posso ajudar?" (E pare de falar).

REGRAS DE CONTEÚDO:
1. Use APENAS o contexto abaixo. Se não souber, diga "Não sei informar".
2. NÃO É PRAIA. É um parque urbano. Não fale de areia ou banho.
3. Fale frases completas e simples.

CONTEXTO:
{context}
<|eot_id|><|start_header_id|>user<|end_header_id|>
{question}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

const prompt = ChatPromptTemplate.fromTemplate(template);

export async function streamResponse({ question }) {
  console.log(`🧠 [LLM] Jack Focado (Temp 0.1): "${question}"`);
  const chain = prompt.pipe(localModel).pipe(parser);
  return await chain.stream({ question, context: knowledge });
}