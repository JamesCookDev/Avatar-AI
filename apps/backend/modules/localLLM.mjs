import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { knowledge as defaultKnowledge } from "./knowledge.mjs";
import { getAIConfig, getDefaultConfig } from "./aiConfig.mjs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODELO LOCAL (Ollama)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const createModel = (config = {}) => new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: config.model || "llama3.2:1b", 
  temperature: config.temperature ?? 0.3,
  numPredict: config.maxTokens || 50,
  numCtx: 2048,
  numGpu: 99,
  keepAlive: -1
});

const parser = new StringOutputParser();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEMPLATE DINÂMICO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const createTemplate = (systemPrompt) => `${systemPrompt}

{context}

Pergunta: {question}
Resposta:`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNÇÕES EXPORTADAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Stream de resposta da IA com configuração dinâmica
 * @param {Object} params
 * @param {string} params.question - Pergunta do usuário
 * @param {string} params.tenantId - ID do tenant/cliente (opcional)
 * @param {Object} params.config - Config override (opcional)
 */
export async function streamResponse({ question, tenantId = null, config = null }) {
  // Busca configuração do CMS ou usa override
  const aiConfig = config || await getAIConfig(tenantId);
  
  console.log(`🧠 [LLM] Pergunta: "${question}"`);
  console.log(`🧠 [LLM] Config: ${aiConfig.avatar?.name || 'Padrão'} | Model: ${aiConfig.model}`);
  
  // Cria modelo com configurações dinâmicas
  const model = createModel(aiConfig);
  
  // Monta template com prompt do CMS
  const template = createTemplate(aiConfig.prompt);
  const prompt = ChatPromptTemplate.fromTemplate(template);
  
  // Usa knowledge do CMS ou fallback para local
  const context = aiConfig.knowledge || defaultKnowledge;
  
  const chain = prompt.pipe(model).pipe(parser);
  return await chain.stream({ question, context });
}

/**
 * Resposta completa (não streaming) com configuração dinâmica
 */
export async function getResponse({ question, tenantId = null, config = null }) {
  const aiConfig = config || await getAIConfig(tenantId);
  
  console.log(`🧠 [LLM] Pergunta: "${question}"`);
  
  const model = createModel(aiConfig);
  const template = createTemplate(aiConfig.prompt);
  const prompt = ChatPromptTemplate.fromTemplate(template);
  const context = aiConfig.knowledge || defaultKnowledge;
  
  const chain = prompt.pipe(model).pipe(parser);
  return await chain.invoke({ question, context });
}

/**
 * Versão legada (compatibilidade com código existente)
 * Usa configuração padrão local
 * @deprecated Use streamResponse com tenantId
 */
export async function streamResponseLegacy({ question }) {
  console.log(`🧠 [LLM] Pergunta (legacy): "${question}"`);
  
  const config = getDefaultConfig();
  const model = createModel(config);
  
  const template = `Você é o assistente virtual do Porto Futuro 2 em Belém do Pará.

{context}

Responda a pergunta abaixo de forma CURTA e OBJETIVA. Apenas 1 frase. Só responda o que foi perguntado.

Pergunta: {question}
Resposta:`;

  const prompt = ChatPromptTemplate.fromTemplate(template);
  const chain = prompt.pipe(model).pipe(parser);
  
  return await chain.stream({ question, context: defaultKnowledge });
}