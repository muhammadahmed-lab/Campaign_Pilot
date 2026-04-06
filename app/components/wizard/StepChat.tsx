'use client';

import React, { useState, useRef, useEffect, DragEvent, ClipboardEvent } from 'react';
import type { ChatMessage } from '@/app/types';

interface StepChatProps {
  campaignId: string;
  chatMessages: ChatMessage[];
  setChatMessages: (msgs: ChatMessage[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepChat({
  campaignId,
  chatMessages,
  setChatMessages,
  onNext,
  onBack,
}: StepChatProps) {
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const aiMessageCount = chatMessages.filter((m) => m.role === 'assistant').length;
  const canProceed = aiMessageCount >= 1;
  const showGenerateButton = aiMessageCount >= 1;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, streamingMessage, isTyping]);

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const [isUploading, setIsUploading] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    for (const file of imageFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('campaignId', campaignId);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        setAttachedImages((prev) => [...prev, url]);
      } catch {
        // Fallback to base64 if upload fails
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setAttachedImages((prev) => [...prev, e.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    }
    setIsUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachedImages.length === 0) return;

    const newUserMsg: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
      images: attachedImages.length > 0 ? attachedImages : undefined,
      timestamp: Date.now(),
    };

    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    setInputText('');
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setIsTyping(true);
    setStreamingMessage('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, campaignId }),
      });

      if (!res.ok) throw new Error('Network response was not ok');

      setIsTyping(false);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          aiContent += chunk;
          setStreamingMessage(aiContent);
        }
      }

      setChatMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: aiContent,
          timestamp: Date.now(),
        },
      ]);
      setStreamingMessage('');
    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
      setStreamingMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const blocks = text.split('\n\n');
    return blocks.map((block, i) => {
      const parsedBold = block
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');

      if (block.startsWith('- ') || block.startsWith('* ')) {
        const items = block.split('\n').map((item) => item.replace(/^[-*]\s/, ''));
        return (
          <ul key={i} className="list-disc pl-5 mb-3 space-y-1">
            {items.map((item, j) => (
              <li
                key={j}
                dangerouslySetInnerHTML={{
                  __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                }}
              />
            ))}
          </ul>
        );
      }
      return (
        <p
          key={i}
          className="mb-3 last:mb-0 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parsedBold }}
        />
      );
    });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px] w-full bg-cp-black text-cp-light rounded-xl overflow-hidden border border-cp-border shadow-2xl">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-cp-dark border-b border-cp-border shrink-0">
        <button
          onClick={onBack}
          className="flex items-center text-sm font-medium text-cp-grey hover:text-white transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold font-heading text-white">Campaign Assistant</h2>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`flex items-center text-sm font-medium px-4 py-2 rounded-lg transition-all ${
            canProceed
              ? 'bg-white text-black hover:bg-cp-light shadow-lg'
              : 'bg-cp-border text-cp-grey cursor-not-allowed'
          }`}
        >
          Next Step
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-cp-grey space-y-6">
            <div className="w-16 h-16 bg-cp-charcoal rounded-full flex items-center justify-center border border-cp-border">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="text-center max-w-md space-y-3">
              <h3 className="text-white font-heading text-lg">Tell me about your email</h3>
              <p className="text-sm">Describe what you want to announce, update, or share. You can also upload screenshots.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {['Product launch', 'Weekly newsletter', 'Feature update', 'Event invite'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInputText(`I want to create an email about: ${suggestion}`);
                      textareaRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-xs bg-cp-charcoal border border-cp-border rounded-full text-cp-light hover:border-cp-muted hover:text-white transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {chatMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-cp-charcoal flex items-center justify-center shrink-0 border border-white/10">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            )}

            <div className={`max-w-[80%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`px-5 py-3.5 text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-white/80 text-black rounded-2xl rounded-br-md'
                    : 'bg-cp-border text-cp-light rounded-2xl rounded-bl-md border border-cp-muted/50'
                }`}
              >
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {msg.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt="attachment"
                        className="w-32 h-32 object-cover rounded-lg border border-white/10 shadow-sm"
                      />
                    ))}
                  </div>
                )}
                <div className="break-words chat-message-content">
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                </div>
              </div>
              <span className="text-[11px] text-cp-grey font-medium px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-cp-muted flex items-center justify-center shrink-0 border border-cp-muted">
                <span className="text-xs font-bold text-white">U</span>
              </div>
            )}
          </div>
        ))}

        {/* Streaming Message */}
        {streamingMessage && (
          <div className="flex items-end gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-cp-charcoal flex items-center justify-center shrink-0 border border-white/10">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="max-w-[80%] flex flex-col gap-2 items-start">
              <div className="px-5 py-3.5 text-sm shadow-sm bg-cp-border text-cp-light rounded-2xl rounded-bl-md border border-cp-muted/50">
                <div className="break-words chat-message-content">{renderMarkdown(streamingMessage)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Typing Indicator */}
        {isTyping && !streamingMessage && (
          <div className="flex items-end gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-cp-charcoal flex items-center justify-center shrink-0 border border-white/10">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="px-5 py-4 bg-cp-border rounded-2xl rounded-bl-md border border-cp-muted/50 flex gap-1.5 items-center h-11">
              <div className="w-1.5 h-1.5 bg-cp-grey rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-cp-grey rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-cp-grey rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Generate Template Banner */}
      {showGenerateButton && !isTyping && !streamingMessage && (
        <div className="bg-cp-charcoal border-t border-cp-border px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-cp-grey">
              Ready to create your email?
            </p>
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-5 py-2 bg-white text-black hover:bg-cp-light text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Generate Email Template
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-cp-dark border-t border-cp-border p-4 shrink-0">

        <div
          className={`flex flex-col bg-cp-black border rounded-2xl transition-colors ${
            isDragging ? 'border-white bg-white/5' : 'border-cp-muted focus-within:border-white/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {attachedImages.length > 0 && (
            <div className="flex gap-3 p-3 border-b border-cp-border overflow-x-auto">
              {attachedImages.map((img, idx) => (
                <div key={idx} className="relative group shrink-0">
                  <img
                    src={img}
                    alt="preview"
                    className="w-16 h-16 object-cover rounded-lg border border-cp-muted group-hover:opacity-50 transition-opacity"
                  />
                  <button
                    onClick={() => removeAttachedImage(idx)}
                    className="absolute -top-2 -right-2 bg-cp-border hover:bg-red-500 text-white rounded-full p-1 shadow-sm border border-cp-muted transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 p-2">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-cp-grey hover:text-white hover:bg-cp-border rounded-xl transition-colors shrink-0"
              title="Upload Screenshot"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Describe your email or paste a screenshot (Ctrl+V)..."
              className="flex-1 max-h-[150px] min-h-[44px] bg-transparent text-sm text-white placeholder-cp-grey resize-none outline-none py-3 px-2"
              rows={1}
            />

            <button
              onClick={handleSend}
              disabled={(!inputText.trim() && attachedImages.length === 0) || isTyping || isUploading}
              className="p-2.5 bg-white hover:bg-cp-light disabled:bg-cp-border disabled:text-cp-muted text-black rounded-xl transition-colors shrink-0"
              title="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
