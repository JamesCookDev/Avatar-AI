import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useSpeech } from "../hooks/useSpeech";

// Correção: 'viseme_aa' estava minúsculo, o padrão ARKit é 'viseme_AA'
const visemeMap = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA", // Corrigido para maiúsculo
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

export function Avatar(props) {
  // 1. CARREGA O MODELO (CORPO)
  const { scene } = useGLTF("/models/avatar.glb");

  // 2. CARREGA AS ANIMAÇÕES (MOVIMENTOS)
  const { animations: animationClips } = useGLTF("/models/animations.glb");

  const { message, onMessagePlayed } = useSpeech();

  // Refs e Estados
  const group = useRef();
  const { actions } = useAnimations(animationClips, group);
  const [lipsync, setLipsync] = useState();
  const [audio, setAudio] = useState(null);
  const headMeshRef = useRef(null);

  // --- TRUQUE AVANÇADO: REF PARA O CALLBACK ---
  // Isso impede que o áudio reinicie quando o 'onMessagePlayed' muda (ex: ao falar no mic)
  const onMessagePlayedRef = useRef(onMessagePlayed);
  
  // Atualiza a ref sempre que a função mudar, mas sem disparar o useEffect do áudio
  useEffect(() => {
    onMessagePlayedRef.current = onMessagePlayed;
  }, [onMessagePlayed]);

  // --- Lógica de Animação de Corpo ---
  useEffect(() => {
    if (!actions) return;

    const currentAnimation = message ? (message.animation || "TalkingOne") : "Idle";

    // Suavização da troca de animação
    if (actions[currentAnimation]) {
      actions[currentAnimation].reset().fadeIn(0.5).play();
      return () => {
        actions[currentAnimation]?.fadeOut(0.5);
      };
    }
  }, [message, actions]); // Depende apenas da mensagem

  // --- Lógica de Auto-Detecção da Cabeça ---
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.morphTargetDictionary && (child.name.includes("Head") || child.name.includes("Avatar"))) {
          headMeshRef.current = child;
        }
      }
    });
  }, [scene]);

  // --- LÓGICA DE ÁUDIO BLINDADA ---
  useEffect(() => {
    // Se não tem mensagem, limpa o áudio e sai
    if (!message) {
      setAudio(null);
      return;
    }

    setLipsync(message.lipsync);
    
    // Cria o áudio
    const newAudio = new Audio("data:audio/mp3;base64," + message.audio);
    
    // Configura o evento de fim
    newAudio.onended = () => {
      // Chama a versão mais recente da função através da Ref
      if (onMessagePlayedRef.current) {
        onMessagePlayedRef.current();
      }
    };
    
    // Toca o áudio
    newAudio.play().catch(e => console.error("Erro playback:", e));
    setAudio(newAudio);

    // CLEANUP
    // Só roda se a 'message' mudar (não roda se você falar no microfone)
    return () => {
      newAudio.pause();
      newAudio.currentTime = 0;
    };
    
  // ⚠️ ATENÇÃO: Removemos 'onMessagePlayed' daqui. 
  // Agora o efeito só roda estritamente quando a mensagem muda.
  }, [message]); 

  // --- Loop de Visemas (LipSync Real) ---
  useFrame(() => {
    // Se não estiver tocando ou não tiver configuração, fecha a boca
    if (!headMeshRef.current || !lipsync || !audio || audio.paused) {
      if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
        const dict = headMeshRef.current.morphTargetDictionary;
        Object.values(visemeMap).forEach((viseme) => {
           const index = dict[viseme];
           if (index !== undefined) {
             headMeshRef.current.morphTargetInfluences[index] = THREE.MathUtils.lerp(
               headMeshRef.current.morphTargetInfluences[index],
               0,
               0.15 // Fechamento um pouco mais rápido
             );
           }
        });
      }
      return;
    }

    const currentAudioTime = audio.currentTime;
    
    // Encontra o visema atual
    const currentCue = lipsync.mouthCues.find((cue) => {
      return currentAudioTime >= cue.start && currentAudioTime <= cue.end;
    });

    if (headMeshRef.current.morphTargetDictionary) {
      // Define qual deve estar aberta
      const targetName = currentCue ? (visemeMap[currentCue.value] || "viseme_PP") : null;
      const targetIndex = targetName ? headMeshRef.current.morphTargetDictionary[targetName] : null;

      Object.values(visemeMap).forEach((v) => {
         const idx = headMeshRef.current.morphTargetDictionary[v];
         if (idx !== undefined) {
           // Se for a boca alvo, abre (valor 1). Se não, fecha (valor 0).
           const targetValue = (idx === targetIndex) ? 1 : 0;
           
           headMeshRef.current.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
             headMeshRef.current.morphTargetInfluences[idx],
             targetValue,
             0.4 // Velocidade da fala
           );
         }
      });
    }
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/avatar.glb");
useGLTF.preload("/models/animations.glb");