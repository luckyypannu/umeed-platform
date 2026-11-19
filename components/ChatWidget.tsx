'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Bot } from 'lucide-react'
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

export default function ChatWidget() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<{ text: string; time: string; isUser: boolean }[]>([
    { text: t('chat.ruleBasedWelcome'), time: t('time.now'), isUser: false },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const questions = CHAT_PROMPTS
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      api.getChatHistory().then((hist: ChatMessage[]) => {
        if (hist && hist.length > 0) {
          setMessages(
            hist.map((m: ChatMessage) => ({
              text: m.text,
              time: new Date(m.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isUser: m.sender === 'user',
            })),
          )
        }
      }).catch(() => setChatError('Chat history could not be loaded.'))
    }
  }, [open])

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const sendMessage = async (text = input, displayText = text) => {
    const clean = (text || '').trim()
    if (!clean || loading) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages((current) => [
      ...current,
      { text: displayText, time: now, isUser: true },
    ])
    setInput('')
    setLoading(true)
    setChatError('')

    try {
      const res = await api.sendChatMessage(clean)
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
    <>
      <button
        className="floating-chat"
        onClick={() => setOpen(!open)}
        aria-label={t('chat.open')}
        aria-expanded={open}
      >
        <MessageCircle />
        <span>{t('chat.title')}</span>
      </button>

      {open && (
        <section className="chat-widget" aria-label={t('chat.title')}>
          <header>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot style={{ width: '18px', height: '18px', color: '#135b3a' }} />
              <strong>{t('chat.title')}</strong>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t('button.close')}>
              <X />
            </button>
          </header>

          <div
            style={{
              background: '#e8f5ed',
              padding: '6px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#135b3a',
              marginBottom: '10px',
            }}
          >
            Rule-based assistant · Not AI-powered
          </div>

          <div
            className="chat-history"
            aria-live="polite"
            aria-label={t('chat.title')}
          >
            {messages.map((message, index) => (
              <div
                className={message.isUser ? 'message user' : 'message'}
                key={`${message.text}-${index}`}
              >
                <p>{message.text}</p>
                <small>{message.time}</small>
              </div>
            ))}
            {loading && (
              <div className="message" style={{ color: '#888', fontStyle: 'italic' }}>
                Typing response...
              </div>
            )}
            <div ref={bottomRef} />
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
            <label className="sr-only" htmlFor="chat-widget-input">
              {t('chat.inputLabel')}
            </label>
            <input
              id="chat-widget-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              disabled={loading}
            />
            <button className="btn" type="submit" aria-label={t('button.send')} disabled={loading || !input.trim()}>
              <Send />
            </button>
          </form>

          <button
            className="text-button"
            style={{ marginTop: '8px' }}
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
        </section>
      )}
    </>
  )
}
