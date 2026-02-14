/**
 * Hook para sincronizar configurações do CMS com o Avatar local.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// CONFIGURAÇÃO
const CMS_API_URL = import.meta.env.VITE_CMS_API_URL || 'https://xdvnwzgsyzghfzkumcmg.supabase.co/functions/v1';
const API_KEY = import.meta.env.VITE_TOTEM_API_KEY;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const POLL_INTERVAL = parseInt(import.meta.env.VITE_CMS_POLL_INTERVAL) || 5000;

// CONFIGURAÇÃO PADRÃO
const DEFAULT_CONFIG = {
  colors: {
    primary: '#ffffff',
    secondary: '#cccccc',
    shirt: '#2563EB',
    pants: '#1F2937',
    shoes: '#111827',
  },
  textures: {
    logo: null,
    baseTexture: null,
    roughnessMap: null,
  },
  material: {
    type: 'cotton',
    roughness: 0.5,
    metalness: 0.0,
  },
  // Configuração de UI
  ui: {
    title: 'Assistente Virtual',
    subtitle: 'Totem Interativo',
    cta_text: 'Como posso ajudar?',
    menu_title: 'Escolha uma opção',
    menu_subtitle: 'Respostas rápidas disponíveis',
    quick_actions: [
      { label: 'Informações', icon: 'ℹ️', prompt: 'Quem é você?', color: 'from-teal-400 to-cyan-400' },
    ],
  },
};

export function useCMSConfig(options = {}) {
  const { avatarId = null, pollInterval = POLL_INTERVAL } = options;
  
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const lastUpdatedRef = useRef(null);
  const abortControllerRef = useRef(null);
  const retryCountRef = useRef(0);

  const fetchConfig = useCallback(async (isInitial = false) => {
    if (!API_KEY) {
      setConfig(DEFAULT_CONFIG);
      setIsOffline(true);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const url = new URL(`${CMS_API_URL}/totem-config`);
      if (avatarId) url.searchParams.set('avatar_id', avatarId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-totem-api-key': API_KEY,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.config) {
        // 🆕 Busca configuração de UI do CMS (ui_settings ou ui)
        const uiConfig = data.ui || data.config.ui_settings || data.config.ui || DEFAULT_CONFIG.ui;
        
        const newConfig = {
          colors: data.colors || data.config.colors || DEFAULT_CONFIG.colors,
          textures: data.textures || data.config.textures || DEFAULT_CONFIG.textures,
          material: data.material || data.config.material || DEFAULT_CONFIG.material,
          ui: {
            ...DEFAULT_CONFIG.ui,
            ...uiConfig,
          },
        };
        
        setConfig(newConfig);
        lastUpdatedRef.current = data.config.updated_at || Date.now();
        
        setError(null);
        setIsOffline(false);
        retryCountRef.current = 0;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Mantive apenas o erro crítico, removi avisos menores
      retryCountRef.current++;
      if (retryCountRef.current >= 3) {
        setConfig(DEFAULT_CONFIG);
        setIsOffline(true);
        setError(null); 
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [avatarId]);

  // Polling automático (SILENCIOSO)
  useEffect(() => {
    fetchConfig(true);

    const intervalId = setInterval(() => {
      if (!isOffline) {
        // Log removido aqui para limpar o console
        fetchConfig(false);
      }
    }, pollInterval);

    return () => {
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchConfig, pollInterval, isOffline]);

  // Tentar reconectar (SILENCIOSO)
  useEffect(() => {
    if (!isOffline) return;
    const reconnectId = setInterval(() => {
      retryCountRef.current = 0;
      setIsOffline(false);
      fetchConfig(true);
    }, 30000);
    return () => clearInterval(reconnectId);
  }, [isOffline, fetchConfig]);

  const refresh = useCallback(() => {
    retryCountRef.current = 0;
    setIsOffline(false);
    fetchConfig(true);
  }, [fetchConfig]);

  const colors = config?.colors || DEFAULT_CONFIG.colors;
  const textures = config?.textures || DEFAULT_CONFIG.textures;
  const material = config?.material || DEFAULT_CONFIG.material;
  const ui = config?.ui || DEFAULT_CONFIG.ui;

  return {
    config,
    // Expõe configuração de UI
    ui: {
      title: ui.title || DEFAULT_CONFIG.ui.title,
      subtitle: ui.subtitle || DEFAULT_CONFIG.ui.subtitle,
      cta_text: ui.cta_text || DEFAULT_CONFIG.ui.cta_text,
      menu_title: ui.menu_title || DEFAULT_CONFIG.ui.menu_title,
      menu_subtitle: ui.menu_subtitle || DEFAULT_CONFIG.ui.menu_subtitle,
      quick_actions: ui.quick_actions || DEFAULT_CONFIG.ui.quick_actions,
    },
    colors: {
      primary: colors.primary || DEFAULT_CONFIG.colors.primary,
      secondary: colors.secondary || DEFAULT_CONFIG.colors.secondary,
      shirt: colors.shirt || colors.primary || DEFAULT_CONFIG.colors.shirt,
      pants: colors.pants || DEFAULT_CONFIG.colors.pants,
      shoes: colors.shoes || DEFAULT_CONFIG.colors.shoes,
    },
    textures: {
      logo: textures.logo || null,
      baseTexture: textures.baseTexture || null,
      roughnessMap: textures.roughnessMap || null,
    },
    material: {
      type: material.type || 'cotton',
      roughness: material.roughness ?? 0.5,
      metalness: material.metalness ?? 0.0,
    },
    loading,
    error,
    isConnected: !isOffline && !error && !loading,
    isOffline,
    refresh,
  };
}

export function useCMSListener(callback) {
  useEffect(() => {
    const handler = (event) => callback(event.detail);
    window.addEventListener('cms-config-updated', handler);
    return () => window.removeEventListener('cms-config-updated', handler);
  }, [callback]);
}

export default useCMSConfig;