import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { matchPrompts, type SavedPrompt } from '@/src/prompts';
import { Hand, Layers, Paperclip, Send, Square, X } from 'lucide-react';
import IconButton from '@/src/ui/IconButton';

type Props = {
  text: string;
  onTextChange: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Sits at the start of the row under the text box, e.g. the model chip. */
  tools?: ReactNode;
  /** Pauses the agent so the user can use the page; shown while a task runs. */
  onTakeOver?: () => void;
  paused?: boolean;
  /** Files and context attached to the next message, shown as chips. */
  files?: { id: string; name: string; kind?: 'file' | 'context' }[];
  onAttach?: (files: FileList) => void;
  onRemoveFile?: (id: string) => void;
  /** More buttons next to the paperclip, e.g. Add context. */
  addons?: ReactNode;
  /** Saved prompts, offered when the text starts with "/". */
  prompts?: SavedPrompt[];
};

export default function Composer({
  text,
  onTextChange,
  inputRef,
  running,
  onSend,
  onStop,
  tools,
  onTakeOver,
  paused = false,
  files = [],
  onAttach,
  onRemoveFile,
  addons,
  prompts = [],
}: Props) {
  const empty = !text.trim();
  const picker = useRef<HTMLInputElement>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const matches = dismissed === text ? undefined : matchPrompts(text, prompts);
  const showMatches = matches !== undefined && matches.length > 0;
  const active = Math.min(highlighted, (matches?.length ?? 1) - 1);

  const insertPrompt = (prompt: SavedPrompt) => {
    onTextChange(prompt.text);
    setHighlighted(0);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (running) return;
    // An empty Send keeps its look but does nothing, except point at the box to type in.
    if (empty) return inputRef.current?.focus();
    onSend(text.trim());
    onTextChange('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMatches) {
      const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (move) {
        event.preventDefault();
        setHighlighted((active + move + matches.length) % matches.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault();
        insertPrompt(matches[active]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(text);
        return;
      }
    }
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
      {files.length > 0 && (
        <ul className="file-chips" aria-label="Attached files and context">
          {files.map((file) => (
            <li key={file.id} className="file-chip">
              {file.kind === 'context' ? (
                <Layers size={12} aria-hidden="true" />
              ) : (
                <Paperclip size={12} aria-hidden="true" />
              )}
              <span>{file.name}</span>
              <button
                type="button"
                className="icon-link"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemoveFile?.(file.id)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showMatches && (
        <ul className="slash-menu" role="listbox" aria-label="Saved prompts">
          {matches.map((prompt, index) => (
            <li
              key={prompt.id}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                insertPrompt(prompt);
              }}
            >
              <span className="slash-name">/{prompt.name}</span>
              <span className="slash-text">{prompt.text}</span>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={inputRef}
        value={text}
        rows={2}
        // The keyboard shortcut opens the panel; typing should work right away.
        autoFocus
        placeholder="Ask autochrome to do something, or type / for saved prompts"
        aria-label="Message"
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-row">
        <div className="composer-tools">{tools}</div>
        {!running && addons}
        {onAttach && !running && (
          <>
            <IconButton
              label="Attach files"
              icon={Paperclip}
              size={16}
              align="end"
              onClick={() => picker.current?.click()}
            />
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="Files to attach"
              onChange={(event) => {
                if (event.target.files?.length) onAttach(event.target.files);
                event.target.value = '';
              }}
            />
          </>
        )}
        {running && onTakeOver && !paused && (
          <button type="button" className="secondary with-icon" onClick={onTakeOver}>
            <Hand size={14} aria-hidden="true" />
            Take over
          </button>
        )}
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
