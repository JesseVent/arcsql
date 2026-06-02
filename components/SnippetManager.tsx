import React, { useState, useEffect } from 'react';
import { X, Save, Play, Trash2, Code, Copy, Check, BookMarked, Download } from 'lucide-react';

interface Snippet {
  id: string;
  name: string;
  sql: string;
  timestamp: number;
}

interface SnippetManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSql: string;
  onLoadSql: (sql: string) => void;
}

export const SnippetManager: React.FC<SnippetManagerProps> = ({ isOpen, onClose, currentSql, onLoadSql }) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [newSnippetName, setNewSnippetName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('context7_snippets');
      if (saved) {
        try {
            setSnippets(JSON.parse(saved));
        } catch(e) {
            setSnippets([]);
        }
      }
    }
  }, [isOpen]);

  const saveSnippet = () => {
    if (!newSnippetName.trim() || !currentSql.trim()) return;
    
    const newSnippet: Snippet = {
      id: crypto.randomUUID(),
      name: newSnippetName.trim(),
      sql: currentSql,
      timestamp: Date.now()
    };

    const updated = [newSnippet, ...snippets];
    setSnippets(updated);
    localStorage.setItem('context7_snippets', JSON.stringify(updated));
    setNewSnippetName('');
  };

  const deleteSnippet = (id: string) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    localStorage.setItem('context7_snippets', JSON.stringify(updated));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
       <div className="w-full max-w-2xl bg-martian-surface border border-martian-border rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-martian-border">
            <div>
                <h2 className="text-xl font-bold text-martian-text flex items-center gap-2">
                    <BookMarked className="w-5 h-5 text-omop-magenta" />
                    SQL Snippet Manager
                </h2>
                <p className="text-xs text-martian-muted mt-1">Save your queries locally or load templates.</p>
            </div>
            <button onClick={onClose} className="text-martian-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
             {/* Save Section */}
             <div className="p-5 border-b border-martian-border bg-martian-bg/30">
                <label className="block text-xs font-medium text-martian-muted mb-2">Save Current SQL Editor Content</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={newSnippetName}
                        onChange={(e) => setNewSnippetName(e.target.value)}
                        placeholder="Snippet Name (e.g. 'Monthly Cohort Analysis')"
                        className="flex-1 bg-martian-bg border border-martian-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-omop-magenta"
                    />
                    <button 
                        onClick={saveSnippet}
                        disabled={!newSnippetName.trim() || !currentSql.trim()}
                        className="bg-omop-magenta hover:bg-omop-magenta/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Save
                    </button>
                </div>
             </div>

             {/* List */}
             <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {snippets.length === 0 ? (
                    <div className="text-center py-10 text-martian-muted opacity-60">
                        <Code className="w-10 h-10 mx-auto mb-2" />
                        <p>No saved snippets yet.</p>
                    </div>
                ) : (
                    snippets.map(snippet => (
                        <div key={snippet.id} className="bg-martian-bg border border-martian-border rounded-lg p-4 hover:border-martian-primary/40 transition-colors group">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-bold text-sm text-martian-text">{snippet.name}</h3>
                                    <div className="text-[10px] text-martian-muted mt-0.5">
                                        {new Date(snippet.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => copyToClipboard(snippet.sql, snippet.id)}
                                        className="p-1.5 hover:bg-martian-surface rounded text-martian-muted hover:text-white"
                                        title="Copy to Clipboard"
                                    >
                                        {copiedId === snippet.id ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={() => deleteSnippet(snippet.id)}
                                        className="p-1.5 hover:bg-status-error/20 rounded text-martian-muted hover:text-status-error"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="bg-black/30 rounded border border-martian-border/50 p-2 mb-3 max-h-20 overflow-hidden relative">
                                <pre className="text-[10px] font-mono text-martian-muted/80">{snippet.sql.slice(0, 150)}{snippet.sql.length > 150 ? '...' : ''}</pre>
                                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/20 to-transparent"></div>
                            </div>

                            <button 
                                onClick={() => {
                                    onLoadSql(snippet.sql);
                                    onClose();
                                }}
                                className="w-full bg-martian-surface hover:bg-martian-subtle border border-martian-border text-martian-text py-1.5 rounded text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Load into Editor
                            </button>
                        </div>
                    ))
                )}
             </div>
          </div>
       </div>
    </div>
  );
};