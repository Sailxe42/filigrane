'use client';
// AI Act Art. 50(1): tell users they are talking to an AI, at the latest at the first interaction.
import '@filigrane/ui';
import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();
  return (
    <main lang="fr">
      <ai-disclosure model="Mistral Large" href="/transparence" dismissible remember="chat" />
      {messages.map((m) => (
        <p key={m.id}>
          {m.role === 'assistant' && <ai-label compact />} {m.content}
        </p>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Votre question…" />
      </form>
    </main>
  );
}
