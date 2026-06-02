import React, { useState, useEffect, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';
import { Save, Upload, Code2, AlertCircle } from 'lucide-react';
import { checkSqlSyntax } from '../services/pyodideService';

interface CodeEditorProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, readOnly = false }) => {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validateSql = useCallback(async (sql: string) => {
    if (!sql.trim()) {
      setError(null);
      return;
    }
    const result = await checkSqlSyntax(sql);
    if (!result.isValid) {
      setError(result.error || 'Invalid SQL syntax');
    } else {
      setError(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => validateSql(value), 500);
    return () => clearTimeout(timer);
  }, [value, validateSql]);

  const handleSave = () => {
    const blob = new Blob([value], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `query_${new Date().toISOString().slice(0,10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
            onChange(ev.target.result);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col w-full h-full border border-martian-border rounded-lg overflow-hidden bg-black/30">
      {/* Mini Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-martian-surface border-b border-martian-border h-8 shrink-0">
         <div className="flex items-center gap-2">
             <Code2 className="w-3.5 h-3.5 text-martian-muted" />
             <span className="text-[10px] text-martian-muted font-mono">SQL</span>
         </div>
         <div className="flex items-center gap-1">
             {error && (
                 <div className="flex items-center gap-1 text-red-400 text-[10px] mr-2">
                     <AlertCircle className="w-3 h-3" />
                     <span>Syntax Error</span>
                 </div>
             )}
             <button 
                onClick={handleSave} 
                className="p-1 hover:bg-martian-subtle rounded text-martian-muted hover:text-white transition-colors"
                title="Save SQL to file"
             >
                <Save className="w-3.5 h-3.5" />
             </button>
             <button 
                onClick={handleLoadClick} 
                className="p-1 hover:bg-martian-subtle rounded text-martian-muted hover:text-white transition-colors"
                title="Load SQL from file"
             >
                <Upload className="w-3.5 h-3.5" />
             </button>
             <input 
                type="file" 
                accept=".sql,.txt" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange}
             />
         </div>
      </div>
      
      {/* Editor Area */}
      <div className="relative flex-1 min-h-0 overflow-auto">
        <Editor
            value={value}
            onValueChange={onChange}
            highlight={code => Prism.highlight(code, Prism.languages.sql, 'sql')}
            padding={16}
            className="font-mono text-sm min-h-full"
            textareaClassName="focus:outline-none"
            readOnly={readOnly}
        />
      </div>
      {error && (
          <div className="bg-red-900/20 text-red-400 text-[10px] p-2 border-t border-red-900/50 font-mono">
              {error}
          </div>
      )}
    </div>
  );
};
