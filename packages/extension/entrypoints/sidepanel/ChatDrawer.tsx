import { useEffect, useState } from 'react';
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
        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
      {chats?.length === 0 && <p className="muted">No chats yet.</p>}
      <ul>
        {chats?.map((chat) => (
          <li key={chat.id} className={chat.id === activeId ? 'active' : undefined}>
            <button className="chat-item" onClick={() => onOpen(chat.id)}>
              {chat.title}
            </button>
            <button
              className="link"
              aria-label={`Delete chat ${chat.title}`}
              onClick={() => void remove(chat.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
