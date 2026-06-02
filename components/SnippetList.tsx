import React from 'react';
import { Trash2, Copy, Check, Download } from 'lucide-react';

export interface Snippet {
  id: string;
  name: string;
  sql: string;
  timestamp: number;
}

interface SnippetListProps {
  snippets: Snippet[];
  onLoadSql: (sql: string) => void;
  onDelete: (id: string) => void;
}

export const SnippetList: React.FC<SnippetListProps> = ({ snippets, onLoadSql, onDelete }) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex gap-2 overflow-x-auto p-2">
      {snippets.map(snippet => (
        <div key={snippet.id} className="flex-shrink-0 bg-martian-bg border border-martian-border rounded-lg p-2 min-w-[150px] max-w-[200px] flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-martian-text truncate">{snippet.name}</span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => copyToClipboard(snippet.sql, snippet.id)}
                    className="p-1 hover:bg-martian-surface rounded text-martian-muted hover:text-white"
                >
                    {copiedId === snippet.id ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                </button>
                <button
                    onClick={() => onDelete(snippet.id)}
                    className="p-1 hover:bg-status-error/20 rounded text-martian-muted hover:text-status-error"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
          </div>
          <button 
              onClick={() => onLoadSql(snippet.sql)}
              className="w-full bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text py-1 rounded text-[10px] font-medium transition-colors"
          >
              Load
          </button>
        </div>
      ))}
    </div>
  );
};
