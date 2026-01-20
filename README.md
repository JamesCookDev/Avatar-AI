# 🦜 O Guia Turístico *Paraense* Virtual!  
### Totem Interativo com Avatar 3D e IA Conversacional

Jack é um **Avatar 3D interativo** projetado para **totens de autoatendimento**, atuando como um **guia turístico virtual especializado em Belém/PA**.  
O sistema é capaz de **ouvir o usuário**, **entender linguagem natural** e **responder em tempo real com voz sintetizada e sincronia labial**, garantindo uma experiência imersiva e natural.

---

## ✨ Funcionalidades Principais

- 🎤 Reconhecimento de voz em tempo real (STT)
- 🧠 Conversação com IA especializada em turismo local
- 🔊 Síntese de voz neural em português brasileiro
- 👄 Sincronia labial automática (visemas)
- 😀 Expressões faciais e animações corporais
- ⚡ Baixa latência com arquitetura híbrida (Local + Nuvem)
- 🔁 Fallback automático de IA (nunca fica “mudo”)

---

## 🏗️ Arquitetura do Sistema

O projeto utiliza uma **Arquitetura Híbrida de Alta Disponibilidade**, combinando o poder de processamento da **nuvem** (para inteligência artificial) com a velocidade do **processamento local** (para voz e baixa latência).

Essa abordagem garante que o **totem continue operando mesmo com instabilidades de rede** e reduz drasticamente os **custos operacionais**, mantendo respostas rápidas e naturais.

---

## 📐 Diagrama da Arquitetura

```mermaid
graph TD
    %% Estilos
    classDef frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef backend fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef ai fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef local fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;

    subgraph "🖥️ Frontend (Totem Interativo)"
        User((👤 Usuário)) -->|Voz & Gestos| Mic[🎤 Microfone + VAD]
        Mic -->|Buffer de Áudio| API[📡 API Gateway]
        Avatar[🕺 Avatar 3D / R3F] -->|Visual + Áudio| User
    end

    subgraph "⚙️ Backend (Node.js)"
        API -->|POST /sts| Router[Express Router]
        
        subgraph "🧠 Camada de Inteligência (Cloud + Fallback)"
            Router -->|WAV| STT[👂 Whisper Service]
            STT -->|Texto| Brain[🧠 LLM Service]
            
            %% Lógica de Fallback
            STT -.->|Principal (Rápido)| GroqW[⚡ Groq Whisper-v3]
            STT -.->|Backup (Seguro)| OpenAIW[🛡️ OpenAI Whisper-1]
            
            Brain -.->|Principal (Guia Local)| GroqL[⚡ Groq Llama 3.3]
            Brain -.->|Backup (Reserva)| OpenAIL[🛡️ OpenAI GPT-4o]
        end

        subgraph "⚡ Processamento Local (Zero Latência)"
            Brain -->|JSON Resposta| TTS[🗣️ Kokoro TTS (Docker)]
            TTS -->|WAV| LipSync[👄 Rhubarb Lip Sync]
            LipSync -->|Visemas + Áudio| Router
        end
    end

    Router -->|Pacote Final (Áudio + Lipsync)| Avatar

    %% Aplicação de Classes
    class User,Mic,API,Avatar frontend;
    class Router backend;
    class STT,Brain,GroqW,OpenAIW,GroqL,OpenAIL ai;
    class TTS,LipSync local;



````
## 🧩 Componentes da Arquitetura

### 🖥️ Frontend (Totem)

- Responsável pela **detecção de voz (VAD)**, ignorando ruídos ambientes
- **Renderização do Avatar 3D** com **React Three Fiber**
- **Reprodução de áudio, visemas e animações** em tempo real

---

### 🧠 Camada de Inteligência (Nuvem com Fallback)

- Utiliza **Groq (LPU)** como provedor principal:
  - Inferência **ultra-rápida**
  - **Custo zero** na camada principal

- **Fallback Automático**:
  - Em falhas ou limites da Groq, redireciona para **OpenAI**
  - Garante que o totem **nunca fique “mudo”**

---

### ⚡ Processamento Local (Edge)

- **Kokoro TTS (Docker)**
  - Síntese de voz executada no próprio **mini-PC do totem**
  - Elimina a latência de download de áudio da internet

- **Rhubarb Lip Sync**
  - Geração de **visemas em tempo real**
  - **Sincronia labial** baseada no áudio sintetizado

---

Essa arquitetura permite uma experiência **fluida**, **resiliente** e **escalável**, ideal para **ambientes públicos** com alto fluxo de usuários.

-----

## 🚀 Tecnologias e Stack

### 🎨 Frontend (Interface)

- **React + Vite** — Base da aplicação
- **React Three Fiber (R3F)** — Renderização do Avatar 3D
- **Voice Activity Detection (VAD)**
  - Hook customizado (`useSpeech`)
  - Detecção baseada em decibéis
  - Threshold adaptativo para ruído ambiente

---

### 🖥️ Backend (Processamento)

- **Node.js + Express**
- **Kokoro TTS (Docker)**
  - Sintetizador neural local ultra-rápido
  - Voz: `pm_alex` (PT-BR)
- **Rhubarb Lip Sync**
  - Geração de visemas a partir de áudio WAV

---

### ☁️ Inteligência Artificial (Nuvem)

O projeto utiliza **fallback automático** para garantir alta disponibilidade.

#### 🎧 Ouvido — STT (Speech to Text)

- **Principal:** Groq — Whisper-large-v3 (gratuito e rápido)
- **Backup:** OpenAI — Whisper-1 (ativado apenas em falha)

#### 🧠 Cérebro — LLM

- **Principal:** Groq — Llama 3.3 (70B)
- **Backup:** OpenAI — GPT-4o-mini (erros 429/500)

---

## ⚙️ Fluxo de Dados (Passo a Passo)

### 1. Escuta Inteligente
- O frontend monitora o microfone
- Volume acima de **45 dB** inicia a gravação
- **2s de silêncio** encerram e enviam o áudio

### 2. Transcrição
- Áudio enviado ao backend em memória (`Buffer`)
- STT via **Groq Whisper**

### 3. Raciocínio
- Texto enviado ao LLM com *System Prompt* de  
  **“Guia Turístico Paraense”**
- Retorno em **JSON estrito**:
  - Texto da resposta
  - Expressão facial
  - Animação corporal

### 4. Síntese de Voz
- Texto enviado ao **Kokoro TTS (local)**
- Geração de arquivo `.wav`

### 5. Sincronia Labial
- **Rhubarb** analisa o `.wav`
- Gera `.json` com tempos de visemas

### 6. Resposta ao Frontend
- Áudio (Base64)
- Visemas (JSON)
- Metadados de animação

### 7. Execução
- Avatar reproduz o áudio
- Sincroniza a boca
- Executa animações (ex: sorrir, acenar)

---

## 🛠️ Configuração de Ambiente

Crie um arquivo `.env` na raiz do **backend**:

```env
# Inteligência Principal (Grátis)
GROQ_API_KEY=gsk_...

# Inteligência de Reserva (Paga)
OPENAI_API_KEY=sk-proj-...

# URL do TTS Local (Docker)
KOKORO_API_URL=http://localhost:8880/v1/audio/speech
```
---

## 📦 Requisitos de Instalação

- **Docker Desktop** — necessário para o Kokoro TTS
- **Node.js v18+**
- **FFmpeg** instalado no sistema  
  *(opcional, mas recomendado para processamento de áudio)*

---

## 🧭 Visão Geral

Jack foi projetado para ser:

- 🤖 **Inteligente**
- ⚡ **Rápido**
- 🗣️ **Natural**
- 🏛️ **Culturalmente contextualizado**

Ideal para **totens turísticos**, **museus**, **centros culturais** e **experiências interativas públicas**.
