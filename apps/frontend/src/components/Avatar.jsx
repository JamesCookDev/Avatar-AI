import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useSpeech } from "../hooks/useSpeech";
import { useCMSConfig } from "../hooks/useCMSConfig"; // ← Caminho corrigido

// 1. MAPEAMENTO EXATO (Baseado no SEU log do console)
const visemeMap = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_aa",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_sil",
};

export function Avatar(props) {
  const { scene } = useGLTF("/models/avatar.glb");
  const { animations: animationClips } = useGLTF("/models/animations.glb");
  const { message, onMessagePlayed } = useSpeech();
  
  // ✅ INTEGRAÇÃO CMS - Busca configurações do painel
  const { colors, textures, material, loading, error, isConnected } = useCMSConfig();

  const group = useRef();
  const { actions } = useAnimations(animationClips, group);
  
  const audioRef = useRef(null); 
  const [lipsync, setLipsync] = useState(null);
  
  const morphMeshesRef = useRef([]); 
  const onMessagePlayedRef = useRef(onMessagePlayed);

  useEffect(() => {
    onMessagePlayedRef.current = onMessagePlayed;
  }, [onMessagePlayed]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MAPEAMENTO DE MESHES → CORES DO UNIFORME
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Ajuste os nomes abaixo conforme o log do console mostrar
  const MESH_COLOR_MAP = {
    // Ready Player Me padrão
    'Wolf3D_Outfit_Top': 'shirt',
    'Wolf3D_Outfit_Bottom': 'pants',
    'Wolf3D_Outfit_Footwear': 'shoes',
    // Avaturn / Mixamo
    'Shirt': 'shirt',
    'Pants': 'pants',
    'Shoes': 'shoes',
    // Genéricos
    'Top': 'shirt',
    'Bottom': 'pants',
    'Footwear': 'shoes',
    'outfit_top': 'shirt',
    'outfit_bottom': 'pants',
    'outfit_footwear': 'shoes',
  };

  // ✅ APLICAR CONFIGURAÇÕES DO CMS
  useEffect(() => {
    if (!scene || !colors) return;

    console.log('🎨 [CMS] Aplicando configurações ao avatar...');
    console.log('   📋 Cores recebidas:', colors);
    
    let appliedCount = 0;
    
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        const mat = child.material;
        const meshName = child.name;
        
        // Verifica se esta mesh tem cor específica mapeada
        const colorKey = MESH_COLOR_MAP[meshName];
        
        if (colorKey && colors[colorKey]) {
          // Aplica cor específica da peça (camisa, calça, sapato)
          mat.color = new THREE.Color(colors[colorKey]);
          console.log(`   ✓ ${meshName}: ${colors[colorKey]} (${colorKey})`);
          appliedCount++;
        } else if (meshName.toLowerCase().includes('body') || meshName.toLowerCase().includes('skin')) {
          // Não altera cor do corpo/pele
          console.log(`   ⏭️ ${meshName}: mantido (corpo/pele)`);
        } else if (meshName.toLowerCase().includes('hair') || meshName.toLowerCase().includes('head')) {
          // Não altera cabelo/cabeça
          console.log(`   ⏭️ ${meshName}: mantido (cabelo/cabeça)`);
        }

        // Aplica propriedades do material para todas as meshes de roupa
        if (colorKey && material) {
          mat.roughness = material.roughness ?? 0.5;
          mat.metalness = material.metalness ?? 0.0;
        }

        mat.needsUpdate = true;
      }
    });
    
    if (appliedCount === 0) {
      console.warn('⚠️ [CMS] Nenhuma mesh mapeada! Verifique os nomes no log DEBUG.');
    } else {
      console.log(`✅ [CMS] ${appliedCount} peças atualizadas`);
    }
  }, [scene, colors, material]);

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
    
    console.log('🔍 [DEBUG] Analisando estrutura do avatar...');
    scene.traverse((child) => {
      if (child.isMesh) {
        // Log para descobrir os nomes das meshes
        console.log(`   📦 Mesh: "${child.name}" | Material: ${child.material?.name || 'sem nome'}`);
        
        if (child.morphTargetDictionary) {
          morphMeshesRef.current.push(child);
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    console.log('🔍 [DEBUG] Total de meshes encontradas:', morphMeshesRef.current.length);
  }, [scene]);

  // --- PLAYER DE ÁUDIO ---
  useEffect(() => {
    if (!message) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    setLipsync(message.lipsync);
    
    const newAudio = new Audio("data:audio/mp3;base64," + message.audio);
    audioRef.current = newAudio;
    
    newAudio.onended = () => {
      if (onMessagePlayedRef.current) onMessagePlayedRef.current();
    };
    
    newAudio.play().catch(e => console.error("Erro playback:", e));

    return () => {
      newAudio.pause();
      newAudio.currentTime = 0;
    };
  }, [message]);

  // --- LIPSYNC LOOP ---
  useFrame(() => {
    if (morphMeshesRef.current.length === 0 || !lipsync || !audioRef.current) {
      morphMeshesRef.current.forEach((mesh) => {
        if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
          Object.keys(visemeMap).forEach(key => {
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

    const currentAudioTime = audioRef.current.currentTime;
    
    if (audioRef.current.paused || audioRef.current.ended) return;

    const currentCue = lipsync.mouthCues.find((cue) => {
      return currentAudioTime >= cue.start && currentAudioTime <= cue.end;
    });

    const targetViseme = currentCue ? visemeMap[currentCue.value] : visemeMap["X"];

    morphMeshesRef.current.forEach((mesh) => {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

      const targetIndex = mesh.morphTargetDictionary[targetViseme];
      let finalIndex = targetIndex;
      
      if (finalIndex === undefined && targetViseme !== visemeMap["X"]) {
        finalIndex = mesh.morphTargetDictionary["mouthOpen"];
      }

      if (finalIndex !== undefined) {
        Object.values(visemeMap).forEach((vName) => {
          const idx = mesh.morphTargetDictionary[vName];
          if (idx !== undefined && idx !== finalIndex) {
            mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
              mesh.morphTargetInfluences[idx], 0, 0.4
            );
          }
        });

        mesh.morphTargetInfluences[finalIndex] = THREE.MathUtils.lerp(
          mesh.morphTargetInfluences[finalIndex], 1, 0.4
        );
      }
    });
  });

  // ✅ LOG DE STATUS DA CONEXÃO
  useEffect(() => {
    if (isConnected) {
      console.log('✅ [CMS] Conectado ao painel!');
    } else if (error) {
      console.error('❌ [CMS] Erro de conexão:', error);
    }
  }, [isConnected, error]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/avatar.glb");
useGLTF.preload("/models/animations.glb");