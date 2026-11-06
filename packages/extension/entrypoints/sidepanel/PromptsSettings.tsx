import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { promptName, savePrompts, type SavedPrompt } from '@/src/prompts';
import IconButton from '@/src/ui/IconButton';
import { usePrompts } from './usePrompts';

/** Saved prompts: type "/" and the name in the message box to use one. */
export default function PromptsSettings() {
  const saved = usePrompts();
  // Unsaved edits; until the first edit the saved list is shown as it is.
  const [edited, setEdited] = useState<SavedPrompt[]>();
  const [justSaved, setJustSaved] = useState(false);
  const drafts = edited ?? saved;
  const setDrafts = (update: (current: SavedPrompt[]) => SavedPrompt[]) => {
    setEdited(update(drafts));
    setJustSaved(false);
  };

  const change = (id: string, patch: Partial<SavedPrompt>) =>
    setDrafts((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const save = async () => {
    const clean = drafts
      .map((p) => ({ ...p, name: promptName(p.name), text: p.text.trim() }))
      .filter((p) => p.name && p.text);
    await savePrompts(clean);
    setEdited(undefined);
    setJustSaved(true);
  };

  return (
    <section aria-label="Prompt settings" id="settings-sec-prompts">
      <h2>Prompts</h2>
      <p className="muted">Type / and a name in the message box to use one.</p>
      <ul className="prompt-list">
        {drafts.map((prompt) => (
          <li key={prompt.id} className="prompt-row">
            <div className="prompt-head">
              <label className="prompt-name">
                <span aria-hidden="true">/</span>
                <input
                  aria-label="Prompt name"
                  value={prompt.name}
                  spellCheck={false}
                  onChange={(e) => change(prompt.id, { name: e.target.value })}
                />
              </label>
              <IconButton
                label={`Delete /${prompt.name}`}
                icon={Trash2}
                size={15}
                tone="danger"
                align="end"
                onClick={() => setDrafts((current) => current.filter((p) => p.id !== prompt.id))}
              />
            </div>
            <textarea
              aria-label="Prompt text"
              rows={2}
              value={prompt.text}
              onChange={(e) => change(prompt.id, { text: e.target.value })}
            />
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button
          type="button"
          className="secondary with-icon"
          onClick={() =>
            setDrafts((current) => [...current, { id: crypto.randomUUID(), name: '', text: '' }])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add prompt
        </button>
        <button type="button" onClick={() => void save()}>
          {justSaved ? 'Saved' : 'Save prompts'}
        </button>
      </div>
    </section>
  );
}
