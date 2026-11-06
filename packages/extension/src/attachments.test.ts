import { describe, expect, it } from 'vitest';
import { attachmentNote, splitAttachmentNote } from './attachments';

describe('attachment notes', () => {
  it('round-trips the file names through the note added to a message', () => {
    const note = attachmentNote([
      { id: 'a1b2c3', name: 'cv, final.pdf', size: 2048 },
      { id: 'd4e5f6', name: 'photo.png', size: 10 },
    ]);
    expect(note).toBe(
      'Attached files, for upload_file: cv, final.pdf (id a1b2c3, 2 KB), photo.png (id d4e5f6, 1 KB)',
    );
    expect(splitAttachmentNote(`Upload these\n\n${note}`)).toEqual({
      text: 'Upload these',
      files: ['cv, final.pdf', 'photo.png'],
    });
    expect(splitAttachmentNote('Just text')).toEqual({ text: 'Just text', files: [] });
  });
});
