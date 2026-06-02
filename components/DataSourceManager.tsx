import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Globe, 
  FileJson, 
  FileSpreadsheet, 
  HardDrive, 
  X, 
  Loader2, 
  Link, 
  Database, 
  Lock, 
  KeyRound, 
  CheckCircle2,
  LogOut,
  UserPlus,
  LogIn,
  Layers,
  Settings,
  ShieldCheck,
  User
} from 'lucide-react';
import { DataSource } from '../types';
import { registerRemoteTable, registerSupabaseSdkTable } from '../services/duckDbService';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  clearSupabaseConfig, 
  getSupabaseClient, 
  signUpUser, 
  signInUser, 
  signOutUser, 
  getSupabaseUser,
  isSupabaseConfigured
} from '../services/supabaseService';

interface DataSourceManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceAdded: (sourceName: string, sourceObj?: DataSource) => void;
  currentSources: DataSource[];
  onRemoveSource: (name: string) => void;
}

export const DataSourceManager: React.FC<DataSourceManagerProps> = ({ 
  isOpen, 
  onClose, 
  onSourceAdded,
  currentSources,
  onRemoveSource
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'supabase'>('sources');

  // Ad-hoc connection states
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [supabaseProjectUrl, setSupabaseProjectUrl] = useState('');
  const [supabaseTableName, setSupabaseTableName] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState<DataSource['type']>('parquet');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Supabase workspace states
  const [configUrl, setConfigUrl] = useState('');
  const [configAnonKey, setConfigAnonKey] = useState('');
  const [activeUser, setActiveUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  
  // Sdk import / mount states
  const [sdkTableName, setSdkTableName] = useState('');
  const [sdkMountName, setSdkMountName] = useState('');
  const [isConfiguringKeys, setIsConfiguringKeys] = useState(false);

  // Global loading states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    // Load existing Supabase configuration
    const config = getSupabaseConfig();
    setConfigUrl(config.url);
    setConfigAnonKey(config.anonKey);
    
    // Check session
    const checkUser = async () => {
      try {
        const user = await getSupabaseUser();
        setActiveUser(user);
      } catch (err) {
        console.warn("Could not retrieve active Supabase user", err);
      }
    };
    
    if (config.url && config.anonKey) {
      checkUser();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle saving credentials
  const handleSaveConfig = async () => {
    setActionError(null);
    setActionSuccess(null);
    
    if (!configUrl || !configAnonKey) {
      setActionError("Both Supabase Project URL and Public Anon Key are required.");
      return;
    }

    try {
      setActionLoading(true);
      // Strip trailing slash
      const formattedUrl = configUrl.trim().replace(/\/$/, '');
      const formattedKey = configAnonKey.trim();
      
      saveSupabaseConfig(formattedUrl, formattedKey);
      
      // Attempt to initialize and fetch user to confirm coordinates work
      const client = getSupabaseClient();
      if (!client) throw new Error("Could not construct Supabase client engine.");
      
      const user = await getSupabaseUser();
      setActiveUser(user);
      
      setActionSuccess("Supabase connection parameters certified!");
      setIsConfiguringKeys(false);
      
      // Auto-focus database name if doing schema operations
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      clearSupabaseConfig();
      setActiveUser(null);
      setActionError(err.message || "Failed to initialize Supabase. Check credentials.");
    } finally {
      setActionLoading(false);
    }
  };

  // Auth Operations
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    
    if (!authEmail || !authPassword) {
      setActionError("Please provide an email and password.");
      return;
    }

    try {
      setActionLoading(true);
      if (authTab === 'login') {
        const data = await signInUser(authEmail, authPassword);
        setActiveUser(data.user);
        setActionSuccess(`Welcome back, ${data.user?.email}!`);
      } else {
        const data = await signUpUser(authEmail, authPassword);
        setActiveUser(data.user);
        if (data.session) {
          setActionSuccess("Sign up successful! You are now logged in.");
        } else {
          setActionSuccess("Registration submitted! Please complete email validation if required.");
        }
      }
      // Reset auth form inputs
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      let msg = err.message || 'Authentication transaction failed.';
      if (msg.includes('Email not confirmed')) {
        msg = "⚠️ Email not confirmed! By default, new Supabase projects require email validation. To bypass this, go to your Supabase Dashboard > Authentication > Providers > Email and toggle off 'Confirm email'. Alternatively, check your email inbox.";
      } else if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
        msg = "❌ Invalid login credentials. Double-check your spelling, or go to the 'Sign Up' tab above if you haven't created this account yet.";
      } else if (msg.includes('Failed to fetch') || msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('network')) {
        msg = "🔌 Connection error or CORS block. Ensure your Supabase Project URL and Public Anon Key are correctly formatted and active in your project.";
      } else if (msg.toLowerCase().includes('signup is disabled') || msg.toLowerCase().includes('sign up is disabled')) {
        msg = "🚫 Sign-ups are disabled in your Supabase Auth configuration. Contact your project administrator or check your auth providers.";
      }
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignOut = async () => {
    setActionError(null);
    setActionSuccess(null);
    try {
      setActionLoading(true);
      await signOutUser();
      setActiveUser(null);
      setActionSuccess("Logged out of session.");
      setTimeout(() => setActionSuccess(null), 2000);
    } catch (err: any) {
      setActionError(err.message || 'Logout failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearKeys = () => {
    clearSupabaseConfig();
    setConfigUrl('');
    setConfigAnonKey('');
    setActiveUser(null);
    setActionSuccess("Credentials reset.");
    setTimeout(() => setActionSuccess(null), 2000);
  };

  // Mount via SDK (Real SQL connection)
  const handleSdkMount = async () => {
    setActionError(null);
    setActionSuccess(null);
    
    if (!sdkTableName || !sdkMountName) {
      setActionError("Provide both a table name in Supabase and an alias in DuckDB.");
      return;
    }

    try {
      setActionLoading(true);
      
      const dbTable = sdkMountName.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      await registerSupabaseSdkTable(dbTable, sdkTableName.trim());
      
      // Notify parent
      const { url: projectUrl } = getSupabaseConfig();
      const representationUrl = `${projectUrl}/rest/v1/${sdkTableName}`;
      onSourceAdded(dbTable, { 
        name: dbTable, 
        url: representationUrl, 
        type: 'supabase'
      });
      
      setActionSuccess(`Linked '${dbTable}' successfully!`);
      setSdkTableName('');
      setSdkMountName('');
      setTimeout(() => setActionSuccess(null), 3500);

    } catch (err: any) {
      setActionError(err.message || "Failed to fetch from table. Check policies, table accessibility, or network state.");
    } finally {
      setActionLoading(false);
    }
  };

  // Standalone mount handler (classic/no auth flow)
  const handleConnect = async () => {
    let targetUrl = url;
    if (type === 'supabase') {
      const cleanUrl = supabaseProjectUrl.trim().replace(/\/$/, '');
      targetUrl = `${cleanUrl}/rest/v1/${supabaseTableName.trim()}?select=*`;
    }

    if (!name || !targetUrl) return;
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await registerRemoteTable(name, targetUrl, type, key);
      onSourceAdded(name, { name, url: targetUrl, type, key });
      
      setSuccessMsg(`Mounted '${name}' successfully!`);
      
      // Reset form
      setName('');
      setUrl('');
      setSupabaseProjectUrl('');
      setSupabaseTableName('');
      setKey('');
      
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to mount source. Verify address, API credentials, or CORS configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = () => {
    if (!name) return false;
    if (type === 'supabase') {
      return !!supabaseProjectUrl && !!supabaseTableName;
    }
    return !!url;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-martian-surface border border-martian-border rounded-xl shadow-2xl flex flex-col max-h-[92vh] select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-martian-border">
          <div>
            <h2 className="text-xl font-bold text-martian-text flex items-center gap-2">
              <Layers className="w-5 h-5 text-martian-primary" />
              Unified Connectivity Workstation
            </h2>
            <p className="text-sm text-martian-muted mt-1">
              Select between mounting raw physical files or setting up an authenticated live Supabase integration workspace.
            </p>
          </div>
          <button onClick={onClose} className="text-martian-muted hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-martian-border px-6 bg-martian-bg/30">
          <button 
            onClick={() => setActiveTab('sources')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'sources' ? 'border-martian-primary text-white font-bold' : 'border-transparent text-martian-muted hover:text-white'}`}
          >
            <Globe className="w-4 h-4" />
            Ad-hoc Data Mounts
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'supabase' ? 'border-omop-emerald text-omop-emerald font-bold' : 'border-transparent text-martian-muted hover:text-omop-emerald'}`}
          >
            <Database className="w-4 h-4" />
            Supabase Auth Workspace
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'sources' ? (
          <div className="flex-1 overflow-auto p-6 flex flex-col md:flex-row gap-6">
            {/* Ad-hoc form */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Mount Alias (Local DuckDB Table)</label>
                <input 
                  type="text" 
                  className="w-full bg-martian-bg border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-martian-primary text-white"
                  placeholder="e.g., local_table"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Source Type</label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    { id: 'parquet', label: 'Parquet File', icon: HardDrive },
                    { id: 'csv', label: 'CSV File', icon: FileSpreadsheet },
                    { id: 'json', label: 'JSON API', icon: FileJson },
                    { id: 'supabase', label: 'Raw REST Query', icon: Database },
                    { id: 'duckdb', label: 'Encrypted DB', icon: Lock },
                  ].map((fmt) => {
                    const isSelected = type === fmt.id;
                    let activeClass = 'bg-martian-primary/20 border-martian-primary text-martian-primary font-bold';

                    if (fmt.id === 'duckdb' && isSelected) {
                        activeClass = 'bg-omop-amber/20 border-omop-amber text-omop-amber shadow-[0_0_10px_rgba(245,158,11,0.2)] font-bold';
                    } else if (fmt.id === 'supabase' && isSelected) {
                        activeClass = 'bg-omop-emerald/20 border-omop-emerald text-omop-emerald shadow-[0_0_10px_rgba(5,223,114,0.2)] font-bold';
                    }

                    const inactiveClass = 'bg-martian-bg border-martian-border text-martian-muted hover:border-martian-text/50';

                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setType(fmt.id as DataSource['type'])}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs justify-center md:justify-start transition-all ${isSelected ? activeClass : inactiveClass}`}
                      >
                        <fmt.icon className="w-3.5 h-3.5" />
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {type === 'supabase' ? (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-xs font-medium text-martian-muted mb-1.5 flex items-center justify-between">
                      <span>Public REST API Project URL</span>
                      <span className="text-[10px] text-omop-emerald capitalize bg-omop-emerald/10 px-1.5 py-0.5 rounded">Anonymous Endpoint</span>
                    </label>
                    <div className="relative">
                      <Link className="absolute left-3 top-2.5 w-4 h-4 text-martian-muted" />
                      <input
                        type="text"
                        className="w-full bg-martian-bg border border-martian-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                        placeholder="https://your-proj.supabase.co"
                        value={supabaseProjectUrl}
                        onChange={(e) => setSupabaseProjectUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-martian-muted mb-1.5">Supabase Table Name</label>
                    <input
                      type="text"
                      className="w-full bg-martian-bg border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                      placeholder="e.g., users"
                      value={supabaseTableName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSupabaseTableName(val);
                        const oldSanitized = supabaseTableName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        const parsedAlias = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        if (!name || name === oldSanitized) {
                          setName(parsedAlias);
                        }
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-omop-emerald mb-1.5 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5" />
                      Supabase Public Anon Key
                    </label>
                    <input
                      type="password"
                      className="w-full bg-martian-bg border border-omop-emerald/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white placeholder-martian-muted/50"
                      placeholder="Enter API Key/Token..."
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-martian-muted mb-1.5">Public URL</label>
                    <div className="relative">
                      <Link className="absolute left-3 top-2.5 w-4 h-4 text-martian-muted" />
                      <input 
                        type="text" 
                        className="w-full bg-martian-bg border border-martian-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-martian-primary text-white"
                        placeholder="e.g., https://domain.com/data.parquet"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  {type === 'duckdb' && (
                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-medium text-omop-amber mb-1.5 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" />
                        Decryption Passphrase
                      </label>
                      <input 
                        type="password" 
                        className="w-full bg-martian-bg border border-omop-amber/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-amber text-white"
                        placeholder="Enter encryption key..."
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 bg-status-error/10 border border-status-error/25 rounded-lg text-xs text-status-error">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-omop-emerald/10 border border-omop-emerald/20 rounded-lg text-xs text-omop-emerald flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {successMsg}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={isLoading || !isFormValid()}
                className={`w-full disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all mt-6 ${type === 'supabase' ? 'bg-omop-emerald hover:brightness-110' : 'bg-martian-primary hover:bg-martian-primary/90'}`}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Register Standalone Source
              </button>
            </div>

            {/* Active Connections Panel */}
            <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-martian-border pt-6 md:pt-0 md:pl-6 flex flex-col">
              <h3 className="text-xs font-bold text-martian-muted uppercase tracking-wider mb-4 flex items-center gap-1">
                <span>Active mounts ({currentSources.length})</span>
              </h3>
              
              <div className="space-y-2 overflow-y-auto max-h-[40vh] md:max-h-none flex-1">
                {currentSources.length === 0 ? (
                  <div className="text-xs text-martian-muted italic text-center py-8">No current bindings.</div>
                ) : (
                  currentSources.map((src) => (
                    <div key={src.name} className="group bg-martian-bg border border-martian-border rounded-lg p-3 relative hover:border-martian-primary/40 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white truncate max-w-[130px]">{src.name}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize bg-martian-surface tracking-wider ${src.type === 'duckdb' ? 'text-omop-amber' : src.type === 'supabase' ? 'text-omop-emerald' : 'text-martian-muted'}`}>
                          {src.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-martian-muted truncate" title={src.url}>{src.url}</div>

                      <button
                        onClick={() => onRemoveSource(src.name)}
                        className="absolute -top-2 -right-2 p-1 bg-status-error/40 border border-status-error/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Supabase Tab */
          <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
            
            {/* Alerts Feedback block */}
            {actionError && (
              <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-xs text-status-error/80 animate-in fade-in duration-200">
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="p-3 bg-omop-emerald/10 border border-omop-emerald/20 rounded-lg text-xs text-omop-emerald flex items-center gap-1.5 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-omop-emerald shrink-0" />
                {actionSuccess}
              </div>
            )}

            {/* Is Not Setup Credentials or Toggle Edit Credentials */}
            {!configUrl || !configAnonKey || isConfiguringKeys ? (
              <div className="max-w-xl mx-auto w-full space-y-4 py-4 animate-in fade-in duration-200">
                <div className="text-center mb-2">
                  <KeyRound className="w-10 h-10 text-omop-emerald mx-auto mb-2" />
                  <h3 className="text-lg font-bold text-white">Enter Supabase Project Credentials</h3>
                  <p className="text-xs text-martian-muted mt-1 max-w-sm mx-auto">
                    Configure your live Supabase parameters below. This activates the built-in Supabase Auth Client module client-side.
                  </p>
                </div>

                <div className="bg-martian-bg border border-martian-border rounded-xl p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Project URL</label>
                    <input
                      type="text"
                      className="w-full bg-martian-surface border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                      placeholder="https://your-project-id.supabase.co"
                      value={configUrl}
                      onChange={(e) => setConfigUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Client API Public Anon Key</label>
                    <input
                      type="password"
                      className="w-full bg-martian-surface border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                      placeholder="Enter supabase public anon key..."
                      value={configAnonKey}
                      onChange={(e) => setConfigAnonKey(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    {isConfiguringKeys && (
                      <button
                        onClick={() => setIsConfiguringKeys(false)}
                        className="flex-1 bg-martian-border/50 hover:bg-martian-border text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={handleSaveConfig}
                      disabled={actionLoading}
                      className="flex-1 bg-omop-emerald hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                      Initialize Supabase Client
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Left hand details (Project & User Authentication State) */}
                <div className="md:col-span-5 space-y-5">
                  
                  {/* Project connection details card */}
                  <div className="bg-martian-bg border border-martian-border rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-omop-emerald bg-omop-emerald/10 px-2 py-0.5 rounded flex items-center gap-1 uppercase">
                        <ShieldCheck className="w-3 h-3" />
                        Client Configured
                      </span>
                      <button
                        onClick={() => setIsConfiguringKeys(true)}
                        className="text-[10px] text-martian-muted hover:text-white underline"
                      >
                        Edit Credentials
                      </button>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-martian-muted uppercase tracking-wider">Supabase Endpoints</div>
                      <div className="text-xs text-white truncate font-mono mt-0.5" title={configUrl}>{configUrl}</div>
                    </div>

                    <button
                      onClick={handleClearKeys}
                      className="w-full bg-status-error/10 hover:bg-status-error/20 border border-status-error/25 text-status-error text-[10px] font-bold py-1.5 rounded transition-all"
                    >
                      Reset Project Configuration
                    </button>
                  </div>

                  {/* Supabase authentication card */}
                  <div className="bg-martian-bg border border-martian-border rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-martian-muted uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-omop-emerald" />
                      Supabase user authentication
                    </h3>

                    {activeUser ? (
                      /* Authenticated User state */
                      <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                        <div className="p-3 bg-omop-emerald/5 border border-omop-emerald/10 rounded-lg">
                          <div className="text-[10px] text-martian-muted uppercase font-bold">Logged In Identity</div>
                          <div className="text-sm font-semibold text-white truncate mt-0.5">{activeUser.email}</div>
                          <div className="text-[10px] text-omop-emerald/80 font-mono mt-1 select-all" title={activeUser.id}>ID: {activeUser.id.substring(0, 16)}...</div>
                        </div>

                        <button
                          onClick={handleSignOut}
                          disabled={actionLoading}
                          className="w-full bg-martian-surface border border-martian-border hover:border-status-error/40 text-martian-muted hover:text-status-error text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                        >
                          {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                          Sign out of Session
                        </button>
                      </div>
                    ) : (
                      /* Guest forms */
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {/* Tab selectors */}
                        <div className="grid grid-cols-2 bg-martian-surface p-1 rounded-lg border border-martian-border text-center">
                          <button
                            onClick={() => setAuthTab('login')}
                            className={`py-1 rounded text-xs font-bold transition-all ${authTab === 'login' ? 'bg-omop-emerald text-white shadow-sm' : 'text-martian-muted hover:text-white'}`}
                          >
                            <LogIn className="w-3 h-3 inline mr-1" />
                            Log In
                          </button>
                          <button
                            onClick={() => setAuthTab('signup')}
                            className={`py-1 rounded text-xs font-bold transition-all ${authTab === 'signup' ? 'bg-omop-emerald text-white shadow-sm' : 'text-martian-muted hover:text-white'}`}
                          >
                            <UserPlus className="w-3 h-3 inline mr-1" />
                            Sign Up
                          </button>
                        </div>

                        <form onSubmit={handleAuthSubmit} className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-martian-muted mb-1 uppercase tracking-wider">Email address</label>
                            <input
                              type="email"
                              required
                              className="w-full bg-martian-surface border border-martian-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-omop-emerald text-white"
                              placeholder="e.g., mail@example.com"
                              value={authEmail}
                              onChange={(e) => setAuthEmail(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-martian-muted mb-1 uppercase tracking-wider">Password</label>
                            <input
                              type="password"
                              required
                              className="w-full bg-martian-surface border border-martian-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-omop-emerald text-white"
                              placeholder="Enter password..."
                              value={authPassword}
                              onChange={(e) => setAuthPassword(e.target.value)}
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full bg-omop-emerald hover:brightness-110 disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors pt-2.5"
                          >
                            {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                            {authTab === 'login' ? 'Authenticate Credentials' : 'Register Secure Account'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right hand details (Mounting Tables via the Auth/Anon Connection) */}
                <div className="md:col-span-7 bg-martian-bg border border-martian-border rounded-xl p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-omop-emerald" />
                        Dynamic Table Mount Controller
                      </h3>
                      <p className="text-xs text-martian-muted mt-1 leading-relaxed">
                        Specify a table name inside your Supabase project. We fetch user datasets using client-side SDK bindings with automatically integrated headers, resolving active RLS (Row Level Security) credentials.
                      </p>
                    </div>

                    <div className="space-y-3.5 pt-2">
                      <div>
                        <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Supabase Table Name</label>
                        <input
                          type="text"
                          className="w-full bg-martian-surface border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                          placeholder="e.g., user_profiles, user_transactions"
                          value={sdkTableName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSdkTableName(val);
                            const oldSanitized = sdkTableName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                            const parsedSdkAlias = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                            if (!sdkMountName || sdkMountName === oldSanitized) {
                              setSdkMountName(parsedSdkAlias);
                            }
                          }}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-martian-muted mb-1.5 uppercase tracking-wider">Mount Alias in DuckDB</label>
                        <input
                          type="text"
                          className="w-full bg-martian-surface border border-martian-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-omop-emerald text-white"
                          placeholder="e.g., profiles"
                          value={sdkMountName}
                          onChange={(e) => setSdkMountName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSdkMount}
                    disabled={actionLoading || !sdkTableName || !sdkMountName}
                    className="w-full bg-omop-emerald hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all mt-6 shadow-[0_4px_12px_rgba(5,223,114,0.15)]"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Mount Authenticated Table
                  </button>
                </div>

              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
