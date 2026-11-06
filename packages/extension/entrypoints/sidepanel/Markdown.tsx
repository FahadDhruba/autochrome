import { Fragment, useState, type ReactNode } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { parseInline, parseMarkdown, type Block, type Inline } from './markdown';
import { download, toCsv, toJson } from './tableExport';

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
      case 'table':
        return <DataTable key={index} header={block.header} rows={block.rows} />;
    }
  });
}

/** A table with its data one click away: copy as CSV, or download CSV or JSON. */
function DataTable({ header, rows }: { header: string[]; rows: string[][] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-table">
      <div className="md-table-scroll">
        <table>
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{renderInline(parseInline(cell))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {header.map((_, c) => (
                  <td key={c}>{renderInline(parseInline(row[c] ?? ''))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md-table-actions">
        <span className="muted">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="link with-icon"
          onClick={() =>
            void navigator.clipboard?.writeText(toCsv(header, rows)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="link with-icon"
          onClick={() => download('table.csv', 'text/csv', toCsv(header, rows))}
        >
          <Download size={13} aria-hidden="true" />
          CSV
        </button>
        <button
          type="button"
          className="link with-icon"
          onClick={() => download('table.json', 'application/json', toJson(header, rows))}
        >
          <Download size={13} aria-hidden="true" />
          JSON
        </button>
      </div>
    </div>
  );
}

export default function Markdown({ text }: { text: string }) {
  return <div className="md">{renderBlocks(parseMarkdown(text))}</div>;
}
