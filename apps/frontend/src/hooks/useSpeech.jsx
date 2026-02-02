import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const MIN_AUDIO_SIZE = 3000;        // Tamanho mínimo do áudio em bytes
const VOICE_THRESHOLD = 25;          // Sensibilidade do microfone (20-30)
const SILENCE_TIMEOUT = 1500;        // ms de silêncio para parar gravação
const PLAYBACK_COOLDOWN = 500;       // ms de espera após reprodução

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) throw new Error("useSpeech must be used within a SpeechProvider");
  return context;
};

export const SpeechProvider = ({ children }) => {
  // Estado Visual
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  // --- FILA DE MENSAGENS ---
  const queueRef = useRef([]);
  const isPlayingRef = useRef(false); // Indica se o Avatar está falando

  const processQueue = () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;

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
  const analyserRef = useRef(null);

  useEffect(() => {
    let animationFrame;

    const initAudio = async () => {
      try {
        // 🛡️ SOLICITA CANCELAMENTO DE ECO AO NAVEGADOR
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        mediaRecorderRef.current = new MediaRecorder(stream);
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          audioChunksRef.current = [];
          setListening(false);

          if (audioBlob.size < MIN_AUDIO_SIZE) return; // Ignora áudios muito curtos

          setLoading(true);

          try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64Audio = reader.result.split(",")[1];
              
              // 🌐 USA A URL CORRETA DO ENV
              console.log(`🚀 Enviando áudio para: ${API_URL}/sts`);

              try {
                  const response = await fetch(`${API_URL}/sts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ audio: base64Audio }),
                  });

                  if (!response.ok) throw new Error("Erro de conexão com o servidor");

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

      } catch (err) {
        console.error("Erro ao iniciar áudio:", err);
      }
    };

    initAudio();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <SpeechContext.Provider value={{ message, onMessagePlayed, loading, listening, sendMessage }}>
      {children}
    </SpeechContext.Provider>
  );
};