import { useState } from "react";
import { useSpeech } from "../hooks/useSpeech";

const quickActions = [
  { 
    emoji: "🍔", 
    label: "Alimentação", 
    question: "O que tem para comer e beber aqui?",
    color: "from-orange-400 to-red-400"
  },

  { 
    emoji: "📸", 
    label: "Atrações", 
    question: "Quais são as principais atrações do local?",
    color: "from-green-400 to-emerald-400"
  },

  { 
    emoji: "ℹ️", 
    label: "Informações", 
    question: "Me conte sobre o Porto Futuro",
    color: "from-teal-400 to-cyan-400"
  },
  
  { 
    emoji: "🎭", 
    label: "Eventos", 
    question: "Quais eventos estão acontecendo hoje?",
    color: "from-rose-400 to-pink-400"
  },
];

export const ChatInterface = () => {
  const { sendMessage, loading } = useSpeech();
  const [activeButton, setActiveButton] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleQuickAction = (action, index) => {
    setActiveButton(index);
    sendMessage(action.question);
    setIsDropdownOpen(false);
    setTimeout(() => setActiveButton(null), 2000);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <>
      {/* Header Flutuante */}
      <div className="chat-header">
        <div className="avatar-indicator">
          <div className="pulse-dot"></div>
          <span className="avatar-name"> Assistente Virtual</span>
        </div>
        <div className="location-tag">
          <span className="location-icon">📍</span>
          <span>Porto Futuro 2 - Belém</span>
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
          <span className="toggle-text">Como posso ajudar?</span>
          <span className={`toggle-arrow ${isDropdownOpen ? 'rotate' : ''}`}>▼</span>
        </button>

        {/* Menu Dropdown */}
        {isDropdownOpen && (
          <div className="dropdown-menu">
            <div className="dropdown-header">
              <h3 className="dropdown-title">Escolha uma opção</h3>
              <p className="dropdown-subtitle">Respostas rápidas disponíveis</p>
            </div>
            
            <div className="dropdown-items">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  className={`dropdown-item ${activeButton === index ? 'active' : ''}`}
                  onClick={() => handleQuickAction(action, index)}
                  disabled={loading}
                >
                  <span className={`item-gradient bg-gradient-to-r ${action.color}`}></span>
                  <span className="item-emoji">{action.emoji}</span>
                  <div className="item-content">
                    <span className="item-label">{action.label}</span>
                    <span className="item-question">{action.question}</span>
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