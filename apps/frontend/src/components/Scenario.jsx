import { CameraControls, Environment, ContactShadows, Sparkles } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import * as THREE from "three";
import { useCMSConfig } from "../hooks/useCMSConfig";

export const Scenario = ({ uiOverride } = {}) => {
  const cameraControls = useRef();
  
  // Aceita uiOverride do App.jsx (SceneBlock) ou usa o CMS padrão
  const { ui: cmsUi } = useCMSConfig();
  const ui = uiOverride || cmsUi;
  
  // Configurações com fallbacks
  const canvasConfig = ui?.canvas || {};
  const envConfig = canvasConfig.environment || {};
  const bgConfig = canvasConfig.background || {};
  const cameraConfig = canvasConfig.camera || {};
  const lightingConfig = canvasConfig.lighting || {};
  const shadowsConfig = canvasConfig.shadows || {};
  
  // Camera inicial
  const initialLookAt = cameraConfig.initial_look_at || {};
  const cameraPosition = initialLookAt.position || [0, 1.65, 4];
  const cameraTarget = initialLookAt.target || [0, 1.5, 0];
  const smoothTransition = initialLookAt.smooth ?? true;
  
  // Controls
  const controlsConfig = cameraConfig.controls || {};
  const minDistance = controlsConfig.minDistance ?? 3;
  const maxDistance = controlsConfig.maxDistance ?? 8;
  const minPolarAngle = controlsConfig.minPolarAngle ?? Math.PI / 4;
  const maxPolarAngle = controlsConfig.maxPolarAngle ?? Math.PI / 2;

  useEffect(() => {
    cameraControls.current?.setLookAt(
      ...cameraPosition,
      ...cameraTarget,
      smoothTransition
    );
  }, [cameraPosition, cameraTarget, smoothTransition]);

  // Floor config
  const floorGeometry = envConfig.floor_geometry || {};
  const floorMaterial = envConfig.floor_material || {};
  
  // Wall config
  const wallGeometry = envConfig.wall_geometry || {};
  const wallMaterial = envConfig.wall_material || {};
  
  // Particles config
  const particlesConfig = envConfig.particles || {};

  return (
    <>
      <CameraControls 
        ref={cameraControls}
        minDistance={minDistance}
        maxDistance={maxDistance}
        minPolarAngle={minPolarAngle}
        maxPolarAngle={maxPolarAngle}
      />

      {/* Environment preset configurável */}
      <Environment preset={envConfig.preset || "city"} />
      
      {/* 💡 LUZES DINÂMICAS */}
      
      {/* Ambient Light */}
      {lightingConfig.ambient && (
        <ambientLight 
          intensity={lightingConfig.ambient.intensity ?? 0.4} 
        />
      )}
      
      {/* Directional Lights */}
      {lightingConfig.directional?.map((light, i) => (
        <directionalLight 
          key={`dir-${i}`}
          position={light.position || [0, 0, 0]}
          intensity={light.intensity ?? 1}
          color={light.color || "#ffffff"}
          castShadow={light.castShadow ?? false}
          shadow-mapSize={light.shadowMapSize || [2048, 2048]}
        />
      ))}
      
      {/* Spot Lights */}
      {lightingConfig.spot?.map((light, i) => (
        <spotLight 
          key={`spot-${i}`}
          position={light.position || [0, 5, 0]}
          intensity={light.intensity ?? 1}
          angle={light.angle ?? 0.6}
          penumbra={light.penumbra ?? 0.5}
          color={light.color || "#ffffff"}
          castShadow={light.castShadow ?? false}
        />
      ))}
      
      {/* Point Lights */}
      {lightingConfig.point?.map((light, i) => (
        <pointLight 
          key={`point-${i}`}
          position={light.position || [0, 0, 0]}
          intensity={light.intensity ?? 1}
          color={light.color || "#ffffff"}
        />
      ))}
      
      {/* Fallback: Luzes padrão se nenhuma configuração */}
      {!lightingConfig.ambient && !lightingConfig.directional && (
        <>
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[5, 5, 5]} 
            intensity={1.2} 
            castShadow 
            shadow-mapSize={[2048, 2048]} 
          />
          <directionalLight 
            position={[-5, 3, -5]} 
            intensity={0.5} 
            color="#b8d4ff" 
          />
          <spotLight 
            position={[0, 5, -5]} 
            intensity={0.8} 
            angle={0.6} 
            penumbra={0.5} 
            color="#ffd4a3" 
            castShadow 
          />
          <pointLight position={[-3, 2, 2]} intensity={0.3} color="#4a90ff" />
          <pointLight position={[3, 2, 2]} intensity={0.3} color="#ff6b9d" />
        </>
      )}

      {/* 🤖 AVATAR */}
      <Avatar position={[0, 0, 0]} />

      {/* SOMBRAS CONFIGURÁVEIS */}
      <ContactShadows 
        position={shadowsConfig.position || [0, 0, 0]}
        opacity={shadowsConfig.opacity ?? 0.5}
        scale={shadowsConfig.scale ?? 10}
        blur={shadowsConfig.blur ?? 2}
        far={shadowsConfig.far ?? 4}
        resolution={shadowsConfig.resolution ?? 256}
        color={shadowsConfig.color || "#000000"}
      />

      {/* 🏢 CHÃO 3D - Configurável */}
      {envConfig.show_floor !== false && (
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.01, 0]} 
          receiveShadow
        >
          <planeGeometry args={[
            floorGeometry.width ?? 20,
            floorGeometry.height ?? 20
          ]} />
          <meshStandardMaterial 
            color={envConfig.floor_color || '#1a1a2e'}
            roughness={floorMaterial.roughness ?? 0.3}
            metalness={floorMaterial.metalness ?? 0.8}
            envMapIntensity={floorMaterial.envMapIntensity ?? 0.5}
          />
        </mesh>
      )}

      {/* 🎨 PAREDE 3D - Configurável */}
      {envConfig.show_wall !== false && (
        <mesh 
          position={wallGeometry.position || [0, 4, -5]} 
          receiveShadow
        >
          <planeGeometry args={[
            wallGeometry.width ?? 20,
            wallGeometry.height ?? 12
          ]} />
          <meshStandardMaterial 
            color={bgConfig.color || '#0f3460'}
            roughness={wallMaterial.roughness ?? 0.8}
            metalness={wallMaterial.metalness ?? 0.2}
          />
        </mesh>
      )}

      {/* ✨ PARTÍCULAS - Configuráveis */}
      {envConfig.show_particles !== false && (
        <Sparkles
          count={particlesConfig.count ?? 50}
          scale={particlesConfig.scale ?? 10}
          size={particlesConfig.size ?? 2}
          speed={particlesConfig.speed ?? 0.3}
          opacity={particlesConfig.opacity ?? 0.4}
          color={particlesConfig.color || "#4a90ff"}
        />
      )}
    </>
  );
};