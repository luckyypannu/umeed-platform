'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, X, Bot, User as UserIcon } from 'lucide-react'
import { CHAT_PROMPTS } from '../lib/chat-prompts'
import { useTranslation } from '../lib/useTranslation'
import { api } from '../lib/api'
import { ChatMessage } from '../lib/types'

const promptKeys: Record<string, string> = {
  'How do I submit a request?': 'chat.prompt.request',
  'How can I track my request?': 'chat.prompt.track',
  'How can I become a volunteer?': 'chat.prompt.volunteer',
  'What is emergency assistance?': 'chat.prompt.emergency',
}

export default function ChatPage({ onClose }: { onClose?: () => void }) {
  const { t, lang } = useTranslation()
  const [messages, setMessages] = useState<{ text: string; time: string; isUser: boolean }[]>([
    { text: t('chat.ruleBasedWelcome'), time: t('time.now'), isUser: false },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const questions = CHAT_PROMPTS

  // Fetch persisted history on load
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await api.getChatHistory()
        if (history && history.length > 0) {
          setMessages(
            history.map((m: ChatMessage) => ({
              text: m.text,
              time: new Date(m.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isUser: m.sender === 'user',
            })),
          )
        }
      } catch {
        setChatError('Chat history could not be loaded. Please try again.')
      }
    }
    loadHistory()
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text = input, displayText = text) => {
    const cleanText = (text || '').trim()
    if (!cleanText || loading) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Optimistic user message
    setMessages((current) => [
      ...current,
      { text: displayText, time: now, isUser: true },
    ])
    setInput('')
    setLoading(true)
    setChatError('')

    try {
      const res = await api.sendChatMessage(cleanText)
      const replyTime = new Date(res.assistantMessage.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })

      setMessages((current) => [
        ...current,
        { text: res.assistantMessage.text, time: replyTime, isUser: false },
      ])
    } catch {
      setMessages((current) => current.filter((message) =>
        !(message.isUser && message.time === now && message.text === displayText),
      ))
      setChatError('Your message was not saved. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="chat-page">
      <div className="chat-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot style={{ color: '#135b3a', width: '24px', height: '24px' }} />
          <div>
            <span className="eyebrow" style={{ margin: 0, fontSize: '10px' }}>
              UMEED COMMUNITY ASSISTANT
            </span>
            <h1 style={{ fontSize: '24px', margin: 0 }}>{t('chat.title')}</h1>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label={t('button.close')}>
            <X />
          </button>
        )}
      </div>

      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#166534',
          margin: '12px 0',
        }}
      >
        This is a rule-based assistant, not a human or AI-powered service. Chat messages are saved for up to 24 hours in this browser session.
      </div>

      <div className="chat-history" aria-live="polite" aria-label={t('chat.title')}>
        {messages.map((message, index) => (
          <div
            className={message.isUser ? 'message user' : 'message'}
            key={`${message.text}-${index}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '8px',
              maxWidth: '80%',
              alignSelf: message.isUser ? 'flex-end' : 'flex-start',
            }}
          >
            <p style={{ margin: 0 }}>{message.text}</p>
            <small style={{ marginTop: '4px', alignSelf: 'flex-end', opacity: 0.7 }}>
              {message.time}
            </small>
          </div>
        ))}
        {loading && (
          <div className="message" style={{ color: '#888', fontStyle: 'italic' }}>
            UMEED assistant is replying...
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>
      {chatError && <p className="form-errors" role="alert">{chatError}</p>}

      <div className="suggestions">
        {questions.map((question) => (
          <button
            key={question}
            onClick={() => {
              const displayText = t(promptKeys[question]) || question
              sendMessage(question, displayText)
            }}
          >
            {t(promptKeys[question]) || question}
          </button>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage()
        }}
      >
        <label className="sr-only" htmlFor="chat-page-input">
          {t('chat.inputLabel')}
        </label>
        <input
          id="chat-page-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          disabled={loading}
        />
        <button className="btn" type="submit" disabled={loading || !input.trim()}>
          {t('button.send')} <Send style={{ width: '15px' }} />
        </button>
      </form>

      <button
        className="text-button"
        style={{ marginTop: '10px' }}
        onClick={async () => {
          try {
            await api.clearChatHistory()
            setMessages([{ text: t('chat.ruleBasedWelcome'), time: t('time.now'), isUser: false }])
            setChatError('')
          } catch {
            setChatError('Chat history could not be cleared. Please try again.')
          }
        }}
      >
        {t('button.clear')}
      </button>
    </main>
  )
}
