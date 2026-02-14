import { CameraControls, Environment, Sky, ContactShadows, Sparkles } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import * as THREE from "three";

// Configuração de tema visual
const THEME = {
  environment: 'city',
  bgColor: '#0f3460',
  floorColor: '#1a1a2e',
  ambientIntensity: 0.4,
  accentColor1: '#4a90ff',
  accentColor2: '#ff6b9d',
  sparkleColor: '#4a90ff',
};

export const Scenario = () => {
  const cameraControls = useRef();
  
  useEffect(() => {
    // Posicionamento de câmera mais cinematográfico
    cameraControls.current.setLookAt(0, 1.65, 4, 0, 1.5, 0, true);
  }, []);

  return (
    <>
      {/* Controles de Câmera */}
      <CameraControls 
        ref={cameraControls}
        minDistance={3}
        maxDistance={8}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2}
      />

      {/* Ambiente */}
      <Environment preset={THEME.environment} />
      
      {/* Céu Gradiente */}
      <Sky
        distance={450000}
        sunPosition={[0, 1, 0]}
        inclination={0.6}
        azimuth={0.25}
      />

      {/* Intensidade da luz baseada no tema */}
      <ambientLight intensity={THEME.ambientIntensity} />
      
      {/* Luz Principal (Key Light) */}
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Luz de Preenchimento (Fill Light) */}
      <directionalLight
        position={[-5, 3, -5]}
        intensity={0.5}
        color="#b8d4ff"
      />

      {/* Luz de Destaque (Rim Light) */}
      <spotLight
        position={[0, 5, -5]}
        intensity={0.8}
        angle={0.6}
        penumbra={0.5}
        color="#ffd4a3"
        castShadow
      />

      {/* Luzes Pontuais para Profundidade */}
      <pointLight position={[-3, 2, 2]} intensity={0.3} color="#4a90ff" />
      <pointLight position={[3, 2, 2]} intensity={0.3} color="#ff6b9d" />

      {/* Avatar */}
      <Avatar position={[0, 0, 0]} />

      {/* Sombras de Contato (mais realistas) */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        scale={10}
        blur={2}
        far={4}
        resolution={256}
        color="#000000"
      />

      {/* Chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial 
          color={THEME.floorColor}
          roughness={0.3}
          metalness={0.8}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* Parede de Fundo */}
      <mesh position={[0, 4, -5]} receiveShadow>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial 
          color={THEME.bgColor}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      {/* Partículas */}
      <Sparkles
        count={50}
        scale={10}
        size={2}
        speed={0.3}
        opacity={0.4}
        color={THEME.sparkleColor}
      />

      {/* Painéis Laterais */}
      <group position={[-4, 1.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 3, 2]} />
          <meshStandardMaterial 
            color="#16213e"
            emissive={THEME.accentColor1}
            emissiveIntensity={0.3}
            roughness={0.2}
            metalness={0.9}
          />
        </mesh>
      </group>

      <group position={[4, 1.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 3, 2]} />
          <meshStandardMaterial 
            color="#16213e"
            emissive={THEME.accentColor2}
            emissiveIntensity={0.3}
            roughness={0.2}
            metalness={0.9}
          />
        </mesh>
      </group>

      {/* Anéis Decorativos */}
      <mesh position={[0, 3.5, -2]} rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[1.5, 0.05, 16, 100]} />
        <meshStandardMaterial 
          color={THEME.accentColor1}
          emissive={THEME.accentColor1}
          emissiveIntensity={0.5}
          roughness={0.1}
          metalness={1}
        />
      </mesh>

      <mesh position={[0, 3.5, -2]} rotation={[0, 0, -Math.PI / 4]}>
        <torusGeometry args={[1.8, 0.04, 16, 100]} />
        <meshStandardMaterial 
          color={THEME.accentColor2}
          emissive={THEME.accentColor2}
          emissiveIntensity={0.4}
          roughness={0.1}
          metalness={1}
        />
      </mesh>
    </>
  );
};