// vad.mjs - Versão Zero Dependências (Nativa)
// Lê os bytes do áudio diretamente, sem precisar do 'node-wav'

export function isAudioSilent(buffer, threshold = 0.02) {
  try {
    // 1. Validação básica: Se o arquivo for menor que 44 bytes (cabeçalho WAV), está vazio.
    if (!buffer || buffer.length < 44) return true;

    let sum = 0;
    let count = 0;

    // 2. Análise manual dos bytes (Pula os primeiros 44 bytes do cabeçalho)
    // Lemos números de 16-bits (padrão WAV) a cada 100 bytes (amostragem rápida)
    for (let i = 44; i < buffer.length; i += 100) {
      // Garante que não passamos do fim do arquivo
      if (i + 1 >= buffer.length) break;

      // Lê o valor da onda sonora (Inteiro de 16 bits: -32768 a 32767)
      const rawValue = buffer.readInt16LE(i);
      
      // Normaliza para ficar entre -1.0 e 1.0 (igual bibliotecas de áudio fazem)
      const normalized = rawValue / 32768.0;

      // Cálculo de Energia (RMS)
      sum += normalized * normalized;
      count++;
    }

    if (count === 0) return true; // Se não leu nada, é silêncio.

    const rms = Math.sqrt(sum / count);
    
    // console.log(`🔊 Volume Nível: ${rms.toFixed(4)}`);

    // Se a energia for menor que 2%, consideramos silêncio
    return rms < threshold;

  } catch (e) {
    console.error("⚠️ Erro na verificação de silêncio:", e.message);
    // Na dúvida (erro de leitura), deixamos passar para não travar o bot
    return false; 
  }
}