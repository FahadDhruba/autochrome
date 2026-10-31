import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from './markdown';

// Everything is built as React elements (text is escaped by React); no HTML strings are ever used.

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'br':
        return <br key={index} />;
      case 'code':
        return <code key={index}>{node.text}</code>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'link':
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'paragraph':
        return <p key={index}>{renderInline(block.children)}</p>;
      case 'heading':
        return (
          <p key={index} className={`md-heading md-h${block.level}`}>
            {renderInline(block.children)}
          </p>
        );
      case 'code':
        return (
          <pre key={index}>
            <code>{block.text}</code>
          </pre>
        );
      case 'quote':
        return <blockquote key={index}>{renderBlocks(block.children)}</blockquote>;
      case 'list': {
        const items = block.items.map((item, i) => <li key={i}>{renderBlocks(item)}</li>);
        return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
      }
    }
  });
}

export default function Markdown({ text }: { text: string }) {
  return <div className="md">{renderBlocks(parseMarkdown(text))}</div>;
}
