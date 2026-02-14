import { useState } from "react";
import { useSpeech } from "../hooks/useSpeech";
import { useCMSConfig } from "../hooks/useCMSConfig";

// 🆕 Fallback de ações rápidas (usado quando CMS offline)
const FALLBACK_ACTIONS = [
  { label: "Alimentação", icon: "🍔", prompt: "O que tem para comer e beber aqui?", color: "from-orange-400 to-red-400" },
  { label: "Atrações", icon: "📸", prompt: "Quais são as principais atrações do local?", color: "from-green-400 to-emerald-400" },
  { label: "Informações", icon: "ℹ️", prompt: "Me conte sobre o local", color: "from-teal-400 to-cyan-400" },
  { label: "Eventos", icon: "🎭", prompt: "Quais eventos estão acontecendo hoje?", color: "from-rose-400 to-pink-400" },
];

export const ChatInterface = () => {
  const { sendMessage, loading } = useSpeech();
  // 🆕 Busca configuração dinâmica do CMS
  const { ui, isOffline } = useCMSConfig();
  
  const [activeButton, setActiveButton] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 🆕 Usa ações do CMS ou fallback
  const quickActions = (ui?.quick_actions?.length > 0) ? ui.quick_actions : FALLBACK_ACTIONS;

  const handleQuickAction = (action, index) => {
    setActiveButton(index);
    // 🆕 Suporta tanto 'prompt' (novo) quanto 'question' (legado)
    sendMessage(action.prompt || action.question);
    setIsDropdownOpen(false);
    setTimeout(() => setActiveButton(null), 2000);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <>
      {/* Header Dinâmico - Configurado via CMS */}
      <div className="chat-header">
        <div className="avatar-indicator">
          <div className="pulse-dot"></div>
          {/* 🆕 Título vem do CMS */}
          <span className="avatar-name"> {ui?.title || 'Assistente Virtual'}</span>
        </div>
        <div className="location-tag">
          <span className="location-icon">📍</span>
          {/* 🆕 Subtítulo/localização vem do CMS */}
          <span>{ui?.subtitle || 'Totem Interativo'}</span>
        </div>
      </div>

      {/* Botão Principal de Menu Suspenso */}
      <div className="dropdown-container">
        <button 
          className={`dropdown-toggle ${isDropdownOpen ? 'open' : ''} ${loading ? 'loading' : ''}`}
          onClick={toggleDropdown}
          disabled={loading}
        >
          <span className="toggle-icon">💬</span>
          {/* 🆕 CTA vem do CMS */}
          <span className="toggle-text">{ui?.cta_text || 'Como posso ajudar?'}</span>
          <span className={`toggle-arrow ${isDropdownOpen ? 'rotate' : ''}`}>▼</span>
        </button>

        {/* Menu Dropdown - Gerado Dinamicamente */}
        {isDropdownOpen && (
          <div className="dropdown-menu">
            <div className="dropdown-header">
              {/* 🆕 Títulos do menu vêm do CMS */}
              <h3 className="dropdown-title">{ui?.menu_title || 'Escolha uma opção'}</h3>
              <p className="dropdown-subtitle">{ui?.menu_subtitle || 'Respostas rápidas disponíveis'}</p>
            </div>
            
            <div className="dropdown-items">
              {/* 🆕 Mapeia ações dinâmicas do CMS */}
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  className={`dropdown-item ${activeButton === index ? 'active' : ''}`}
                  onClick={() => handleQuickAction(action, index)}
                  disabled={loading}
                >
                  <span className={`item-gradient bg-gradient-to-r ${action.color || 'from-blue-400 to-indigo-400'}`}></span>
                  {/* 🆕 Suporta 'icon' (novo) ou 'emoji' (legado) */}
                  <span className="item-emoji">{action.icon || action.emoji}</span>
                  <div className="item-content">
                    <span className="item-label">{action.label}</span>
                    {/* 🆕 Mostra prompt/question se existir */}
                    {(action.prompt || action.question) && (
                      <span className="item-question">{action.prompt || action.question}</span>
                    )}
                  </div>
                  <span className="item-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};