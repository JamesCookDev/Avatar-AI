import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES DE COMPORTAMENTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TENANT_ID = import.meta.env.VITE_TENANT_ID || null;

// 🎚️ AJUSTE DE SENSIBILIDADE (Aumentei para ignorar o ruído de fundo)
const VOICE_THRESHOLD = 45;   // Antes estava 15 (pegava ruído). Agora 45 (só voz).
const SILENCE_TIMEOUT = 2000; // Tempo de silêncio para considerar "Fim da frase"
const MIN_AUDIO_SIZE = 1500;  // Ignora áudios muito curtos (cliques)
const PLAYBACK_COOLDOWN = 500;// Tempo extra após o avatar falar

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) throw new Error("useSpeech must be used within a SpeechProvider");
  return context;
};

export const SpeechProvider = ({ children }) => {
  // Estados da UI
  const [message, setMessage] = useState(null); // Texto que o avatar está falando
  const [loading, setLoading] = useState(false); // Carregando resposta (Spinning)
  const [listening, setListening] = useState(false); // Estado visual de "Ouvindo"

  // Referências (Não causam re-render)
  const queueRef = useRef([]);      // Fila de frases para falar
  const isPlayingRef = useRef(false); // O Avatar está falando?
  const isProcessingRef = useRef(false); // Estamos enviando áudio pro back?
  
  // Áudio Refs
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
    // Se já está falando ou não tem nada na fila, aborta
    if (isPlayingRef.current || queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();
    
    // 🔒 BLOQUEIO: Avatar começa a falar -> Microfone fecha
    isPlayingRef.current = true; 
    setMessage(nextMessage);
    
    console.log("🤖 Avatar falando:", nextMessage.text.substring(0, 30) + "...");
  };

  // Chamado pelo componente <Avatar /> quando o áudio termina
  const onMessagePlayed = () => {
    setMessage(null);
    
    // Pequeno delay para não abrir o mic instantaneamente (evita ouvir o próprio eco)
    setTimeout(() => {
      isPlayingRef.current = false;
      console.log("✅ Avatar terminou. Microfone liberado.");
      processQueue(); // Verifica se tem mais frases
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
            console.error("❌ Erro no Backend:", err);
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

  // Envio manual de texto (Chat escrito)
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
      console.error(error);
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

        // A. SELEÇÃO INTELIGENTE DE MICROFONE (Ignora Steam/Virtual)
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Pede permissão
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        
        // Procura mic Realtek/USB e ignora Steam
        let selectedMic = mics.find(m => 
            (m.label.toLowerCase().includes('high definition') || 
             m.label.toLowerCase().includes('realtek') || 
             m.label.toLowerCase().includes('usb')) &&
            !m.label.toLowerCase().includes('steam')
        );
        if (!selectedMic) selectedMic = mics.find(m => !m.label.toLowerCase().includes('steam')); // Fallback

        const deviceId = selectedMic ? selectedMic.deviceId : 'default';
        console.log(`🎤 Usando Microfone: ${selectedMic ? selectedMic.label : 'Padrão Sistema'}`);

        // B. STREAM REAL
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                deviceId: { exact: deviceId },
                echoCancellation: false, // Desligado para qualidade
                noiseSuppression: false, // Desligado para não cortar voz
                autoGainControl: false 
            } 
        });
        streamRef.current = stream;

        // C. ANALISADOR
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);

        // D. GRAVADOR
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
                console.log("🗑️ Áudio descartado (Muito curto/Ruído)");
            }
        };

        // E. LOOP DE MONITORAMENTO (VAD)
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const checkAudioLevel = () => {
            animationFrame = requestAnimationFrame(checkAudioLevel);

            // ⛔ BLOQUEIO TOTAL:
            // Se o Avatar está falando OU o sistema está processando => NÃO ESCUTA NADA
            if (isPlayingRef.current || isProcessingRef.current || loading) {
                return; 
            }

            // Análise de Volume
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const volume = sum / dataArray.length;

            // Lógica de Gatilho
            if (volume > VOICE_THRESHOLD) {
                // Voz detectada!
                if (mediaRecorderRef.current.state === "inactive") {
                    console.log("🎙️ Voz detectada! Gravando...");
                    mediaRecorderRef.current.start();
                    setListening(true);
                }
                // Reseta timer de silêncio (usuário continua falando)
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                }
            } else {
                // Silêncio
                if (mediaRecorderRef.current.state === "recording" && !silenceTimerRef.current) {
                    // Inicia contagem para cortar
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
        console.error("❌ Erro fatal no áudio:", err);
      }
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <SpeechContext.Provider value={{ message, onMessagePlayed, loading, listening, sendMessage }}>
      {children}
    </SpeechContext.Provider>
  );
};