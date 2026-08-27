import React from 'react';

interface CleanMarkdownViewProps {
  content: string;
  className?: string;
  stripCitations?: boolean;
}

/**
 * Parses inline formatting like **bold**, *italic*, `code` and converts them into React elements.
 */
function renderInlineContent(text: string, stripCitations: boolean = true): React.ReactNode[] {
  let processed = text;
  if (stripCitations) {
    // Strip citation numbers like [1], [2][5][6], [12]
    processed = processed.replace(/\[\d+\]/g, '');
  }

  // Tokenize bold (**...**), italic (*...*), and code (`...`)
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = processed.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-slate-700">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-indigo-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

export const CleanMarkdownView: React.FC<CleanMarkdownViewProps> = ({
  content,
  className = '',
  stripCitations = true,
}) => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let currentListItems: React.ReactNode[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (currentListItems.length > 0) {
      if (currentListType === 'ol') {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 space-y-1.5 pl-1">
            {currentListItems}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 space-y-1.5 pl-1">
            {currentListItems}
          </ul>
        );
      }
      currentListItems = [];
      currentListType = null;
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    // Heading 1: # Title
    if (/^#\s+(.+)$/.test(trimmed)) {
      flushList();
      const match = trimmed.match(/^#\s+(.+)$/);
      elements.push(
        <h3
          key={`h1-${idx}`}
          className="mt-4 mb-2 border-b border-indigo-100 pb-1.5 text-sm font-extrabold tracking-tight text-indigo-950"
        >
          {renderInlineContent(match?.[1] || '', stripCitations)}
        </h3>
      );
      return;
    }

    // Heading 2: ## Title or ## 1) Title
    if (/^##\s+(.+)$/.test(trimmed)) {
      flushList();
      const match = trimmed.match(/^##\s+(.+)$/);
      elements.push(
        <h4
          key={`h2-${idx}`}
          className="mt-3.5 mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-indigo-900"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
          {renderInlineContent(match?.[1] || '', stripCitations)}
        </h4>
      );
      return;
    }

    // Heading 3: ### Title
    if (/^###\s+(.+)$/.test(trimmed)) {
      flushList();
      const match = trimmed.match(/^###\s+(.+)$/);
      elements.push(
        <h5
          key={`h3-${idx}`}
          className="mt-3 mb-1 text-xs font-bold text-slate-800"
        >
          {renderInlineContent(match?.[1] || '', stripCitations)}
        </h5>
      );
      return;
    }

    // Unordered List: - item, * item, + item, • item
    const ulMatch = trimmed.match(/^[-*+•]\s+(.+)$/);
    if (ulMatch) {
      if (currentListType && currentListType !== 'ul') {
        flushList();
      }
      currentListType = 'ul';
      currentListItems.push(
        <li key={`li-${idx}`} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
          <div className="min-w-0 flex-1">
            {renderInlineContent(ulMatch[1], stripCitations)}
          </div>
        </li>
      );
      return;
    }

    // Ordered List: 1. item, 2. item, 1) item, 2) item
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      if (currentListType && currentListType !== 'ol') {
        flushList();
      }
      currentListType = 'ol';
      currentListItems.push(
        <li key={`oli-${idx}`} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
          <span className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 px-1 text-[10px] font-bold text-indigo-700">
            {olMatch[1]}
          </span>
          <div className="min-w-0 flex-1">
            {renderInlineContent(olMatch[2], stripCitations)}
          </div>
        </li>
      );
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="my-1.5 text-xs leading-relaxed text-slate-700">
        {renderInlineContent(trimmed, stripCitations)}
      </p>
    );
  });

  flushList();

  return (
    <div className={`clean-markdown-view space-y-1 ${className}`}>
      {elements}
    </div>
  );
};
