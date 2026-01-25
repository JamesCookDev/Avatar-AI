import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

// 1. Pega a URL do .env (Profissional)
// Se não tiver .env, usa localhost como fallback
const API_URL = import.meta.env.VITE_API_URL || "http://192.168.0.102:3000";

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

  const onMessagePlayed = () => {
    setMessage(null);
    
    // 🕒 COOLDOWN: Espera 0.5s para o eco da sala sumir antes de ouvir de novo
    setTimeout(() => {
      isPlayingRef.current = false; // 🔓 LIBERA O MICROFONE
      processQueue();
    }, 500); 
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

          if (audioBlob.size < 3000) return; // Ignora áudios muito curtos/ruídos (< 3kb)

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

          // Ajuste a sensibilidade se precisar (20 a 30 é bom para ambientes normais)
          if (average > 25) { 
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
                // Espera 1.5 segundos de silêncio para cortar
                silenceTimerRef.current = setTimeout(() => {
                   if (mediaRecorderRef.current.state === "recording") {
                      console.log("🤫 Silêncio detectado. Parando gravação.");
                      mediaRecorderRef.current.stop();
                   }
                }, 1500); 
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
    <SpeechContext.Provider value={{ message, onMessagePlayed, loading, listening }}>
      {children}
    </SpeechContext.Provider>
  );
};