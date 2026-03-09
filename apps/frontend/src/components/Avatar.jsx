import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useSpeech } from "../hooks/useSpeech";
import { useCMSConfig } from "../hooks/useCMSConfig";

// ─── MAPEAMENTO DE VISEMES ────────────────────────────────────────────────────
const visemeMap = {
  A: "viseme_PP", B: "viseme_kk", C: "viseme_I", D: "viseme_aa",
  E: "viseme_O",  F: "viseme_U",  G: "viseme_FF", H: "viseme_TH", X: "viseme_sil",
};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const LERP_IN  = 0.4;   // velocidade de entrada dos visemes
const LERP_OUT = 0.12;  // velocidade de saída (mais suave)
const BLINK_INTERVAL_MIN = 2500;  // ms
const BLINK_INTERVAL_MAX = 6000;  // ms
const BLINK_DURATION     = 120;   // ms

// ─── HOOK: Idle breathing (head y-bob) ───────────────────────────────────────
function useIdleBreathing(groupRef, amplitude = 0.004, speed = 0.6) {
  const t = useRef(0);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    t.current += delta * speed;
    groupRef.current.position.y = Math.sin(t.current) * amplitude;
  });
}

// ─── HOOK: Eye blink ─────────────────────────────────────────────────────────
function useEyeBlink(morphMeshesRef) {
  const nextBlink = useRef(Date.now() + rand(BLINK_INTERVAL_MIN, BLINK_INTERVAL_MAX));
  const blinkEnd  = useRef(0);

  useFrame(() => {
    const now = Date.now();
    const isBlinking = now < blinkEnd.current;

    morphMeshesRef.current.forEach((mesh) => {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
      const targets = ["eyeBlinkLeft", "eyeBlinkRight"];
      targets.forEach((t) => {
        const idx = mesh.morphTargetDictionary[t];
        if (idx === undefined) return;
        mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
          mesh.morphTargetInfluences[idx],
          isBlinking ? 1 : 0,
          isBlinking ? 0.5 : 0.3
        );
      });
    });

    if (!isBlinking && now >= nextBlink.current) {
      blinkEnd.current  = now + BLINK_DURATION;
      nextBlink.current = now + BLINK_DURATION + rand(BLINK_INTERVAL_MIN, BLINK_INTERVAL_MAX);
    }
  });
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── HOOK: Subtle head look-around when idle ─────────────────────────────────
function useIdleHeadLook(groupRef, isTalking) {
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const nextChange = useRef(Date.now() + 3000);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const now = Date.now();
    if (!isTalking && now >= nextChange.current) {
      target.current.x = (Math.random() - 0.5) * 0.06;
      target.current.y = (Math.random() - 0.5) * 0.04;
      nextChange.current = now + rand(2000, 5000);
    }
    if (isTalking) {
      target.current.x = 0;
      target.current.y = 0;
    }
    current.current.x = THREE.MathUtils.lerp(current.current.x, target.current.x, delta * 1.5);
    current.current.y = THREE.MathUtils.lerp(current.current.y, target.current.y, delta * 1.5);
    groupRef.current.rotation.x = current.current.y;
    groupRef.current.rotation.y = current.current.x;
  });
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export function Avatar(props) {
  const { message, onMessagePlayed } = useSpeech();
  const { ui, isConnected, error } = useCMSConfig();

  // ── Config CMS ──────────────────────────────────────────────────────────────
  const avatarConfig = ui?.components?.avatar || {};
  const modelsConfig    = avatarConfig.models      || {};
  const animationsConfig = avatarConfig.animations || {};
  const materialsConfig  = avatarConfig.materials  || {};

  const avatarUrl      = modelsConfig.avatar_url     || "/models/avatar.glb";
  const animationsUrl  = modelsConfig.animations_url || "/models/animations.glb";
  const idleAnimation  = animationsConfig.idle    || "Idle";
  const talkingAnimation = animationsConfig.talking || "TalkingOne";
  const defaultRoughness = materialsConfig.roughness ?? 0.5;
  const defaultMetalness = materialsConfig.metalness ?? 0.0;

  const colors = avatarConfig.colors || { shirt: '#1E3A8A', pants: '#1F2937', shoes: '#000000' };
  const position = avatarConfig.position || 'center';
  const scale    = avatarConfig.scale ?? 1.5;

  // ── Carregar modelos ─────────────────────────────────────────────────────────
  const { scene } = useGLTF(avatarUrl);
  const { animations: animationClips } = useGLTF(animationsUrl);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const group               = useRef();
  const headGroup           = useRef();   // group para head-look
  const { actions }         = useAnimations(animationClips, group);
  const audioRef            = useRef(null);
  const [lipsync, setLipsync] = useState(null);
  const morphMeshesRef      = useRef([]);
  const onMessagePlayedRef  = useRef(onMessagePlayed);
  const isTalking           = !!message;

  useEffect(() => { onMessagePlayedRef.current = onMessagePlayed; }, [onMessagePlayed]);

  // ── Idle breathing (vertical bob) ───────────────────────────────────────────
  useIdleBreathing(group, 0.003, 0.5);

  // ── Eye blink autônomo ───────────────────────────────────────────────────────
  useEyeBlink(morphMeshesRef);

  // ── Head look-around quando idle ────────────────────────────────────────────
  useIdleHeadLook(headGroup, isTalking);

  // ── Aplicar cores da roupa ───────────────────────────────────────────────────
  useEffect(() => {
    if (!scene || !colors) return;
    scene.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mat  = child.material;
      const name = child.name.toLowerCase();
      if (name.includes('shirt') || name.includes('top'))             mat.color = new THREE.Color(colors.shirt);
      if (name.includes('pants') || name.includes('bottom'))          mat.color = new THREE.Color(colors.pants);
      if (name.includes('shoes') || name.includes('footwear'))        mat.color = new THREE.Color(colors.shoes);
      mat.roughness    = defaultRoughness;
      mat.metalness    = defaultMetalness;
      mat.needsUpdate  = true;
    });
  }, [scene, colors, defaultRoughness, defaultMetalness]);

  // ── Animação de corpo ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!actions) return;
    const anim = message ? (message.animation || talkingAnimation) : idleAnimation;
    if (actions[anim]) {
      actions[anim].reset().fadeIn(0.5).play();
      return () => actions[anim]?.fadeOut(0.5);
    }
  }, [message, actions, idleAnimation, talkingAnimation]);

  // ── Coletar meshes com morph targets ────────────────────────────────────────
  useEffect(() => {
    if (!scene) return;
    morphMeshesRef.current = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        if (child.morphTargetDictionary) morphMeshesRef.current.push(child);
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  // ── Player de áudio + lipsync data ──────────────────────────────────────────
  useEffect(() => {
    if (!message) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }

    setLipsync(message.lipsync);
    const audio = new Audio("data:audio/mp3;base64," + message.audio);
    audioRef.current = audio;

    audio.onended = () => onMessagePlayedRef.current?.();
    audio.play().catch((e) => console.error("[Avatar] Erro playback:", e));

    return () => { audio.pause(); audio.currentTime = 0; };
  }, [message]);

  // ── Lipsync frame loop ───────────────────────────────────────────────────────
  useFrame(() => {
    const meshes = morphMeshesRef.current;
    if (!meshes.length) return;

    // Sem áudio → reset suave de todos os visemes de boca
    if (!lipsync || !audioRef.current || audioRef.current.paused || audioRef.current.ended) {
      meshes.forEach((mesh) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
        Object.values(visemeMap).forEach((vName) => {
          const idx = mesh.morphTargetDictionary[vName];
          if (idx !== undefined)
            mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idx], 0, LERP_OUT);
        });
      });
      return;
    }

    const t = audioRef.current.currentTime;
    const cue = lipsync.mouthCues?.find((c) => t >= c.start && t <= c.end);
    const targetViseme = cue ? visemeMap[cue.value] : visemeMap["X"];

    meshes.forEach((mesh) => {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

      let finalIdx = mesh.morphTargetDictionary[targetViseme];
      // Fallback para mouthOpen
      if (finalIdx === undefined && targetViseme !== visemeMap["X"])
        finalIdx = mesh.morphTargetDictionary["mouthOpen"];

      // Reset outros visemes de boca (não piscar)
      Object.values(visemeMap).forEach((vName) => {
        const idx = mesh.morphTargetDictionary[vName];
        if (idx !== undefined && idx !== finalIdx)
          mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idx], 0, LERP_OUT);
      });

      if (finalIdx !== undefined)
        mesh.morphTargetInfluences[finalIdx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[finalIdx], 1, LERP_IN);
    });
  });

  // ── Log de conexão ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) console.log('✅ [Avatar] Conectado ao CMS!');
    else if (error)  console.error('❌ [Avatar] Erro:', error);
  }, [isConnected, error]);

  // ── Posição X ────────────────────────────────────────────────────────────────
  let avatarX = 0;
  if      (typeof position === 'string' && position.includes('left'))  avatarX = -2;
  else if (typeof position === 'string' && position.includes('right')) avatarX = 2;
  else if (typeof position === 'number')                               avatarX = position;

  return (
    <group ref={group} {...props} dispose={null} position={[avatarX, 0, 0]} scale={scale}>
      {/* Head-look sub-group — rotaciona apenas a parte superior */}
      <group ref={headGroup}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// ── Preload padrão ───────────────────────────────────────────────────────────
useGLTF.preload("/models/avatar.glb");
useGLTF.preload("/models/animations.glb");
