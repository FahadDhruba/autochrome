import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';

type Props = {
  chat: ReturnType<typeof useChat>;
  hasApiKey: boolean;
  onOpenSettings: () => void;
};

export default function ChatView({ chat, hasApiKey, onOpenSettings }: Props) {
  if (!hasApiKey && chat.messages.length === 0) {
    return (
      <div className="empty" data-testid="empty-state">
        <h2>Add your API key</h2>
        <p>autochrome needs an Anthropic API key to run tasks in your browser.</p>
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
      <Composer running={chat.running} onSend={chat.send} onStop={chat.stop} />
    </>
  );
}
