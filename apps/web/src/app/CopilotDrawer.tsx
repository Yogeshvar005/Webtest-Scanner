'use client';

import React, { useState, useRef, useEffect, Component, type ReactNode } from 'react';
import { 
  Bot, Send, Sparkles, X, Play,
  Cpu, Globe
} from 'lucide-react';
import type { SiteReconData, AIProviderConfig, CopilotMessage, CopilotResponse } from '@wts/nlp';

interface CopilotErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface CopilotErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class CopilotErrorBoundary extends Component<CopilotErrorBoundaryProps, CopilotErrorBoundaryState> {
  constructor(props: CopilotErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CopilotErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Copilot caught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 440,
            maxWidth: 'calc(100vw - 48px)',
            background: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius, 16px)',
            boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.18))',
            padding: 24,
            zIndex: 9999,
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: 'var(--fail, #dc2626)' }}>
            AI QA Copilot encountered a display error
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'var(--accent, #D97757)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Reset Copilot
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  siteRecon: SiteReconData | null;
  targetUrl: string;
  aiConfig: AIProviderConfig;
  onRunSteps: (instructions: string) => void;
  onInsertSteps?: (instructions: string) => void;
}

export function CopilotDrawer({
  isOpen,
  onClose,
  siteRecon,
  targetUrl,
  aiConfig,
  onRunSteps,
  onInsertSteps,
}: CopilotDrawerProps) {
  const [messages, setMessages] = useState<Array<CopilotMessage & { steps?: CopilotResponse['actionableSteps'] }>>([
    {
      role: 'assistant',
      content: siteRecon
        ? `Hello! I'm your AI QA Copilot. I've analyzed **${siteRecon.title || siteRecon.domain}**. You can ask me to test any flow, interact with specific buttons, or verify edge-case boundaries on this website.`
        : `Hello! I'm your AI QA Copilot powered by your ${aiConfig?.provider === 'local' ? 'local Ollama model' : 'AI engine'}. Enter a website URL or tell me what you'd like to test!`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    'Analyze this site and suggest key flows to test',
    'Test search input with boundary inputs',
    'Verify all visible buttons respond to clicks',
    'Check sign-in or booking validation error prompts',
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setInput('');
    const newMessages: CopilotMessage[] = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: query }];
    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    setLoading(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          siteContext: siteRecon || (targetUrl ? { url: targetUrl, domain: targetUrl, title: targetUrl, headings: [], interactiveElements: [], forms: [] } : undefined),
          aiConfig,
        }),
      });

      if (!res.ok) {
        let errJson;
        try { errJson = await res.json(); } catch {}
        throw new Error(errJson?.detail || errJson?.error || 'Copilot response error');
      }
      const data: CopilotResponse = await res.json();

      const safeReply = typeof data?.reply === 'string'
        ? data.reply
        : (typeof data?.reply === 'object' && data?.reply !== null
            ? JSON.stringify(data.reply)
            : 'Analysis complete.');

      const safeSteps = Array.isArray(data?.actionableSteps) ? data.actionableSteps : [];

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: safeReply,
          steps: safeSteps,
        },
      ]);

      if (Array.isArray(data?.suggestedFollowUps) && data.suggestedFollowUps.length > 0) {
        setSuggestedPrompts(data.suggestedFollowUps.map(String).filter(Boolean));
      }
    } catch (err) {
      console.warn('Copilot failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue processing your request with the AI engine. Please verify the local Ollama service is reachable.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const convertStepsToDSLText = (steps: NonNullable<CopilotResponse['actionableSteps']>): string => {
    if (!Array.isArray(steps)) return '';
    return steps
      .map((s) => {
        if (!s) return '';
        const action = (s.action || s) as any;
        const type = action?.type || 'navigate';
        if (type === 'navigate') return `go to ${action.path || action.url || '/'}`;
        if (type === 'click') return `click "${action.targetName || action.target || 'button'}"`;
        if (type === 'fill') return `fill "${action.targetName || action.target || 'input'}" with "${action.value || ''}"`;
        if (type === 'clickAll') return `click all buttons`;
        if (type === 'explore') return `explore the site`;
        return `take a screenshot`;
      })
      .filter(Boolean)
      .join('\n');
  };

  if (!isOpen) return null;

  return (
    <CopilotErrorBoundary onReset={onClose}>
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 440,
          height: 640,
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 16px)',
        boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.18))',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-hover, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #D97757, #E58E73)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              AI QA Copilot
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 12,
                  background: aiConfig?.provider === 'local' ? 'var(--pass-bg)' : 'var(--warn-bg)',
                  color: aiConfig?.provider === 'local' ? 'var(--pass)' : 'var(--warn)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Cpu size={10} />
                {aiConfig?.provider === 'local' ? `Local: ${aiConfig?.model || 'llama3.2'}` : 'Gemini'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {siteRecon ? `Inspecting: ${siteRecon.domain}` : 'Direct browser automation & test generation'}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 8,
            color: 'var(--text-secondary)',
          }}
          title="Close Copilot"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                background: m.role === 'user' ? 'var(--accent, #D97757)' : 'var(--bg-hover, #f1f5f9)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                fontSize: 13,
                lineHeight: 1.45,
                wordBreak: 'break-word',
              }}
            >
              {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
            </div>

            {/* If the assistant emitted executable steps */}
            {Array.isArray(m.steps) && m.steps.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  background: 'var(--bg-surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} color="#D97757" />
                  Generated Test Actions ({m.steps.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {m.steps.map((step, sIdx) => {
                    const intentText = typeof step === 'string'
                      ? step
                      : (step?.intent || (step as any)?.action?.type || `Action ${sIdx + 1}`);
                    return (
                      <div key={sIdx} style={{ color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{sIdx + 1}.</span> {String(intentText)}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => onRunSteps(convertStepsToDSLText(m.steps!))}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 6,
                      background: 'var(--accent, #D97757)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Play size={13} fill="#fff" />
                    Run in Browser
                  </button>
                  {onInsertSteps && (
                    <button
                      onClick={() => onInsertSteps(convertStepsToDSLText(m.steps!))}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        background: 'var(--bg-hover, #f1f5f9)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                      title="Insert these steps into your scenario editor"
                    >
                      📝 Insert
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            <span className="spinner" style={{ width: 12, height: 12 }} />
            {aiConfig?.provider === 'local' ? 'Local LLM thinking...' : 'Gemini thinking...'}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface, #fff)',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {suggestedPrompts.slice(0, 3).map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSend(prompt)}
            disabled={loading}
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: 'var(--bg-hover, #f1f5f9)',
              border: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-hover, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Tell me what to test on this website..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface, #fff)',
            fontSize: 13,
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--accent, #D97757)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loading || !input.trim() ? 0.6 : 1,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
    </CopilotErrorBoundary>
  );
}
