/**
 * useCMSConfig — Polling + Supabase Realtime (Live Preview do Hub)
 * 
 * NOVA ENV (Auto-Registro):
 *   VITE_CMS_API_URL=https://<project>.supabase.co/functions/v1
 *   VITE_SUPABASE_ANON_KEY=<anon key do projeto>
 *   VITE_SUPABASE_URL=<url do projeto>  (para Realtime)
 *   VITE_ORG_ID=<uuid da organização>
 *   VITE_CMS_POLL_INTERVAL=15000  (opcional, padrão 15s)
 *
 * O deviceId é passado como opção (vem do useAutoRegister no App.jsx)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const CMS_API_URL       = import.meta.env.VITE_CMS_API_URL       || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL || CMS_API_URL.replace('/functions/v1', '');
const POLL_INTERVAL     = parseInt(import.meta.env.VITE_CMS_POLL_INTERVAL) || 15000;

// Cliente Supabase para Realtime (Broadcast)
let supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export function useCMSConfig(options = {}) {
  const { pollInterval = POLL_INTERVAL, deviceId = null } = options;

  const [ui, setUi] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const abortRef = useRef(null);
  const lastHashRef = useRef('');
  const deviceIdRef = useRef(deviceId);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  // ──────────────────────────────────────────────────────────────────
  // 1. FETCH polling — busca a config na edge function via device_id
  // ──────────────────────────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    const did = deviceIdRef.current;
    if (!CMS_API_URL || !did) {
      console.warn('[CMS] VITE_CMS_API_URL ou deviceId não disponíveis.');
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const headers = {
        'x-totem-device-id': did,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      };

      const res = await fetch(`${CMS_API_URL}/totem-config`, {
        method: 'GET',
        headers,
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
    if (!deviceId) return;
    fetchConfig();
    const id = setInterval(() => {
      if (!isOffline) fetchConfig();
    }, pollInterval);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchConfig, pollInterval, isOffline, deviceId]);

  // ──────────────────────────────────────────────────────────────────
  // 2. REALTIME — canal live-preview:{deviceId} (Supabase Broadcast)
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!deviceId) {
      console.warn('[Realtime] deviceId não disponível — Realtime desativado.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[Realtime] Não foi possível criar cliente Supabase.');
      return;
    }

    console.log(`[Realtime] Inscrevendo no canal live-preview:${deviceId}`);

    const channel = supabase
      .channel(`live-preview:${deviceId}`)
      .on('broadcast', { event: 'ui-update' }, ({ payload }) => {
        // Free canvas format
        if (payload?.free_canvas) {
          const hash = JSON.stringify(payload.free_canvas);
          if (hash !== lastHashRef.current) {
            lastHashRef.current = hash;
            setUi(prev => ({ ...prev, _live_free_canvas: payload.free_canvas, _live_ts: payload.ts }));
            console.log('[Realtime] ✅ free_canvas atualizado via Realtime!');
          }
        }
        // Legacy craft_blocks
        if (payload?.craft_blocks) {
          if (payload.craft_blocks !== lastHashRef.current) {
            lastHashRef.current = payload.craft_blocks;
            setUi(prev => ({ ...prev, _live_craft_blocks: payload.craft_blocks, _live_ts: payload.ts }));
            console.log('[Realtime] ✅ craft_blocks atualizados via Realtime!');
          }
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
  }, [deviceId]);

  return {
    ui,
    loading,
    error,
    isOffline,
    isLive,
    isConnected: !isOffline && !error,
    refetch: fetchConfig,
  };
}
