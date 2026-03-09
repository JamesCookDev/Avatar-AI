import { CameraControls, Environment, ContactShadows } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import { useCMSConfig } from "../hooks/useCMSConfig";

export const Scenario = ({ uiOverride } = {}) => {
  const cameraControls = useRef();
  
  const { ui: cmsUi } = useCMSConfig();
  const ui = uiOverride || cmsUi;
  
  const canvasConfig = ui?.canvas || {};
  const cameraConfig = canvasConfig.camera || {};
  const lightingConfig = canvasConfig.lighting || {};
  const shadowsConfig = canvasConfig.shadows || {};
  const envConfig = canvasConfig.environment || {};
  
  const initialLookAt = cameraConfig.initial_look_at || {};
  const cameraPosition = initialLookAt.position || [0, 1.65, 4];
  const cameraTarget = initialLookAt.target || [0, 1.5, 0];
  const smoothTransition = initialLookAt.smooth ?? true;
  
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

  return (
    <>
      <CameraControls 
        ref={cameraControls}
        minDistance={minDistance}
        maxDistance={maxDistance}
        minPolarAngle={minPolarAngle}
        maxPolarAngle={maxPolarAngle}
      />

      {/* Environment for lighting only — no visible background */}
      <Environment preset={envConfig.preset || "city"} background={false} />
      
      {/* Lights */}
      {lightingConfig.ambient && (
        <ambientLight intensity={lightingConfig.ambient.intensity ?? 0.4} />
      )}
      
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
      
      {lightingConfig.point?.map((light, i) => (
        <pointLight 
          key={`point-${i}`}
          position={light.position || [0, 0, 0]}
          intensity={light.intensity ?? 1}
          color={light.color || "#ffffff"}
        />
      ))}
      
      {/* Fallback lights */}
      {!lightingConfig.ambient && !lightingConfig.directional && (
        <>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
          <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#b8d4ff" />
        </>
      )}

      {/* Avatar only */}
      <Avatar position={[0, 0, 0]} />

      {/* Subtle contact shadow under feet */}
      <ContactShadows 
        position={shadowsConfig.position || [0, 0, 0]}
        opacity={shadowsConfig.opacity ?? 0.35}
        scale={shadowsConfig.scale ?? 6}
        blur={shadowsConfig.blur ?? 2.5}
        far={shadowsConfig.far ?? 4}
        resolution={shadowsConfig.resolution ?? 256}
        color={shadowsConfig.color || "#000000"}
      />
    </>
  );
};
