import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';
import ModelPicker from './ModelPicker';
import type { ProviderState } from './useProviderSettings';

type Props = {
  chat: ReturnType<typeof useChat>;
  providers: ProviderState;
  onOpenSettings: () => void;
};

export default function ChatView({ chat, providers, onOpenSettings }: Props) {
  const { target } = chat;
  if (providers.ready.length === 0 && chat.messages.length === 0) {
    return (
      <div className="empty" data-testid="empty-state">
        <h2>Set up a provider</h2>
        <p>
          autochrome needs an API key (Anthropic, OpenAI or Gemini) or an OpenAI-compatible server
          such as Ollama to run tasks in your browser.
        </p>
        <button onClick={onOpenSettings}>Open settings</button>
      </div>
    );
  }

  return (
    <>
      {chat.messages.length === 0 ? (
        <div className="empty">
          <h2>What should I do?</h2>
          <p>Describe a task. I will work in your tabs and show each step.</p>
        </div>
      ) : (
        <MessageList
          messages={chat.messages}
          running={chat.running}
          error={chat.error}
          usage={chat.usage}
        />
      )}
      {target && (
        <ModelPicker
          target={target}
          state={providers}
          disabled={chat.running}
          onChange={chat.changeTarget}
        />
      )}
      <Composer running={chat.running} onSend={chat.send} onStop={chat.stop} />
    </>
  );
}
