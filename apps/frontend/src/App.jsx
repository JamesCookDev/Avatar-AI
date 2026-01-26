import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Scenario } from "./components/Scenario";

// NÃO chame useSpeech() aqui fora. O hook já está sendo usado dentro dos componentes filhos (Avatar/ChatInterface).

function App() {
  return (
    <>
      <Loader />
      {/* Esconde os controles de debug na apresentação */}
      <Leva collapsed hidden /> 
      
      {/* Interface de Chat (opcional, pode remover se quiser tela limpa na apresentação) */}      
      <Canvas shadows camera={{ position: [0, 0, 0], fov: 26 }}>
        <Scenario />
      </Canvas>
    </>
  );
}

export default App;