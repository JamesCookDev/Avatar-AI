/**
 * ══════════════════════════════════════════════════════════════
 *  TOTEM LOCAL — App.jsx  (v4 — Free-Form Canvas)
 * ══════════════════════════════════════════════════════════════
 *  Renderizador de canvas livre (1080×1920) com posicionamento
 *  absoluto pixel-perfect. Substitui completamente o Craft.js.
 *
 *  Elementos suportados (15 tipos):
 *  ─ Conteúdo:  text, image, button, shape, icon
 *  ─ Mídia:     video, carousel, qrcode, social
 *  ─ Dados:     clock, weather, countdown
 *  ─ Interação: chat, map, iframe
 * ══════════════════════════════════════════════════════════════
 */
import './index.css';
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSpeech } from "./hooks/useSpeech";
import { createClient } from "@supabase/supabase-js";
import { Loader, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Scenario } from "./components/Scenario";
import { useCMSConfig } from "./hooks/useCMSConfig";
import { ChatInterface } from "./components/ChatInterface";

// ─── Supabase client (live preview) ───────────
const _supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

// ─────────────────────────────────────────────
// 🔧 UTILITÁRIOS
// ─────────────────────────────────────────────
const px = (v) => (typeof v === "number" ? `${v}px` : v);

// Canvas reference resolution
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// ─────────────────────────────────────────────
// 🔄 WORKER: Polling inteligente (15s)
// ─────────────────────────────────────────────
const POLL_INTERVAL = 15_000;

// ─────────────────────────────────────────────
// 📡 LIVE PREVIEW via Supabase Realtime
// ─────────────────────────────────────────────
function useLivePreview(deviceId, onLiveUpdate) {
  const [isLive, setIsLive] = useState(false);
  const onLiveUpdateRef = useRef(onLiveUpdate);
  useEffect(() => { onLiveUpdateRef.current = onLiveUpdate; }, [onLiveUpdate]);

  useEffect(() => {
    if (!deviceId) return;

    const channel = _supabase.channel(`live-preview:${deviceId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "ui-update" }, ({ payload }) => {
        // New format: free_canvas (replaces craft_blocks)
        if (payload?.free_canvas) {
          onLiveUpdateRef.current({ free_canvas: payload.free_canvas, _liveTs: payload.ts });
        }
        // Legacy fallback
        if (payload?.craft_blocks) {
          onLiveUpdateRef.current({ craft_blocks: payload.craft_blocks, _liveTs: payload.ts });
        }
      })
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          console.info("[LivePreview] Canal ativo — aguardando broadcast do Hub");
        }
      });

    return () => {
      _supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [deviceId]);

  return isLive;
}

function useConfigPoller(onUpdate) {
  const lastHashRef = useRef("");

  const fetchLatest = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_CMS_API_URL;
      const apiKey = import.meta.env.VITE_TOTEM_API_KEY || import.meta.env.TOTEM_API_KEY;
      if (!apiUrl || !apiKey) return;

      const res = await fetch(`${apiUrl}/totem-config`, {
        headers: {
          "x-totem-api-key": apiKey,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
        },
      });
      if (!res.ok) return;

      const json = await res.json();
      const newUi = json?.config?.ui;
      if (!newUi) return;

      const hash = JSON.stringify(newUi);
      if (hash !== lastHashRef.current) {
        lastHashRef.current = hash;
        onUpdate(newUi);
      }
    } catch (err) {
      console.warn("[Poller] Falha ao buscar config:", err.message);
    }
  }, [onUpdate]);

  useEffect(() => {
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchLatest]);
}

// ─────────────────────────────────────────────
// 📦 VERSÕES DOS ARQUIVOS LOCAIS
// ─────────────────────────────────────────────
const LOCAL_FILE_VERSIONS = {
  "App.jsx": "4.0.0",
  "main.jsx": "1.0.0",
  "index.css": "1.1.0",
  "hooks/useSpeech.jsx": "2.2.0",
  "hooks/useCMSConfig.js": "1.2.0",
  "components/Avatar.jsx": "1.5.0",
  "components/ChatInterface.jsx": "1.3.0",
  "components/Scenario.jsx": "1.2.0",
};

// ─────────────────────────────────────────────
// 🔄 HEARTBEAT WORKER
// ─────────────────────────────────────────────
function useHeartbeat() {
  const sendHeartbeat = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_CMS_API_URL;
      const apiKey = import.meta.env.VITE_TOTEM_API_KEY || import.meta.env.TOTEM_API_KEY;
      if (!apiUrl || !apiKey) return;

      const res = await fetch(`${apiUrl}/totem-heartbeat`, {
        method: "POST",
        headers: {
          "x-totem-api-key": apiKey,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_speaking: false,
          status_details: {
            uptime: Math.floor(performance.now() / 1000),
            code_manifest: LOCAL_FILE_VERSIONS,
          },
        }),
      });

      if (!res.ok) {
        console.warn(`[Heartbeat] ❌ Erro HTTP: ${res.status}`);
        return;
      }

      const data = await res.json();
      console.info("[Heartbeat] ✅ OK —", data.name);

      if (data.command === "restart") {
        console.warn("[Heartbeat] 🔄 Comando RESTART recebido — recarregando...");
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      console.error("[Heartbeat] ❌ Erro:", err.message);
    }
  }, []);

  useEffect(() => {
    sendHeartbeat();
    const id = setInterval(sendHeartbeat, 30_000);
    return () => clearInterval(id);
  }, [sendHeartbeat]);
}

// ─────────────────────────────────────────────
// 🖼️ FREE CANVAS RENDERER — Renderiza elementos com posição absoluta
// Escala de 1080×1920 → tela real
// ─────────────────────────────────────────────
const FreeCanvasRenderer = React.memo(({ canvas }) => {
  if (!canvas || !canvas.elements || canvas.elements.length === 0) return null;

  const sortedElements = useMemo(() => {
    return [...canvas.elements]
      .filter(el => el.visible !== false)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  }, [canvas.elements]);

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      overflow: "hidden",
      pointerEvents: "none",
    }}>
      {sortedElements.map(el => (
        <FreeCanvasElement key={el.id} element={el} />
      ))}
    </div>
  );
});

function FreeCanvasElement({ element }) {
  const { x, y, width, height, rotation, opacity, props, type } = element;

  // Convert pixel coords from 1080×1920 canvas to percentages
  const style = {
    position: "absolute",
    left: `${(x / CANVAS_W) * 100}%`,
    top: `${(y / CANVAS_H) * 100}%`,
    width: `${(width / CANVAS_W) * 100}%`,
    height: `${(height / CANVAS_H) * 100}%`,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    opacity: opacity ?? 1,
    zIndex: element.zIndex || 1,
    pointerEvents: type === "button" || type === "chat" || type === "social" || type === "qrcode" ? "auto" : "none",
    overflow: "hidden",
    borderRadius: props?.borderRadius ? px(props.borderRadius) : undefined,
  };

  return (
    <div style={style}>
      <ElementRenderer type={type} props={props || {}} />
    </div>
  );
}

// ─────────────────────────────────────────────
// 🧱 ELEMENT RENDERER — renderiza cada tipo de elemento
// ─────────────────────────────────────────────
function ElementRenderer({ type, props: p }) {
  switch (type) {
    case "text":
      return (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          padding: "2%",
          color: p.color || "#fff",
          fontSize: `clamp(12px, ${(p.fontSize || 24) / CANVAS_W * 100}vw, ${(p.fontSize || 24) * 1.5}px)`,
          fontWeight: p.fontWeight || "normal",
          textAlign: p.align || "left",
          fontFamily: p.fontFamily || "Inter, sans-serif",
          justifyContent: p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start",
          lineHeight: 1.2,
          wordBreak: "break-word",
        }}>
          {p.text || "Texto"}
        </div>
      );

    case "image":
      if (!p.src) {
        return (
          <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>🖼️</span>
          </div>
        );
      }
      return (
        <img
          src={p.src}
          alt=""
          style={{
            width: "100%", height: "100%",
            objectFit: p.fit || "cover",
            borderRadius: p.borderRadius || 0,
            pointerEvents: "none",
          }}
        />
      );

    case "button":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "2%" }}>
          <button
            type="button"
            onClick={() => {
              const action = p.action || p.label || "";
              if (action && typeof window.__totemSendMessage === "function") {
                window.__totemSendMessage(action);
              }
            }}
            style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: p.bgColor || "#6366f1",
              color: p.textColor || "#fff",
              fontSize: `clamp(12px, ${(p.fontSize || 18) / CANVAS_W * 100}vw, ${(p.fontSize || 18) * 1.5}px)`,
              fontWeight: "600",
              borderRadius: p.borderRadius ?? 999,
              border: "none",
              cursor: "pointer",
              letterSpacing: "-0.01em",
              transition: "transform 0.15s",
            }}
          >
            {p.label || "Botão"}
          </button>
        </div>
      );

    case "shape":
      return (
        <div style={{
          width: "100%", height: "100%",
          background: p.fill || "#6366f1",
          borderRadius: p.shapeType === "circle" ? "50%" : (p.borderRadius || 0),
          border: p.borderWidth ? `${p.borderWidth}px solid ${p.borderColor || "transparent"}` : undefined,
        }} />
      );

    case "icon":
      return (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: p.color || "#fff",
          fontSize: `clamp(16px, ${(p.size || 48) / CANVAS_W * 100}vw, ${(p.size || 48) * 1.5}px)`,
        }}>
          {p.icon || "⭐"}
        </div>
      );

    case "video": {
      const vidSrc = p.url || "";
      if (!vidSrc) {
        return <PlaceholderBox emoji="🎬" label="Vídeo" />;
      }
      const isYt = vidSrc.includes("youtube.com") || vidSrc.includes("youtu.be");
      const isMp4 = vidSrc.endsWith(".mp4") || vidSrc.endsWith(".webm");
      let finalSrc = vidSrc;
      if (isYt && !vidSrc.includes("embed")) {
        const videoId = vidSrc.match(/(?:v=|youtu\.be\/)([\w-]+)/)?.[1];
        if (videoId) finalSrc = `https://www.youtube.com/embed/${videoId}?autoplay=${p.autoplay ? 1 : 0}&mute=${p.muted ? 1 : 0}&loop=${p.loop ? 1 : 0}`;
      }
      if (isMp4) {
        return <video src={finalSrc} autoPlay={!!p.autoplay} loop={!!p.loop} muted={!!p.muted || !!p.autoplay} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
      }
      return (
        <iframe src={finalSrc} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay; fullscreen; encrypted-media" allowFullScreen />
      );
    }

    case "qrcode": {
      const qrContent = p.value || "https://example.com";
      const cleanFg = (p.fgColor || "#ffffff").replace("#", "");
      const cleanBg = !p.bgColor || p.bgColor === "transparent" ? "000000" : p.bgColor.replace("#", "");
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrContent)}&color=${cleanFg}&bgcolor=${cleanBg}`;
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "4%" }}>
          <img src={qrUrl} alt="QR Code" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageRendering: "pixelated" }} />
        </div>
      );
    }

    case "map":
      return <PlaceholderBox emoji="📍" label={`Mapa (${p.lat?.toFixed(2)}, ${p.lng?.toFixed(2)})`} />;

    case "social": {
      const platforms = { instagram: "📷", facebook: "👤", twitter: "🐦", tiktok: "🎵", youtube: "▶️", whatsapp: "💬", linkedin: "💼" };
      const links = p.links || [];
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: p.gap || 16 }}>
          {links.map((l, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const url = l.url || "";
                if (url && url !== "#") {
                  if (typeof window.__totemOpenUrl === "function") window.__totemOpenUrl(url);
                  else window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: `clamp(16px, ${(p.iconSize || 32) / CANVAS_W * 100}vw, ${(p.iconSize || 32) * 1.5}px)`,
              }}
            >
              {platforms[l.platform] || "🔗"}
            </button>
          ))}
          {links.length === 0 && <span style={{ opacity: 0.4, fontSize: 24 }}>🔗</span>}
        </div>
      );
    }

    case "chat":
      return <PlaceholderBox emoji="💬" label="Chat IA" />;

    case "avatar":
      return <AvatarCanvasElement props={p} />;

    case "clock":
      return <LiveClock color={p.color} fontSize={p.fontSize} />;

    case "weather":
      return <PlaceholderBox emoji="🌤️" label={`Clima: ${p.city || "São Paulo"}`} />;

    case "countdown":
      return <LiveCountdown targetDate={p.targetDate} label={p.label} color={p.color} fontSize={p.fontSize} />;

    case "iframe": {
      const url = p.url || "";
      if (!url) return <PlaceholderBox emoji="🌐" label="Iframe" />;
      return <iframe src={url} style={{ width: "100%", height: "100%", border: "none", borderRadius: p.borderRadius || 0 }} />;
    }

    case "carousel":
      return <PlaceholderBox emoji="🎠" label="Carrossel" />;

    default:
      return <PlaceholderBox emoji="❓" label={type} />;
  }
}

// ─────────────────────────────────────────────
// 🔲 PLACEHOLDER BOX
// ─────────────────────────────────────────────
function PlaceholderBox({ emoji, label }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 8,
      background: "rgba(255,255,255,0.04)",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 🤖 AVATAR 3D CANVAS ELEMENT — renderiza o avatar dentro do elemento do canvas
// ─────────────────────────────────────────────
function AvatarCanvasElement({ props: p }) {
  // frameY: -100..100 → vertical pan (neg=up, pos=down)
  // frameZoom: 10..100 → distance (10=far, 100=close)
  const frameY = p.frameY ?? 0;
  const frameZoom = p.frameZoom ?? 50;

  // Map frameZoom 10..100 → camera Z distance 8..2
  const camZ = 8 - (frameZoom / 100) * 6;
  // Base camera at avatar mid-height (1.5), frameY shifts ±1.5
  const camY = 1.5 + (frameY / 100) * 1.5;
  const targetY = 1.0 + (frameY / 100) * 1.2;

  return (
    <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
      <Canvas shadows camera={{ position: [0, camY, camZ], fov: 30 }} gl={{ preserveDrawingBuffer: true }} style={{ width: "100%", height: "100%" }}>
        <Scenario uiOverride={{
          components: {
            avatar: {
              enabled: true,
              position: "center",
              scale: p.scale || 1.5,
              animation: p.animation || "idle",
              colors: p.colors || { shirt: "#1E3A8A", pants: "#1F2937", shoes: "#000000" },
              models: {
                avatar_url: p.avatarUrl || "/models/avatar.glb",
                animations_url: p.animationsUrl || "/models/animations.glb",
              },
              animations: { idle: "Idle", talking: "TalkingOne" },
              materials: { roughness: 0.5, metalness: 0.0 },
            },
          },
          canvas: {
            camera: {
              initial_look_at: {
                position: [0, camY, camZ],
                target: [0, targetY, 0],
                smooth: false,
              },
              controls: {
                minDistance: camZ,
                maxDistance: camZ,
                minPolarAngle: Math.PI / 2,
                maxPolarAngle: Math.PI / 2,
              },
            },
          },
        }} />
      </Canvas>
    </div>
  );
}

// ─────────────────────────────────────────────
// 🕐 LIVE CLOCK
// ─────────────────────────────────────────────
const LiveClock = React.memo(({ color, fontSize }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: color || "#fff",
      fontSize: `clamp(16px, ${(fontSize || 36) / CANVAS_W * 100}vw, ${(fontSize || 36) * 1.5}px)`,
      fontFamily: "monospace",
      fontWeight: "bold",
    }}>
      {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
});

// ─────────────────────────────────────────────
// ⏱️ LIVE COUNTDOWN
// ─────────────────────────────────────────────
const LiveCountdown = React.memo(({ targetDate, label, color, fontSize }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const diffMs = targetDate ? Math.max(0, new Date(targetDate).getTime() - now.getTime()) : 0;
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const fs = fontSize || 28;

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4,
      color: color || "#fff",
    }}>
      {label && <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 600, textTransform: "uppercase" }}>{label}</span>}
      <div style={{
        display: "flex", gap: 8, alignItems: "center",
        fontSize: `clamp(14px, ${fs / CANVAS_W * 100}vw, ${fs * 1.5}px)`,
        fontFamily: "monospace", fontWeight: "bold",
      }}>
        {days > 0 && <span>{days}d</span>}
        <span>{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// 🎨 CSS GLOBAL
// ─────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    @keyframes kiosk-breathe {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.55), 0 8px 40px rgba(0,0,0,0.45); transform: scale(1); }
      50%        { box-shadow: 0 0 0 18px rgba(99,102,241,0),  0 8px 40px rgba(0,0,0,0.45); transform: scale(1.025); }
    }

    /* Config update toast */
    @keyframes toast-in  { from { opacity: 0; transform: translateX(120%); } to { opacity: 1; transform: translateX(0); } }
    @keyframes toast-out { from { opacity: 1; transform: translateX(0); }   to { opacity: 0; transform: translateX(120%); } }
    @keyframes toast-progress { from { width: 100%; } to { width: 0%; } }
    @keyframes toast-dot-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }

    .toast-enter { animation: toast-in  0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .toast-exit  { animation: toast-out 0.4s ease-in forwards; }

    /* ── Idle Screen ── */
    @keyframes idle-fade-in  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes idle-fade-out { from { opacity: 1; } to { opacity: 0; } }
    @keyframes idle-float {
      0%,100% { transform: translateY(0px); }
      50%      { transform: translateY(-14px); }
    }
    @keyframes idle-text-pulse {
      0%,100% { opacity: 1; text-shadow: 0 0 20px rgba(139,92,246,0.6); }
      50%      { opacity: 0.55; text-shadow: 0 0 40px rgba(139,92,246,0.9); }
    }
    @keyframes idle-ring-expand {
      0%   { transform: scale(0.9); opacity: 0.7; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes idle-particle-up {
      0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
      100% { transform: translateY(-120px) translateX(var(--dx, 0px)) scale(0); opacity: 0; }
    }
    @keyframes idle-star-twinkle {
      0%,100% { opacity: 0; transform: scale(0.5); }
      50%      { opacity: 1; transform: scale(1); }
    }

    .idle-screen-in  { animation: idle-fade-in  0.8s ease-out forwards; }
    .idle-screen-out { animation: idle-fade-out 0.6s ease-in  forwards; }

    @keyframes live-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; overflow: hidden; }
  `}</style>
);

// ─────────────────────────────────────────────
// 🌙 IDLE SCREEN
// ─────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 60_000;
const IDLE_PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: `${10 + (i * 73 % 80)}%`,
  delay: `${(i * 0.37) % 3.5}s`,
  dur: `${2.8 + (i * 0.23) % 2.4}s`,
  dx: `${-30 + (i * 17 % 60)}px`,
  size: 3 + (i * 3 % 6),
  color: i % 3 === 0 ? 'rgba(139,92,246,0.85)' : i % 3 === 1 ? 'rgba(99,102,241,0.8)' : 'rgba(236,72,153,0.75)',
}));

function IdleScreen({ visible, onWake }) {
  const [phase, setPhase] = React.useState("hidden");

  React.useEffect(() => {
    if (visible) {
      setPhase("in");
      const t = setTimeout(() => setPhase("visible"), 800);
      return () => clearTimeout(t);
    } else {
      if (phase === "hidden") return;
      setPhase("out");
      const t = setTimeout(() => setPhase("hidden"), 700);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (phase === "hidden") return null;

  return (
    <div
      onClick={onWake}
      onTouchStart={onWake}
      className={phase === "out" ? "idle-screen-out" : "idle-screen-in"}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 60%, rgba(99,102,241,0.18) 0%, rgba(5,10,24,0.92) 70%)",
        backdropFilter: "blur(2px)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {IDLE_PARTICLES.map(p => (
          <div key={p.id} style={{
            position: "absolute", bottom: "10%", left: p.x,
            width: p.size, height: p.size, borderRadius: "50%",
            background: p.color, boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            '--dx': p.dx,
            animation: `idle-particle-up ${p.dur} ${p.delay} ease-out infinite`,
          }} />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <div key={`s${i}`} style={{
            position: "absolute",
            top: `${5 + (i * 61 % 80)}%`, left: `${(i * 71 % 90) + 5}%`,
            width: 2 + (i % 2), height: 2 + (i % 2), borderRadius: "50%",
            background: i % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(139,92,246,0.8)",
            animation: `idle-star-twinkle ${1.5 + (i * 0.3) % 2}s ${(i * 0.4) % 2}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      {[0, 0.7, 1.4].map((delay, i) => (
        <div key={i} style={{
          position: "absolute", width: 220, height: 220, borderRadius: "50%",
          border: "1.5px solid rgba(139,92,246,0.5)",
          animation: `idle-ring-expand 3s ${delay}s ease-out infinite`,
        }} />
      ))}

      <div style={{ fontSize: "clamp(52px, 8vw, 80px)", animation: "idle-float 3.5s ease-in-out infinite", marginBottom: 24, filter: "drop-shadow(0 0 24px rgba(139,92,246,0.8))" }}>
        👋
      </div>
      <div style={{ fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 800, color: "#ffffff", textAlign: "center", lineHeight: 1.15, animation: "idle-text-pulse 2.8s ease-in-out infinite", marginBottom: 16, padding: "0 32px" }}>
        Toque para começar
      </div>
      <div style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "0 40px", maxWidth: 480 }}>
        Estou aqui para ajudar você
      </div>
      <div style={{ position: "absolute", bottom: 48, fontSize: "clamp(11px, 1.2vw, 14px)", color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Toque em qualquer lugar para continuar
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 🕐 HOOK: Detecção de inatividade
// ─────────────────────────────────────────────
function useIdleDetection(timeoutMs) {
  const [isIdle, setIsIdle] = React.useState(false);
  const timerRef = React.useRef(null);

  const reset = React.useCallback(() => {
    setIsIdle(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs);
  }, [timeoutMs]);

  React.useEffect(() => {
    const events = ["mousemove", "mousedown", "touchstart", "keydown", "scroll", "click"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      clearTimeout(timerRef.current);
    };
  }, [reset]);

  return { isIdle, wake: reset };
}

// ─────────────────────────────────────────────
// 🔔 TOAST: Notificação de atualização
// ─────────────────────────────────────────────
function UpdateToast({ visible }) {
  const [phase, setPhase] = React.useState("idle");

  React.useEffect(() => {
    if (!visible) return;
    setPhase("enter");
    const stayTimer = setTimeout(() => setPhase("exit"), 3200);
    const doneTimer = setTimeout(() => setPhase("idle"), 3650);
    return () => { clearTimeout(stayTimer); clearTimeout(doneTimer); };
  }, [visible]);

  if (phase === "idle") return null;

  return (
    <div
      className={phase === "exit" ? "toast-exit" : "toast-enter"}
      style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(8, 14, 30, 0.82)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(99,102,241,0.35)",
        borderRadius: 18, padding: "14px 20px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.07)",
        minWidth: 260, pointerEvents: "none", userSelect: "none",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))",
        border: "1px solid rgba(99,102,241,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>🔄</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          Configuração atualizada
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3, letterSpacing: "0.01em" }}>
          Interface sincronizada
        </div>
        <div style={{ height: 2, borderRadius: 999, marginTop: 8, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #6366f1, #8b5cf6)", animation: "toast-progress 3s linear forwards" }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 4, height: 4, borderRadius: "50%",
            background: i === 0 ? "#6366f1" : i === 1 ? "#8b5cf6" : "#ec4899",
            animation: `toast-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 🚀 APP PRINCIPAL
// ─────────────────────────────────────────────
export default function App() {
  const { ui: initialUi } = useCMSConfig();
  const [liveUi, setLiveUi] = useState(null);
  const [toastKey, setToastKey] = useState(0);
  const { isIdle, wake } = useIdleDetection(IDLE_TIMEOUT_MS);

  // ── SpeechProvider ──
  let speechCtx = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    speechCtx = useSpeech();
  } catch (_) {}

  // ── Registra handlers globais do bridge Totem ──
  useEffect(() => {
    window.__totemSendMessage = (msg) => {
      if (speechCtx?.sendMessage) {
        speechCtx.sendMessage(msg);
      } else {
        console.info("[Totem] 💬 __totemSendMessage (sem SpeechProvider):", msg);
      }
    };

    if (typeof window.__totemSpeak !== "function") {
      window.__totemSpeak = (text, options) => {
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = options?.lang || import.meta.env.VITE_TTS_LANG || "pt-BR";
          window.speechSynthesis.speak(utter);
        }
      };
    }

    if (typeof window.__totemOpenUrl !== "function") {
      window.__totemOpenUrl = (url) => {
        if (!url || url === "#") return;
        if (window.electronAPI?.openExternal) { window.electronAPI.openExternal(url); return; }
        try {
          const { shell } = window.require?.("electron") || {};
          if (shell?.openExternal) { shell.openExternal(url); return; }
        } catch (_) {}
        window.open(url, "_blank", "noopener,noreferrer");
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechCtx?.sendMessage]);

  const deviceId = import.meta.env.VITE_TOTEM_DEVICE_ID || null;

  const handleConfigUpdate = useCallback((newUi) => {
    setLiveUi(newUi);
    setToastKey(k => k + 1);
  }, []);

  const handleLiveUpdate = useCallback((newUi) => {
    setLiveUi(newUi);
  }, []);

  useConfigPoller(handleConfigUpdate);
  useHeartbeat();
  const isLive = useLivePreview(deviceId, handleLiveUpdate);

  const ui = liveUi || initialUi;

  // ── Parse free_canvas ──
  const freeCanvas = useMemo(() => {
    const raw = ui?.free_canvas || null;
    if (!raw) return null;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }, [ui]);

  const hasFreeCanvas = freeCanvas && Array.isArray(freeCanvas.elements) && freeCanvas.elements.length > 0;

  // Background
  const bgStyle = useMemo(() => {
    // Free canvas background color
    if (hasFreeCanvas && freeCanvas.bgColor) {
      return { backgroundColor: freeCanvas.bgColor };
    }
    const bg = ui?.canvas?.background;
    if (bg?.type === "image" && bg?.image_url) {
      return { backgroundImage: `url(${bg.image_url})`, backgroundSize: "cover", backgroundPosition: "center" };
    }
    if (bg?.gradient) return { backgroundImage: bg.gradient };
    if (bg?.color) return { backgroundColor: bg.color };
    return { background: "linear-gradient(160deg, #050a18 0%, #0c1630 60%, #0a0e1f 100%)" };
  }, [ui, freeCanvas, hasFreeCanvas]);

  // Avatar is now rendered as a free canvas element (type: 'avatar')
  // No longer a fixed background layer


  return (
    <>
      <GlobalStyles />
      <div
        style={{
          width: "100vw", height: "100vh", position: "relative", overflow: "hidden",
          userSelect: "none",
          ...bgStyle,
        }}
      >
        <Loader />
        <Leva collapsed hidden />

        {/* 🖼️ Free Canvas — todos os elementos (incluindo avatar 3D) */}
        {hasFreeCanvas && (
          <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
            <FreeCanvasRenderer canvas={freeCanvas} />
          </div>
        )}

        {/* 💬 Chat Interface fallback (quando não há free_canvas) */}
        {!hasFreeCanvas && (
          <div style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none" }}>
            <div style={{ pointerEvents: "auto", height: "100%" }}>
              <ChatInterface uiConfig={ui?.components?.chat_interface || null} />
            </div>
          </div>
        )}
      </div>

      {/* 🔔 Toast de atualização */}
      <UpdateToast key={toastKey} visible={toastKey > 0} />

      {/* 📡 Badge "Ao Vivo" */}
      {isLive && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 999,
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.4)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          color: "#fca5a5", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          boxShadow: "0 0 16px rgba(239,68,68,0.2)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "#ef4444",
            animation: "live-pulse 1.2s ease-in-out infinite",
            display: "inline-block", boxShadow: "0 0 6px #ef4444",
          }} />
          Ao Vivo
        </div>
      )}

      {/* 🌙 Tela idle */}
      <IdleScreen visible={isIdle} onWake={wake} />
    </>
  );
}
