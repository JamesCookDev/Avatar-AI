/**
 * Módulo de Configuração Dinâmica da IA
 * 
 * Busca prompt e knowledge base do CMS (Lovable) para cada tenant/cliente.
 * Permite escalar para múltiplos clientes com configurações diferentes.
 */

import dotenv from "dotenv";
dotenv.config();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIGURAÇÃO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CMS_API_URL = process.env.CMS_API_URL || 'https://iwqcltmeniotzbowbxzg.supabase.co/functions/v1';
const API_KEY = process.env.TOTEM_API_KEY;
const CACHE_TTL = parseInt(process.env.AI_CONFIG_CACHE_TTL) || 60000; // 1 minuto

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIGURAÇÃO PADRÃO (fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_CONFIG = {
  prompt: `Você é um assistente virtual amigável.
Responda de forma CURTA e OBJETIVA. Apenas 1 frase.
Seja educado e prestativo.`,
  
  knowledge: `[SOBRE MIM]
Sou um assistente virtual.
Estou aqui para ajudar você.`,
  
  model: "llama3.2:1b",
  temperature: 0.3,
  maxTokens: 50,
  
  avatar: {
    name: "Assistente",
    voice: "af_bella",
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CACHE DE CONFIGURAÇÕES POR TENANT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const configCache = new Map();

/**
 * Busca configuração de IA do CMS
 * @param {string} tenantId - ID do cliente/tenant (null = config padrão)
 * @returns {Promise<Object>} Configuração da IA
 */
export async function getAIConfig(tenantId = null) {
  const cacheKey = tenantId || 'default';
  
  // Verifica cache
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`🧠 [AI Config] Cache hit: ${cacheKey}`);
    return cached.config;
  }
  
  // Se não tem API Key, usa config padrão
  if (!API_KEY) {
    console.warn('⚠️ [AI Config] TOTEM_API_KEY não configurada - usando config padrão');
    return DEFAULT_CONFIG;
  }
  
  try {
    const url = new URL(`${CMS_API_URL}/ai-config`);
    if (tenantId) url.searchParams.set('tenant_id', tenantId);
    
    console.log(`🧠 [AI Config] Buscando config: ${cacheKey}`);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-totem-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5s timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.config) {
      const config = {
        prompt: data.config.system_prompt || DEFAULT_CONFIG.prompt,
        knowledge: data.config.knowledge_base || DEFAULT_CONFIG.knowledge,
        model: data.config.model || DEFAULT_CONFIG.model,
        temperature: data.config.temperature ?? DEFAULT_CONFIG.temperature,
        maxTokens: data.config.max_tokens ?? DEFAULT_CONFIG.maxTokens,
        avatar: {
          name: data.config.avatar_name || DEFAULT_CONFIG.avatar.name,
          voice: data.config.voice || DEFAULT_CONFIG.avatar.voice,
        }
      };
      
      // Salva no cache
      configCache.set(cacheKey, {
        config,
        timestamp: Date.now(),
      });
      
      console.log(`✅ [AI Config] Configuração carregada: ${config.avatar.name}`);
      return config;
    }
    
    throw new Error('Resposta inválida do CMS');
    
  } catch (err) {
    console.error(`❌ [AI Config] Erro: ${err.message} - usando config padrão`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Invalida cache de um tenant específico
 * @param {string} tenantId 
 */
export function invalidateCache(tenantId = null) {
  const cacheKey = tenantId || 'default';
  configCache.delete(cacheKey);
  console.log(`🗑️ [AI Config] Cache invalidado: ${cacheKey}`);
}

/**
 * Invalida todo o cache
 */
export function clearAllCache() {
  configCache.clear();
  console.log(`🗑️ [AI Config] Cache limpo completamente`);
}

/**
 * Retorna config padrão (para uso offline)
 */
export function getDefaultConfig() {
  return DEFAULT_CONFIG;
}

export default {
  getAIConfig,
  invalidateCache,
  clearAllCache,
  getDefaultConfig,
};
