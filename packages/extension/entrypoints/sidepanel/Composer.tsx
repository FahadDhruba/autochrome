import { type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Send, Square } from 'lucide-react';

type Props = {
  text: string;
  onTextChange: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Sits at the start of the row under the text box, e.g. the model chip. */
  tools?: ReactNode;
};

export default function Composer({
  text,
  onTextChange,
  inputRef,
  running,
  onSend,
  onStop,
  tools,
}: Props) {
  const empty = !text.trim();

  const submit = () => {
    if (running) return;
    // An empty Send keeps its look but does nothing, except point at the box to type in.
    if (empty) return inputRef.current?.focus();
    onSend(text.trim());
    onTextChange('');
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
        ref={inputRef}
        value={text}
        rows={2}
        placeholder="Ask autochrome to do something in your browser"
        aria-label="Message"
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-row">
        <div className="composer-tools">{tools}</div>
        {running ? (
          <button type="button" className="btn-stop with-icon" onClick={onStop}>
            <Square size={14} fill="currentColor" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button type="submit" className="btn-send with-icon" aria-disabled={empty}>
            <Send size={14} aria-hidden="true" />
            Send
          </button>
        )}
      </div>
    </form>
  );
}
