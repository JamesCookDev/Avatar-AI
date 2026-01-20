import { createContext, useContext, useEffect, useState, useRef } from "react";

const SpeechContext = createContext();

export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) {
    throw new Error("useSpeech must be used within a SpeechProvider");
  }
  return context;
};

export const SpeechProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const MIN_DECIBELS = -45; 
  const SILENCE_DURATION = 2000; 

  // 1. Fila de Mensagens
  useEffect(() => {
    if (!message && messages.length > 0) {
      setMessage(messages[0]);
      setMessages((prev) => prev.slice(1));
    }
  }, [messages, message]);

  const onMessagePlayed = () => {
    setMessage(null);
  };

  // 2. Lógica de Gravação Inteligente (VAD)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    let animationFrame;

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        mediaRecorderRef.current = new MediaRecorder(stream);
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          audioChunksRef.current = [];

          if (audioBlob.size < 3000) {
            setListening(false);
            return;
          }

          setLoading(true);
          setListening(false);

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
                setMessages((prev) => [...prev, ...data.messages]);
              }
              setLoading(false);
            };
          } catch (error) {
            console.error("Erro no envio:", error);
            setLoading(false);
          }
        };

        const checkVolume = () => {
          if (loading || message) {
            animationFrame = requestAnimationFrame(checkVolume);
            return;
          }

          analyserRef.current.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const currentVol = average; 
          const THRESHOLD = 30;

          if (currentVol > THRESHOLD) {
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
                console.log("🛑 Silêncio prolongado. Parando e enviando.");
                if (mediaRecorderRef.current.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
                silenceTimerRef.current = null;
              }, SILENCE_DURATION);
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
      // CORREÇÃO: Só fecha se não estiver fechado
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [loading, message]);

  return (
    <SpeechContext.Provider
      value={{ message, onMessagePlayed, loading, listening }}
    >
      {children}
    </SpeechContext.Provider>
  );
};