/**
 * useCMSConfig — Polling + Supabase Realtime (Live Preview do Hub)
 * 
 * Variáveis de ambiente necessárias no .env local:
 *   VITE_CMS_API_URL=https://<project>.supabase.co/functions/v1
 *   VITE_TOTEM_API_KEY=<api_key do dispositivo no Hub>
 *   VITE_SUPABASE_ANON_KEY=<anon key do projeto>
 *   VITE_TOTEM_DEVICE_ID=<id do dispositivo — para Realtime>
 *   VITE_CMS_POLL_INTERVAL=15000   (opcional, padrão 15s)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const CMS_API_URL    = import.meta.env.VITE_CMS_API_URL    || '';
const API_KEY        = import.meta.env.VITE_TOTEM_API_KEY  || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const DEVICE_ID      = import.meta.env.VITE_TOTEM_DEVICE_ID || '';
const POLL_INTERVAL  = parseInt(import.meta.env.VITE_CMS_POLL_INTERVAL) || 15000;

// Extrair URL base do Supabase a partir da URL da edge function
const SUPABASE_URL = CMS_API_URL.replace('/functions/v1', '');

// Cliente Supabase para Realtime (Broadcast)
let supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export function useCMSConfig(options = {}) {
  const { pollInterval = POLL_INTERVAL } = options;

  const [ui, setUi] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLive, setIsLive] = useState(false); // true quando conectado via Realtime

  const abortRef = useRef(null);
  const lastHashRef = useRef('');

  // ──────────────────────────────────────────────────────────────────
  // 1. FETCH polling — busca a config completa na edge function
  // ───────────��──────────────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    if (!CMS_API_URL || !API_KEY) {
      console.warn('[CMS] VITE_CMS_API_URL ou VITE_TOTEM_API_KEY não configurados.');
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${CMS_API_URL}/totem-config`, {
        method: 'GET',
        headers: {
          'x-totem-api-key': API_KEY,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newUi = data?.ui || data?.config?.ui || {};

      const hash = JSON.stringify(newUi);
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        setUi(newUi);
      }

      setError(null);
      setIsOffline(false);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[CMS] Falha na conexão:', err.message);
        setIsOffline(true);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling inicial + intervalo
  useEffect(() => {
    fetchConfig();
    const id = setInterval(() => {
      if (!isOffline) fetchConfig();
    }, pollInterval);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchConfig, pollInterval, isOffline]);

  // ──────────────────────────────────────────────────────────────────
  // 2. REALTIME — canal live-preview:{deviceId} (Supabase Broadcast)
  //    O Hub envia via Realtime quando o editor está aberto.
  //    Isso garante atualização instantânea sem esperar o polling.
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!DEVICE_ID) {
      console.warn('[Realtime] VITE_TOTEM_DEVICE_ID não configurado — Realtime desativado.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[Realtime] Não foi possível criar cliente Supabase.');
      return;
    }

    console.log(`[Realtime] Inscrevendo no canal live-preview:${DEVICE_ID}`);

    const channel = supabase
      .channel(`live-preview:${DEVICE_ID}`)
      .on('broadcast', { event: 'ui-update' }, ({ payload }) => {
        // Hub envia craft_blocks (JSON string dos nós Craft.js)
        const craftBlocks = payload?.craft_blocks;
        if (!craftBlocks) return;
        if (craftBlocks !== lastHashRef.current) {
          lastHashRef.current = craftBlocks;
          setUi(prev => ({ ...prev, _live_craft_blocks: craftBlocks, _live_ts: payload.ts }));
          console.log('[Realtime] ✅ craft_blocks atualizados via Realtime!');
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLive(true);
          console.log('[Realtime] ✅ Canal conectado!');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsLive(false);
          console.warn('[Realtime] Canal desconectado:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, []);

  return {
    ui,
    loading,
    error,
    isOffline,
    isLive,        // ← novo: true quando Realtime está ativo
    isConnected: !isOffline && !error,
    refetch: fetchConfig,
  };
}
