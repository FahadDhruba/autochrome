import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Trash2, X } from 'lucide-react';
import IconButton from '@/src/ui/IconButton';
import { deleteChat, listChats, type ChatSummary } from '@/src/history';

type Props = {
  activeId: string;
  revision: number;
  onOpen: (id: string) => void;
  onClose: () => void;
};

export default function ChatDrawer({ activeId, revision, onOpen, onClose }: Props) {
  const [chats, setChats] = useState<ChatSummary[]>();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Focus moves into the drawer while it is open and goes back to what opened it (the Chats
  // button) when it closes; Escape closes it.
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Keep Tab inside the drawer.
  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    void listChats().then(setChats);
  }, [revision]);

  const remove = async (id: string) => {
    await deleteChat(id);
    setChats(await listChats());
  };

  return (
    <div className="drawer-layer">
      <div className="drawer-backdrop" data-testid="drawer-backdrop" onClick={onClose} />
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Chat history"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="drawer-head">
          <strong>Chats</strong>
          <IconButton label="Close" icon={X} align="end" onClick={onClose} />
        </div>
        {chats?.length === 0 && <p className="muted">No chats yet.</p>}
        <ul>
          {chats?.map((chat) => (
            <li key={chat.id} className={chat.id === activeId ? 'active' : undefined}>
              <button className="chat-item" onClick={() => onOpen(chat.id)}>
                {chat.title}
              </button>
              <IconButton
                label={`Delete chat ${chat.title}`}
                icon={Trash2}
                tone="danger"
                align="end"
                onClick={() => void remove(chat.id)}
              />
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
