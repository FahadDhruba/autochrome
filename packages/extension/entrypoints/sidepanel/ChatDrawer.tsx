import { useEffect, useState } from 'react';
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

  useEffect(() => {
    void listChats().then(setChats);
  }, [revision]);

  const remove = async (id: string) => {
    await deleteChat(id);
    setChats(await listChats());
  };

  return (
    <nav className="drawer" aria-label="Chat history">
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
    </nav>
  );
}
