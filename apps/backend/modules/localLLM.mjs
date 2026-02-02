import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { knowledge } from "./knowledge.mjs";

const localModel = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "llama3.2:1b", 
  
  temperature: 0.3,
  numPredict: 50,
  numCtx: 2048,
  numGpu: 99,
  keepAlive: -1
});

const parser = new StringOutputParser();

const template = `Você é o assistente virtual do Porto Futuro 2 em Belém do Pará.

{context}

Responda a pergunta abaixo de forma CURTA e OBJETIVA. Apenas 1 frase. Só responda o que foi perguntado.

Pergunta: {question}
Resposta:`;

const prompt = ChatPromptTemplate.fromTemplate(template);

export async function streamResponse({ question }) {
  console.log(`🧠 [LLM] Pergunta: "${question}"`);
  const chain = prompt.pipe(localModel).pipe(parser);
  return await chain.stream({ question, context: knowledge });
}