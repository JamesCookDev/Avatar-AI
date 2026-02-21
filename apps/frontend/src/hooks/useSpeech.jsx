import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES DE COMPORTAMENTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TENANT_ID = import.meta.env.VITE_TENANT_ID || null;

// 🎚️ AJUSTE DE SENSIBILIDADE
const VOICE_THRESHOLD = 45;   // 45 = só voz, ignora ruído de fundo
const SILENCE_TIMEOUT = 2000; // Tempo de silêncio para "Fim da frase"
const MIN_AUDIO_SIZE = 1500;  // Ignora áudios muito curtos (cliques)
const PLAYBACK_COOLDOWN = 500;// Delay após avatar falar antes de reabrir mic

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) throw new Error("useSpeech must be used within a SpeechProvider");
  return context;
};

export const SpeechProvider = ({ children }) => {
  // Estados da UI
  const [message, setMessage] = useState(null);   // Objeto de mensagem do avatar (audio, lipsync, text)
  const [loading, setLoading] = useState(false);  // Carregando resposta da IA
  const [listening, setListening] = useState(false); // Microfone ativo / VAD detectou voz

  // Referências (não causam re-render)
  const queueRef = useRef([]);          // Fila de frases para o avatar falar
  const isPlayingRef = useRef(false);   // Avatar está falando?
  const isProcessingRef = useRef(false);// Enviando áudio pro backend?

  // Refs de áudio/VAD
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. GERENCIADOR DE FILA (FALA DO AVATAR)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const processQueue = () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();

    // 🔒 Bloqueia microfone enquanto o avatar fala
    isPlayingRef.current = true;
    setMessage(nextMessage);

    console.log("🤖 Avatar falando:", nextMessage.text?.substring(0, 40) + "...");
  };

  // Chamado pelo <Avatar /> quando o áudio termina
  const onMessagePlayed = () => {
    setMessage(null);

    setTimeout(() => {
      isPlayingRef.current = false;
      console.log("✅ Avatar terminou. Microfone liberado.");
      processQueue(); // Verifica se há mais frases na fila
    }, PLAYBACK_COOLDOWN);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. ENVIO DE DADOS (TEXTO E ÁUDIO)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const handleBackendResponse = async (response) => {
    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(msg => queueRef.current.push(msg));
      processQueue();
    }
  };

  const sendAudioToBackend = async (blob) => {
    isProcessingRef.current = true;
    setLoading(true);
    console.log("📦 Enviando áudio para processamento...");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(",")[1];
        try {
          const response = await fetch(`${API_URL}/sts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio, tenantId: TENANT_ID }),
          });
          await handleBackendResponse(response);
        } catch (err) {
          console.error("❌ Erro no Backend (STS):", err);
        } finally {
          isProcessingRef.current = false;
          setLoading(false);
        }
      };
    } catch (error) {
      console.error("Erro leitura áudio:", error);
      isProcessingRef.current = false;
      setLoading(false);
    }
  };

  // Envio manual de texto (botões de menu / chat escrito)
  const sendMessage = async (text) => {
    if (loading || isPlayingRef.current) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tenantId: TENANT_ID }),
      });
      await handleBackendResponse(response);
    } catch (error) {
      console.error("❌ Erro no Backend (TEXT):", error);
    } finally {
      setLoading(false);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. SISTEMA DE ÁUDIO (VAD + SELEÇÃO DE MIC)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    let animationFrame;

    const initAudio = async () => {
      try {
        console.log("🎤 Inicializando VAD...");

        // A. Seleção inteligente de microfone (ignora Steam/Virtual)
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');

        let selectedMic = mics.find(m =>
          (m.label.toLowerCase().includes('high definition') ||
           m.label.toLowerCase().includes('realtek') ||
           m.label.toLowerCase().includes('usb')) &&
          !m.label.toLowerCase().includes('steam')
        );
        if (!selectedMic) selectedMic = mics.find(m => !m.label.toLowerCase().includes('steam'));

        const deviceId = selectedMic ? selectedMic.deviceId : 'default';
        console.log(`🎤 Usando Microfone: ${selectedMic ? selectedMic.label : 'Padrão Sistema'}`);

        // B. Stream real
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamRef.current = stream;

        // C. Analisador de frequência
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);

        // D. MediaRecorder
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          audioChunksRef.current = [];
          setListening(false);

          if (blob.size > MIN_AUDIO_SIZE) {
            sendAudioToBackend(blob);
          } else {
            console.log("🗑️ Áudio descartado (muito curto / ruído)");
          }
        };

        // E. Loop de monitoramento (VAD)
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

        const checkAudioLevel = () => {
          animationFrame = requestAnimationFrame(checkAudioLevel);

          // ⛔ Bloqueio total: avatar falando ou sistema processando → não ouve
          if (isPlayingRef.current || isProcessingRef.current || loading) return;

          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const volume = sum / dataArray.length;

          if (volume > VOICE_THRESHOLD) {
            if (mediaRecorderRef.current.state === "inactive") {
              console.log("🎙️ Voz detectada! Gravando...");
              mediaRecorderRef.current.start();
              setListening(true);
            }
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else {
            if (mediaRecorderRef.current.state === "recording" && !silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current.state === "recording") {
                  console.log("🛑 Silêncio detectado. Parando gravação.");
                  mediaRecorderRef.current.stop();
                }
                silenceTimerRef.current = null;
              }, SILENCE_TIMEOUT);
            }
          }
        };

        checkAudioLevel();

      } catch (err) {
        console.error("❌ Erro fatal no áudio (VAD):", err);
      }
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SpeechContext.Provider value={{ message, onMessagePlayed, loading, listening, sendMessage }}>
      {children}
    </SpeechContext.Provider>
  );
};

export default useSpeech;
