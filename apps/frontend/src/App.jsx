import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Scenario } from "./components/Scenario";
import { ChatInterface } from "./components/ChatInterface";

function App() {
  return (
    <>
      <Loader />
      {/* Esconde os controles de debug na apresentação */}
      <Leva collapsed hidden /> 
      
      {/* Canvas 3D com o Avatar e Cenário */}
      <Canvas shadows camera={{ position: [0, 0, 0], fov: 26 }}>
        <Scenario />
      </Canvas>

      {/* Interface de Chat sobreposta ao Canvas */}
      <ChatInterface />
    </>
  );
}

export default App;