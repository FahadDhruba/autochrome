import { useState, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

type Props = { running: boolean; onSend: (text: string) => void; onStop: () => void };

export default function Composer({ running, onSend, onStop }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        value={text}
        rows={2}
        placeholder="Ask autochrome to do something in your browser"
        aria-label="Message"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {running ? (
        <button type="button" className="danger with-icon" onClick={onStop}>
          <Square size={14} fill="currentColor" aria-hidden="true" />
          Stop
        </button>
      ) : (
        <button type="submit" className="with-icon" disabled={!text.trim()}>
          <Send size={14} aria-hidden="true" />
          Send
        </button>
      )}
    </form>
  );
}
