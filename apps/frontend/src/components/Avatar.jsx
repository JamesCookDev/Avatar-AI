import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useSpeech } from "../hooks/useSpeech";

// 1. MAPEAMENTO EXATO (Baseado no SEU log do console)
// Rhubarb Phoneme -> Nome da Morph Target no seu GLB
const visemeMap = {
  A: "viseme_PP",  // Boca fechada (M, B, P)
  B: "viseme_kk",  // Consoantes médias (K, S, T)
  C: "viseme_I",   // Vogais esticadas (Eh, Ih)
  D: "viseme_aa",  // Boca bem aberta (Ah)
  E: "viseme_O",   // Boca redonda (Oh)
  F: "viseme_U",   // Bico (Uh, W)
  G: "viseme_FF",  // Dentes no lábio (F, V)
  H: "viseme_TH",  // Língua (L, Th)
  X: "viseme_sil", // Silêncio (Pausa)
};

export function Avatar(props) {
  const { scene } = useGLTF("/models/avatar.glb");
  const { animations: animationClips } = useGLTF("/models/animations.glb");
  const { message, onMessagePlayed } = useSpeech();

  const group = useRef();
  const { actions } = useAnimations(animationClips, group);
  
  // MUDANÇA CRÍTICA: Usamos Ref para o áudio, não State.
  // Isso remove o delay de renderização do React.
  const audioRef = useRef(null); 
  const [lipsync, setLipsync] = useState(null);
  
  const morphMeshesRef = useRef([]); 
  const onMessagePlayedRef = useRef(onMessagePlayed);

  useEffect(() => {
    onMessagePlayedRef.current = onMessagePlayed;
  }, [onMessagePlayed]);

  // --- ANIMAÇÃO DE CORPO ---
  useEffect(() => {
    if (!actions) return;
    const currentAnimation = message ? (message.animation || "TalkingOne") : "Idle";
    
    if (actions[currentAnimation]) {
      actions[currentAnimation].reset().fadeIn(0.5).play();
      return () => {
        actions[currentAnimation]?.fadeOut(0.5);
      };
    }
  }, [message, actions]);

  // --- DETECTOR DE PEÇAS ---
  useEffect(() => {
    if (!scene) return;
    morphMeshesRef.current = [];
    
    scene.traverse((child) => {
      if (child.isMesh && child.morphTargetDictionary) {
        morphMeshesRef.current.push(child);
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  // --- PLAYER DE ÁUDIO (SEM LAG) ---
  useEffect(() => {
    if (!message) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    // 1. Prepara os dados
    setLipsync(message.lipsync);
    
    // 2. Cria o áudio e salva na REF imediatamente
    const newAudio = new Audio("data:audio/mp3;base64," + message.audio);
    audioRef.current = newAudio;
    
    newAudio.onended = () => {
      if (onMessagePlayedRef.current) onMessagePlayedRef.current();
    };
    
    // 3. Toca
    newAudio.play().catch(e => console.error("Erro playback:", e));

    // 4. Limpeza instantânea ao trocar de mensagem
    return () => {
      newAudio.pause();
      newAudio.currentTime = 0;
    };
  }, [message]);

  // --- LIPSYNC LOOP (60 FPS) ---
  useFrame(() => {
    // Se não tem peças, áudio ou dados de boca, sai e fecha a boca
    if (morphMeshesRef.current.length === 0 || !lipsync || !audioRef.current) {
      // Fecha a boca suavemente
      morphMeshesRef.current.forEach((mesh) => {
        if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
             const keys = Object.keys(visemeMap);
             keys.forEach(key => {
                 const targetName = visemeMap[key];
                 const index = mesh.morphTargetDictionary[targetName];
                 if (index !== undefined) {
                     mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
                         mesh.morphTargetInfluences[index], 0, 0.1
                     );
                 }
             });
        }
      });
      return;
    }

    // O PULO DO GATO: Lendo direto da Ref (Sem Lag)
    const currentAudioTime = audioRef.current.currentTime;
    
    // Se o áudio pausou ou acabou, força fechamento
    if (audioRef.current.paused || audioRef.current.ended) {
        // (Mesma lógica de fechar boca acima)
        return; 
    }

    // 1. Encontra o fonema para o segundo exato
    const currentCue = lipsync.mouthCues.find((cue) => {
      return currentAudioTime >= cue.start && currentAudioTime <= cue.end;
    });

    // Se achou, pega o nome da chave (ex: viseme_aa). Se não, usa X (silêncio)
    const targetViseme = currentCue ? visemeMap[currentCue.value] : visemeMap["X"];

    // 2. Aplica na malha
    morphMeshesRef.current.forEach((mesh) => {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

        const targetIndex = mesh.morphTargetDictionary[targetViseme];

        // Se a malha (ex: Dente) não tem 'viseme_aa', tenta 'mouthOpen'
        // Isso resolve o problema do dente atravessando
        let finalIndex = targetIndex;
        if (finalIndex === undefined && targetViseme !== visemeMap["X"]) {
            finalIndex = mesh.morphTargetDictionary["mouthOpen"];
        }

        if (finalIndex !== undefined) {
            // APLICAÇÃO DO MOVIMENTO
            
            // 1. Zera todas as outras bocas (para não misturar)
            Object.values(visemeMap).forEach((vName) => {
                const idx = mesh.morphTargetDictionary[vName];
                if (idx !== undefined && idx !== finalIndex) {
                    mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
                        mesh.morphTargetInfluences[idx],
                        0,
                        0.4 // Velocidade de fechamento
                    );
                }
            });

            // 2. Abre a boca certa
            mesh.morphTargetInfluences[finalIndex] = THREE.MathUtils.lerp(
                mesh.morphTargetInfluences[finalIndex],
                1,
                0.4 // Velocidade de abertura
            );
        }
    });
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/avatar.glb");
useGLTF.preload("/models/animations.glb");