import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) throw new Error("useSpeech must be used within a SpeechProvider");
  return context;
};

export const SpeechProvider = ({ children }) => {
  // Estado Visual
  const [message, setMessage] = useState(null); // Mensagem tocando AGORA
  const [loading, setLoading] = useState(false); // Backend processando
  const [listening, setListening] = useState(false); // Microfone ligado

  // --- LÓGICA DA FILA (Refs para garantir ordem síncrona) ---
  const queueRef = useRef([]); // A fila não provoca re-render
  const isPlayingRef = useRef(false); // Trava de segurança imediata

  // Função central: Tenta tocar o próximo da fila
  const processQueue = () => {
    // 1. Se já estiver tocando, PARE. Não faça nada.
    if (isPlayingRef.current) return;

    // 2. Se a fila estiver vazia, PARE.
    if (queueRef.current.length === 0) return;

    // 3. Pega o próximo item e remove da fila
    const nextMessage = queueRef.current.shift();

    // 4. Bloqueia o player e atualiza o estado
    console.log("🎵 Iniciando playback:", nextMessage.text.substring(0, 20));
    isPlayingRef.current = true;
    setMessage(nextMessage);
  };

  // Função chamada pelo Avatar quando o áudio acaba
  const onMessagePlayed = () => {
    console.log("✅ Áudio terminou. Verificando fila...");
    
    // 1. Libera a trava
    isPlayingRef.current = false;
    setMessage(null);

    // 2. Pequeno delay para garantir que o React limpou o componente anterior
    setTimeout(() => {
      processQueue();
    }, 100); 
  };

  // --- GRAVAÇÃO E ENVIO ---
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    let animationFrame;

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
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

          if (audioBlob.size < 2000) return; // Ignora ruídos curtos

          setLoading(true);

          try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64Audio = reader.result.split(",")[1];
              console.log("🚀 Enviando áudio...");

              const response = await fetch("http://localhost:3000/sts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audio: base64Audio }),
              });

              const data = await response.json();

              if (data.messages && data.messages.length > 0) {
                console.log(`📥 Recebido! +${data.messages.length} na fila.`);
                
                // ADICIONA À FILA (Sem tocar ainda)
                data.messages.forEach(msg => queueRef.current.push(msg));
                
                // TENTA PROCESSAR (Só vai tocar se o player estiver livre)
                processQueue();
              }
              setLoading(false);
            };
          } catch (error) {
            console.error(error);
            setLoading(false);
          }
        };

        // Lógica de VAD (Detector de Voz)
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        const checkVolume = () => {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;

          if (average > 25) { // Threshold
             if (mediaRecorderRef.current.state === "inactive") {
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
                      mediaRecorderRef.current.stop();
                   }
                }, 2000); // 2 segundos de silêncio para cortar
             }
          }
          animationFrame = requestAnimationFrame(checkVolume);
        };
        checkVolume();

      } catch (err) {
        console.error("Erro mic:", err);
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