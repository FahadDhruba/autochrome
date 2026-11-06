import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Hand, Paperclip, Send, Square, X } from 'lucide-react';
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
  /** Files attached to the next message. */
  files?: { id: string; name: string }[];
  onAttach?: (files: FileList) => void;
  onRemoveFile?: (id: string) => void;
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
}: Props) {
  const empty = !text.trim();
  const picker = useRef<HTMLInputElement>(null);

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
      {files.length > 0 && (
        <ul className="file-chips" aria-label="Attached files">
          {files.map((file) => (
            <li key={file.id} className="file-chip">
              <Paperclip size={12} aria-hidden="true" />
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
