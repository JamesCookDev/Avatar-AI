import React, { useState } from 'react';

/**
 * InlineChatInterface — Kiosk Premium UI
 * Mantém toda a lógica de estado e handlers idênticos.
 * Visual redesenhado com glassmorphism + kiosk scale.
 */
export function ChatInterface(p) {
  const [dropOpen, setDropOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  const items = Array.isArray(p.items) ? p.items : [];
  const blur = p.blur ?? 20;
  const opacity = p.opacity ?? 1;

  const headerShow = p.headerShow !== false;

  const handleAction = (node) => {
    const msg = node.prompt || node.message || node.label || '';
    if (msg && window.__totemSendMessage) window.__totemSendMessage(msg);
    if (p.closeOnSelect !== false) { setDropOpen(false); setActiveSubmenu(null); }
  };

  const renderNode = (node, depth = 0) => {
    const isFolder = node.type === 'folder' || (node.children && node.children.length > 0);
    const isOpen = activeSubmenu === node.id || String(activeSubmenu || '').startsWith(`${node.id}-`);
    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <button
          className="kiosk-menu-item"
          onClick={isFolder ? () => setActiveSubmenu(isOpen ? null : node.id) : () => handleAction(node)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: depth === 0 ? '16px 20px' : '12px 16px',
            background: isFolder && isOpen ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
            borderRadius: 16, marginBottom: 6, width: '100%',
            border: `1px solid ${isFolder && isOpen ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
            color: '#fff', outline: 'none'
          }}
        >
          {/* Icon pill */}
          <span style={{ fontSize: '24px' }}>{node.icon}</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
            <span style={{ fontSize: '18px', fontWeight: '600' }}>{node.label}</span>
            {node.description && (
              <span style={{ fontSize: '14px', opacity: 0.7 }}>{node.description}</span>
            )}
          </div>
          
          {isFolder ? (
            <span style={{ fontSize: '20px', opacity: 0.5 }}>{p.folderArrowSymbol || '▾'}</span>
          ) : (
            <span style={{ fontSize: '20px', opacity: 0.5 }}>{p.itemArrowSymbol || '→'}</span>
          )}
        </button>
        
        {isFolder && isOpen && (
          <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
            {(node.children || []).map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '700px', margin: '0 auto' }}>

      {/* ── Menu dropdown (abre acima do card) ── */}
      {dropOpen && (
        <div className="kiosk-menu-panel" style={{
          width: '100%', marginBottom: '16px', padding: '24px',
          background: `rgba(15,23,42,${opacity * 0.95})`,
          backdropFilter: `blur(${blur + 10}px)`,
          borderRadius: 24, border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {/* Menu header */}
          <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>
            O que você precisa?
          </h3>
          
          {items.length === 0 ? (
            <p style={{ color: '#fff', opacity: 0.5, textAlign: 'center' }}>Nenhum item configurado</p>
          ) : (
            items.map(item => renderNode(item))
          )}
        </div>
      )}

      {/* ── Glass card principal ── */}
      <div className="kiosk-card" style={{
        width: '100%',
        background: `rgba(30,41,59,${opacity * 0.7})`,
        backdropFilter: `blur(${blur}px)`,
        borderRadius: 32, border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)', overflow: 'hidden'
      }}>
        {/* Header strip */}
        {headerShow && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 24px', background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Pulsing online dot */}
              <div style={{ position: 'relative', width: 12, height: 12 }}>
                <div style={{ position: 'absolute', inset: 0, background: p.headerIndicatorColor || '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                <div style={{ position: 'absolute', inset: 0, background: p.headerIndicatorColor || '#10b981', borderRadius: '50%' }} />
              </div>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
                {p.headerTitle || 'Assistente Virtual'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', opacity: 0.6, fontSize: '14px' }}>
              <span>{p.headerIcon || '📍'}</span>
              <span>{p.headerSubtitle || 'Online agora'}</span>
            </div>
          </div>
        )}

        {/* CTA area */}
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
          {/* Welcome text */}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              {p.ctaText || 'Olá, como posso ajudar?'}
            </h2>
            <p style={{ margin: 0, fontSize: 'clamp(16px, 2vw, 20px)', color: 'rgba(255,255,255,0.6)' }}>
              Toque para iniciar uma conversa
            </p>
          </div>

          {/* CTA pill button */}
          <div style={{ width: '100%', position: 'relative', marginTop: '10px' }}>
            {/* Glow ring behind button */}
            <div style={{
              position: 'absolute', inset: -4, borderRadius: 999,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
              filter: 'blur(20px)', opacity: 0.5, animation: 'pulse 3s infinite'
            }} />
            
            <button
              className="kiosk-cta-btn"
              onClick={() => setDropOpen(!dropOpen)}
              type="button"
              style={{
                position: 'relative', width: '100%',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
                color: '#fff', border: 'none', borderRadius: 999,
                padding: 'clamp(16px, 2.2vw, 22px) clamp(32px, 4vw, 48px)',
                fontSize: 'clamp(17px, 2vw, 22px)', fontWeight: 700,
                letterSpacing: '-0.01em', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                minHeight: 64,
              }}
            >
              <span style={{ fontSize: '1.2em' }}>{p.ctaIcon || '💬'}</span>
              {p.ctaButtonText || 'Iniciar Conversa'}
              <span style={{ opacity: 0.8, fontSize: '0.9em', marginLeft: '8px' }}>
                {dropOpen ? '���' : '▾'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;