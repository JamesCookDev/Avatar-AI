// useSpeech.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const backendUrl = "http://localhost:3000";

<<<<<<< HEAD
const SpeechContext = createContext(null);
=======
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const MIN_AUDIO_SIZE = 3000;        // Tamanho mínimo do áudio em bytes
const VOICE_THRESHOLD = 25;          // Sensibilidade do microfone (20-30)
const SILENCE_TIMEOUT = 1500;        // ms de silêncio para parar gravação
const PLAYBACK_COOLDOWN = 500;       // ms de espera após reprodução
>>>>>>> feat/iaLocal

function pickSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of candidates) {
    // MediaRecorder.isTypeSupported pode não existir em alguns ambientes
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return ""; // deixa o browser escolher
}

async function blobToTextWhisper(blob) {
  const fd = new FormData();
  // nome do campo: ajuste se seu backend espera outro (ex: "audio" ou "file")
  fd.append("audio_file", blob, "speech.webm");

  const res = await fetch(`${backendUrl}/whisper`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Whisper falhou: ${res.status} ${t}`);
  }

  return res.json(); // esperado: { text: "..." }
}

async function chatToAvatar(userText) {
  const res = await fetch(`${backendUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Chat falhou: ${res.status} ${t}`);
  }

  return res.json(); // esperado: { messages: [...] }
}

export const SpeechProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);

  // mensagens do avatar
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(null);

  // always listening
  const [alwaysListening, setAlwaysListening] = useState(true);

<<<<<<< HEAD
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
=======
    const nextMessage = queueRef.current.shift();
    
    // 🔒 TRAVA O MICROFONE IMEDIATAMENTE
    isPlayingRef.current = true; 
    setMessage(nextMessage);
  };

  // --- FUNÇÃO PARA ENVIAR MENSAGEM DE TEXTO ---
  const sendMessage = async (text) => {
    if (!text || loading || isPlayingRef.current) return;

    setLoading(true);

    try {
      console.log(`🚀 Enviando mensagem para: ${API_URL}/text`);

      const response = await fetch(`${API_URL}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
      });

      if (!response.ok) throw new Error("Erro de conexão com o servidor");

      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        // Adiciona na fila
        data.messages.forEach(msg => queueRef.current.push(msg));
        processQueue();
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    } finally {
      setLoading(false);
    }
  };

  const onMessagePlayed = () => {
    setMessage(null);
    
    // Cooldown para evitar eco
    setTimeout(() => {
      isPlayingRef.current = false;
      processQueue();
    }, PLAYBACK_COOLDOWN); 
  };

  // --- MICROFONE & VAD ---
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
>>>>>>> feat/iaLocal
  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const recStateRef = useRef({
    recording: false,
    speeching: false,
    startAt: 0,
    lastVoiceAt: 0,
    lock: false,
  });

  // parâmetros do VAD por RMS (simples e funciona bem em MVP)
  const cfg = useMemo(
    () => ({
      // ajuste fino:
      voiceRmsThreshold: 0.05, // se ambiente é barulhento, suba para 0.03~0.05
      silenceMsToStop: 650,
      maxSpeechMs: 9000,
      minSpeechMs: 450,
      minBlobBytes: 2000, // 110 bytes = lixo; aqui forçamos ter áudio real
      debug: true,
    }),
    []
  );

  function log(...args) {
    if (cfg.debug) console.log(...args);
  }

  async function ensureAudioGraph() {
    if (streamRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    streamRef.current = stream;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    src.connect(analyser);
  }

  function rmsFromAnalyser() {
    const analyser = analyserRef.current;
    if (!analyser) return 0;

    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);

    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // -1..1
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  function startRecorder() {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = pickSupportedMimeType();

    chunksRef.current = [];
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onerror = (e) => {
      console.error("MediaRecorder error:", e);
    };

    mr.onstop = async () => {
      try {
        const st = recStateRef.current;
        const durMs = Date.now() - st.startAt;

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        log("[AL] STOP gravação | durMs:", durMs, "| blob:", blob.size, "| type:", blob.type);

<<<<<<< HEAD
        // filtros
        if (durMs < cfg.minSpeechMs) {
          log("[AL] duracao pequena, ignorando");
          return;
        }
        if (blob.size < cfg.minBlobBytes) {
          log("[AL] blob pequeno, ignorando");
          return;
        }
=======
          if (audioBlob.size < MIN_AUDIO_SIZE) return; // Ignora áudios muito curtos
>>>>>>> feat/iaLocal

        setLoading(true);

        // 1) STT
        log("[AL] enviando para whisper...");
        const whisper = await blobToTextWhisper(blob);
        const text = (whisper?.text || "").trim();
        log("[AL] whisper text:", text);

        if (!text) {
          log("[AL] texto vazio, ignorando");
          return;
        }

        // 2) Chat -> mensagens do avatar
        log("[AL] enviando para /chat...");
        const chat = await chatToAvatar(text);
        const msgs = chat?.messages || [];

<<<<<<< HEAD
        setMessages(msgs);
        setMessage(msgs[0] || null);
=======
                  const data = await response.json();

                  if (data.messages && data.messages.length > 0) {
                    // Adiciona na fila
                    data.messages.forEach(msg => queueRef.current.push(msg));
                    processQueue();
                  }
              } catch (fetchErr) {
                  console.error("Erro no fetch:", fetchErr);
              }
              
              setLoading(false);
            };
          } catch (error) {
            console.error(error);
            setLoading(false);
          }
        };

        // --- LÓGICA DE DETECÇÃO DE VOZ (VAD) ---
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const checkVolume = () => {
          // 🛑 TRAVA DE SEGURANÇA (O PULO DO GATO)
          // Se o Avatar estiver falando ou tiver algo na fila, 
          // a gente sai da função e NÃO escuta nada.
          if (isPlayingRef.current || queueRef.current.length > 0) {
             animationFrame = requestAnimationFrame(checkVolume);
             return; 
          }

          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;

          if (average > VOICE_THRESHOLD) { 
             // Voz detectada!
             if (mediaRecorderRef.current.state === "inactive" && !loading) {
                console.log("🎤 Voz detectada! Gravando...");
                mediaRecorderRef.current.start();
                setListening(true);
             }
             // Reseta timer de silêncio
             if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
             }
          } else {
             // Silêncio
             if (mediaRecorderRef.current.state === "recording" && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                   if (mediaRecorderRef.current.state === "recording") {
                      console.log("🤫 Silêncio detectado. Parando gravação.");
                      mediaRecorderRef.current.stop();
                   }
                }, SILENCE_TIMEOUT); 
             }
          }
          animationFrame = requestAnimationFrame(checkVolume);
        };
        
        checkVolume();
>>>>>>> feat/iaLocal

        // Se você tem player/engine do avatar em outro lugar,
        // aqui é onde você dispara a reprodução em sequência.
      } catch (err) {
        console.error("[AL] fluxo STT->CHAT falhou:", err);
      } finally {
        setLoading(false);
      }
    };

    // timeslice ajuda MUITO a não gerar blob vazio
    mr.start(250);
    mrRef.current = mr;

    const st = recStateRef.current;
    st.recording = true;
    st.startAt = Date.now();
    st.lastVoiceAt = Date.now();

    log("[AL] START gravação | mime:", mr.mimeType);
  }

  function stopRecorder(reason) {
    const mr = mrRef.current;
    const st = recStateRef.current;

    if (!st.recording) return;
    if (!mr) return;

    st.recording = false;
    st.speeching = false;

    log("[AL] STOP request | reason:", reason);

    try {
      // garante chunk final antes do stop
      if (mr.state === "recording") {
        mr.requestData?.();
        mr.stop();
      }
    } catch (e) {
      console.error("[AL] erro ao parar recorder:", e);
    }
  }

  function loop() {
    const st = recStateRef.current;
    const rms = rmsFromAnalyser();

    // debug mais limpo
    // log("[AL] rms:", rms.toFixed(4), "rec:", st.recording);

    const now = Date.now();

    // trava pra evitar reentrância (principalmente em ambientes ruidosos)
    if (st.lock) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // detectou voz
    if (rms >= cfg.voiceRmsThreshold) {
      st.lastVoiceAt = now;

      if (!st.recording) {
        st.lock = true;
        try {
          log("[AL] VAD fala (start)");
          startRecorder();
        } finally {
          // pequena folga para não dar start/stop em seguida
          setTimeout(() => {
            st.lock = false;
          }, 200);
        }
      }
    }

    // se está gravando, checa silêncio
    if (st.recording) {
      const silentFor = now - st.lastVoiceAt;
      const speechFor = now - st.startAt;

      if (silentFor >= cfg.silenceMsToStop) {
        stopRecorder("silence");
      } else if (speechFor >= cfg.maxSpeechMs) {
        stopRecorder("maxSpeech");
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  async function startAlwaysListening() {
    await ensureAudioGraph();

    // alguns browsers precisam de interação para “desmutar” AudioContext
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume().catch((e) => console.error("AudioContext resume falhou:", e));
    }

    if (!rafRef.current) {
      log("[AL] always listening ON");
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  function stopAlwaysListening() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopRecorder("manual-stop");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    mrRef.current = null;

    log("[AL] always listening OFF");
  }

  // compatibilidade com ChatInterface antigo (evita "tts is not a function")
  // Aqui: você pode manter ou remover depois quando matar o chat-texto
  async function tts(text) {
    // Se seu backend já devolve "messages" com audio/lipsync,
    // o fluxo certo é usar /chat. Então tts aqui pode simplesmente:
    const chat = await chatToAvatar(text);
    const msgs = chat?.messages || [];
    setMessages(msgs);
    setMessage(msgs[0] || null);
    return msgs;
  }

  useEffect(() => {
    if (!alwaysListening) return;

    startAlwaysListening().catch((e) => {
      console.error("Falha ao iniciar always listening:", e);
    });

    return () => {
      stopAlwaysListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alwaysListening]);

<<<<<<< HEAD
  const value = {
    loading,
    messages,
    message,
    setMessage,
    setMessages,

    // always listening control
    alwaysListening,
    setAlwaysListening,
    startAlwaysListening,
    stopAlwaysListening,

    // compat
    tts,
  };

  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
};

export function useSpeech() {
  const ctx = useContext(SpeechContext);
  if (!ctx) throw new Error("useSpeech must be used within a SpeechProvider");
  return ctx;
}
=======
  return (
    <SpeechContext.Provider value={{ message, onMessagePlayed, loading, listening, sendMessage }}>
      {children}
    </SpeechContext.Provider>
  );
};
>>>>>>> feat/iaLocal
