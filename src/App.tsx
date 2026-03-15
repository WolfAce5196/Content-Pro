import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from '@google/genai';
import { Settings, Download, Edit3, Image as ImageIcon, UploadCloud, Save, XCircle, Trash2, LogIn, LogOut, ChevronDown, ChevronLeft, ChevronRight, FileText, MessageSquare, Menu, LayoutPanelLeft, Maximize2, Minimize2, Terminal, ChevronUp, CheckCircle2, AlertCircle, Loader2, Play, Database, CheckSquare, Square, PanelRightClose, PanelRightOpen, X, Search, Layers, Copy } from 'lucide-react';
import { signInWithPopup, signOut, onAuthStateChanged, User, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GOOGLE_SHEET_ID: "1U-3xK6atZMtLC3f_lOXkWqqFB2MgJqNaMZL3vf20km8",
  SHEET_GID: "615081352",
  GAS_WEB_APP_URL: "",
  IMGBB_API_KEY: "",
  KNOWLEDGE_BASE: `[DÁN_NỘI_DUNG_KNOWLEDGE_BASE]`,
  COL_BRIEFS: ["Tóm Tắt", "Ghi chú"],
  COL_TONE: "",
  COL_CONTENT: "Content chi tiết",
  COL_IMAGE: "Link Ảnh/Video"
};

interface Brief {
  id: string;
  rowIndex: number;
  rawData: Record<string, string>;
  briefData: Record<string, string>;
  tone?: string;
  content: string;
  imageUrl: string;
  imageBase64?: string;
  status: 'pending' | 'content_generated' | 'image_generated' | 'uploaded' | 'saved' | 'error';
}

function parseCSV(text: string) {
  const result = [];
  let row = [];
  let inQuotes = false;
  let val = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      val += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(val);
      val = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(val);
      result.push(row);
      row = [];
      val = '';
    } else if (char === '\r' && !inQuotes) {
      // ignore
    } else {
      val += char;
    }
  }
  if (val || row.length > 0) {
    row.push(val);
    result.push(row);
  }
  return result;
}

const btnPrimary = "flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-cyan-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm shadow-lg shadow-indigo-500/30";
const btnSecondary = "flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg font-medium hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm shadow-sm";

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string, text: string, dot: string }> = {
    pending: { color: 'badge-neutral', text: 'Chưa xử lý', dot: 'bg-text-muted' },
    content_generated: { color: 'badge-processing', text: 'Đã có Content', dot: 'bg-accent-primary animate-pulse' },
    image_generated: { color: 'badge-success', text: 'Đã có Ảnh', dot: 'bg-status-success' },
    uploaded: { color: 'bg-status-warning/15 text-status-warning', text: 'Đã Upload', dot: 'bg-status-warning' },
    saved: { color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', text: 'Hoàn thành', dot: 'bg-emerald-400' },
    error: { color: 'badge-error', text: 'Lỗi', dot: 'bg-status-danger' },
  };
  const c = config[status] || { color: 'badge-neutral', text: status, dot: 'bg-text-muted' };

  return (
    <span className={`badge ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shadow-[0_0_8px_currentColor]`}></span>
      {c.text}
    </span>
  );
};

const MultiSelectDropdown = ({ options, selected, onChange, label, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-tertiary border border-border-medium text-text-primary rounded-lg text-sm hover:border-border-focus transition-colors w-full shadow-sm"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {Icon && <Icon size={14} className="text-text-muted shrink-0" />}
          <span className="truncate">{selected.length > 0 ? `${label} (${selected.length})` : label}</span>
        </div>
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 mt-1 w-full bg-bg-tertiary border border-border-medium rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
          >
            <div className="p-1.5 space-y-0.5">
              {options.map((opt: string, i: number) => (
                <label key={i} className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-bg-hover rounded-md cursor-pointer group transition-colors">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className="peer sr-only"
                      checked={selected.includes(opt)}
                      onChange={(e) => {
                        const newSelected = e.target.checked 
                          ? [...selected, opt] 
                          : selected.filter((s: string) => s !== opt);
                        onChange(newSelected);
                      }}
                    />
                    <div className="w-4 h-4 rounded border border-border-medium bg-bg-secondary peer-checked:bg-accent-primary peer-checked:border-accent-primary transition-all flex items-center justify-center">
                      <svg className={`w-3 h-3 text-white transition-transform ${selected.includes(opt) ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                  </div>
                  <span className="text-sm text-text-primary truncate group-hover:text-white transition-colors">{opt}</span>
                </label>
              ))}
              {options.length === 0 && (
                <div className="p-3 text-sm text-text-muted text-center italic">Không có cột nào</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SingleSelectDropdown = ({ options, selected, onChange, label, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-tertiary border border-border-medium text-text-primary rounded-lg text-sm hover:border-border-focus transition-colors w-full shadow-sm"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {Icon && <Icon size={14} className="text-text-muted shrink-0" />}
          <span className="truncate">{selected ? selected : label}</span>
        </div>
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 mt-1 w-full bg-bg-tertiary border border-border-medium rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
          >
            <div className="p-1.5 space-y-0.5">
              {options.map((opt: string, i: number) => (
                <button 
                  key={i} 
                  onClick={() => { onChange(opt); setIsOpen(false); }}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 hover:bg-bg-hover rounded-md cursor-pointer transition-colors ${selected === opt ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary'}`}
                >
                  <span className="text-sm truncate">{opt}</span>
                  {selected === opt && <CheckCircle2 size={14} className="ml-auto shrink-0" />}
                </button>
              ))}
              {options.length === 0 && (
                <div className="p-3 text-sm text-text-muted text-center italic">Không có cột nào</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PreviewPanel = ({ brief, updateBrief, onClose, onToggleExpand, isExpanded }: { brief: Brief, updateBrief: (id: string, updates: Partial<Brief>) => void, onClose: () => void, onToggleExpand: () => void, isExpanded: boolean }) => {
  const [activeTab, setActiveTab] = useState<'content' | 'image'>('content');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-secondary relative">
      <div className="px-6 py-4 border-b border-border-subtle bg-bg-secondary flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center font-mono font-bold text-sm border border-accent-primary/20">
            {brief.rowIndex}
          </div>
          <h3 className="font-bold text-lg text-text-primary tracking-tight">Chi tiết Brief</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggleExpand} className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors" title={isExpanded ? "Thu nhỏ" : "Mở rộng"}>
            {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded-lg transition-colors" title="Đóng">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="px-6 pt-4 border-b border-border-subtle bg-bg-secondary">
        <div className="space-y-2 mb-6">
          {Object.entries(brief.briefData).map(([key, value]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 text-sm">
              <span className="font-medium text-text-secondary w-32 shrink-0">{key}:</span>
              <span className="text-text-primary">{value || <span className="text-text-muted italic">Trống</span>}</span>
            </div>
          ))}
          {brief.tone && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 text-sm mt-2 pt-2 border-t border-border-subtle/50">
              <span className="font-medium text-text-secondary w-32 shrink-0">Giọng điệu:</span>
              <span className="flex items-center gap-1.5 text-accent-primary font-medium">
                <MessageSquare size={14} /> {brief.tone}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6 relative">
          <button 
            onClick={() => setActiveTab('content')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'content' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} /> Content
            </div>
            {activeTab === 'content' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('image')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'image' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <div className="flex items-center gap-2">
              <ImageIcon size={16} /> Ảnh minh họa
            </div>
            {activeTab === 'image' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
            )}
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
        <AnimatePresence mode="wait">
          {activeTab === 'content' ? (
            <motion.div 
              key="content"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col"
            >
              {!brief.content && brief.status !== 'content_generated' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4 border border-dashed border-border-medium rounded-xl p-8">
                  <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                    <Edit3 size={24} className="text-text-secondary" />
                  </div>
                  <p className="text-sm">Chọn dòng brief và nhấn Tạo Content</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col bg-bg-tertiary rounded-xl border border-border-medium overflow-hidden focus-within:border-accent-primary focus-within:shadow-[0_0_20px_rgba(108,92,231,0.15)] transition-all">
                  <div className="px-4 py-2 border-b border-border-medium flex justify-between items-center bg-bg-secondary">
                    <span className="text-xs font-medium text-text-secondary">{brief.content.length} ký tự</span>
                    <button onClick={() => navigator.clipboard.writeText(brief.content)} className="p-1.5 text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 rounded-md transition-colors" title="Copy content">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                  <textarea 
                    className="flex-1 w-full p-4 resize-none focus:outline-none bg-transparent text-text-primary font-mono text-sm leading-relaxed"
                    value={brief.content}
                    onChange={(e) => updateBrief(brief.id, { content: e.target.value })}
                    placeholder="Content sẽ hiển thị ở đây..."
                  />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="image"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col gap-6"
            >
              <div className="w-full max-w-md mx-auto aspect-square bg-bg-tertiary rounded-2xl border border-border-medium flex items-center justify-center overflow-hidden relative group">
                {brief.imageBase64 ? (
                  <>
                    <img src={`data:image/jpeg;base64,${brief.imageBase64}`} alt="AI Generated" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <span className="text-white font-medium flex items-center gap-2"><Maximize2 size={16}/> Click to view full</span>
                    </div>
                  </>
                ) : brief.imageUrl ? (
                  <>
                    <img src={brief.imageUrl} alt="Uploaded" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <span className="text-white font-medium flex items-center gap-2"><Maximize2 size={16}/> Click to view full</span>
                    </div>
                  </>
                ) : (
                  <div className="text-text-muted flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center border border-border-subtle">
                      <ImageIcon size={24} className="text-text-secondary" />
                    </div>
                    <span className="text-sm font-medium">Chưa có ảnh</span>
                  </div>
                )}
              </div>
              
              <div className="w-full max-w-md mx-auto">
                {brief.imageUrl ? (
                  <div className="bg-bg-tertiary p-4 rounded-xl border border-border-medium">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5"><UploadCloud size={14}/> Link ảnh public</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly value={brief.imageUrl} className="flex-1 p-2.5 text-sm bg-bg-secondary border border-border-medium rounded-lg text-text-primary focus:outline-none focus:border-accent-primary transition-colors" />
                      <button onClick={() => navigator.clipboard.writeText(brief.imageUrl || '')} className="p-2.5 bg-bg-secondary border border-border-medium rounded-lg text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 transition-colors" title="Copy link">
                        <Download size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-muted italic bg-bg-tertiary p-4 rounded-xl border border-border-medium flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse"></div>
                    Ảnh sẽ xuất hiện ở đây sau khi tạo hoặc upload.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(true);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{time: string, msg: string, type: 'info'|'error'|'success'}[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [availableTabs, setAvailableTabs] = useState<{id: number, title: string}[]>([]);
  const [isFetchingTabs, setIsFetchingTabs] = useState(false);
  const [availableSpreadsheets, setAvailableSpreadsheets] = useState<{id: string, name: string}[]>([]);
  const [isFetchingSpreadsheets, setIsFetchingSpreadsheets] = useState(false);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [isFetchingHeaders, setIsFetchingHeaders] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, task: '' });

  // Layout states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(true);

  const [isConfigLoading, setIsConfigLoading] = useState(false);

  const addLog = (msg: string, type: 'info'|'error'|'success' = 'info') => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 100));
  };

  const renderLogMessage = (msg: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = msg.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return <a key={i} href={part} target="_blank" rel="noreferrer" className="underline text-accent-primary break-all">{part}</a>;
      }
      return part;
    });
  };

  useEffect(() => {
    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          addLog('Lỗi kết nối Firestore: Client đang offline. Vui lòng kiểm tra cấu hình Firebase.', 'error');
        }
      }
    };
    testConnection();

    // Set persistence explicitly
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error("Error setting persistence:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsConfigLoading(true);
        try {
          const docRef = doc(db, 'userConfigs', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const loadedConfig = docSnap.data();
            setConfig(prev => ({ ...prev, ...loadedConfig }));
            addLog('Đã tải cấu hình từ database.', 'success');
            
            // Automatically close config modal if essential keys are present
            if (loadedConfig.GEMINI_API_KEY && loadedConfig.GOOGLE_SHEET_ID) {
              setShowConfig(false);
            }
          }
        } catch (error: any) {
          console.error("Error loading config:", error);
          if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
            handleFirestoreError(error, OperationType.GET, `userConfigs/${currentUser.uid}`);
          }
        } finally {
          setIsConfigLoading(false);
        }
      } else {
        setShowConfig(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchHeaders = async () => {
    if (!config.GOOGLE_SHEET_ID || !config.SHEET_GID) return;
    
    setIsFetchingHeaders(true);
    try {
      const tab = availableTabs.find(t => t.id.toString() === config.SHEET_GID);
      const tabTitle = tab ? tab.title : config.SHEET_GID;
      
      let url = `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}/values/'${tabTitle}'!1:1`;
      const headers: Record<string, string> = {};
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error('Không thể tải headers.');
      }
      
      const data = await res.json();
      const sheetHeaders = (data.values?.[0] || []).map((h: any) => String(h).trim());
      setAvailableHeaders(sheetHeaders);
      
      // Auto-map if current config is not in headers
      setConfig(prev => {
        const newConfig = { ...prev };
        if (!newConfig.COL_BRIEFS || newConfig.COL_BRIEFS.length === 0) {
          newConfig.COL_BRIEFS = [sheetHeaders[0], sheetHeaders[1]].filter(Boolean);
        } else {
          newConfig.COL_BRIEFS = newConfig.COL_BRIEFS.filter(col => sheetHeaders.includes(col));
          if (newConfig.COL_BRIEFS.length === 0) {
            newConfig.COL_BRIEFS = [sheetHeaders[0], sheetHeaders[1]].filter(Boolean);
          }
        }
        if (!sheetHeaders.includes(newConfig.COL_CONTENT)) newConfig.COL_CONTENT = sheetHeaders[2] || "";
        if (!sheetHeaders.includes(newConfig.COL_IMAGE)) newConfig.COL_IMAGE = sheetHeaders[3] || "";
        return newConfig;
      });
      
    } catch (error: any) {
      addLog(`Lỗi tải headers: ${error.message}`, 'error');
    } finally {
      setIsFetchingHeaders(false);
    }
  };

  useEffect(() => {
    if (availableTabs.length > 0 && config.SHEET_GID) {
      fetchHeaders();
    }
  }, [config.SHEET_GID, availableTabs, accessToken]);

  const fetchSpreadsheets = async (token: string) => {
    setIsFetchingSpreadsheets(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)&orderBy=modifiedTime desc`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.error?.message?.includes('API has not been used')) {
          throw new Error('Google Drive API chưa được bật. Vui lòng bật tại: https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=112977840443');
        }
        throw new Error('Không thể tải danh sách Google Sheet.');
      }
      const data = await res.json();
      setAvailableSpreadsheets(data.files || []);
      addLog(`Đã tải ${data.files?.length || 0} Google Sheets.`, 'success');
    } catch (error: any) {
      addLog(`Lỗi tải danh sách Sheets: ${error.message}`, 'error');
    } finally {
      setIsFetchingSpreadsheets(false);
    }
  };

  const handleLogin = async () => {
    try {
      addLog('Đang mở cửa sổ đăng nhập Google...', 'info');
      const result = await signInWithPopup(auth, googleProvider);
      
      // @ts-ignore
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setAccessToken(credential.accessToken);
        addLog('Đăng nhập Google thành công và đã cấp quyền truy cập Sheet.', 'success');
        fetchSpreadsheets(credential.accessToken);
      } else {
        addLog('Đăng nhập thành công nhưng không nhận được Access Token. Vui lòng thử lại.', 'error');
      }
    } catch (error: any) {
      console.error("Login error:", error);
      let errorMsg = error.message;
      
      if (error.code === 'auth/popup-blocked') {
        errorMsg = 'Trình duyệt đã chặn cửa sổ popup. Vui lòng cho phép popup cho trang web này.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMsg = 'Yêu cầu đăng nhập đã bị hủy hoặc cửa sổ popup bị đóng.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMsg = 'Lỗi mạng. Vui lòng kiểm tra kết nối internet.';
      } else if (error.code === 'auth/internal-error') {
        errorMsg = 'Lỗi nội bộ Firebase. Vui lòng thử lại sau.';
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMsg = `Tên miền "${window.location.hostname}" chưa được cấp quyền trong Firebase Console. Hãy copy tên miền này và thêm vào mục "Authorized domains" trong cài đặt Authentication của Firebase.`;
      }
      
      addLog(`Lỗi đăng nhập: ${errorMsg}`, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setUser(null);
      setAvailableTabs([]);
      setConfig(DEFAULT_CONFIG);
      setShowConfig(true);
      addLog('Đã đăng xuất.', 'info');
    } catch (error: any) {
      addLog(`Lỗi đăng xuất: ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    if (config.GOOGLE_SHEET_ID && accessToken) {
      fetchTabs();
    }
  }, [config.GOOGLE_SHEET_ID]);

  const fetchTabs = async () => {
    if (!config.GOOGLE_SHEET_ID) {
      addLog('Vui lòng nhập Google Sheet ID.', 'error');
      return;
    }
    
    setIsFetchingTabs(true);
    try {
      let url = `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}`;
      const headers: Record<string, string> = {};
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        let errorMsg = res.status === 401 || res.status === 403 
          ? 'Không có quyền truy cập Sheet. Vui lòng đăng nhập Google.' 
          : 'Không thể tải thông tin Sheet. Kiểm tra lại ID.';
        
        if (errorData.error?.message?.includes('API has not been used')) {
          errorMsg = 'Google Sheets API chưa được bật. Vui lòng bật tại: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=112977840443';
        } else if (errorData.error?.message) {
          errorMsg = `Lỗi từ Google: ${errorData.error.message}`;
        }
        
        throw new Error(errorMsg);
      }
      
      const data = await res.json();
      const tabs = data.sheets.map((s: any) => ({
        id: s.properties.sheetId,
        title: s.properties.title
      }));
      
      setAvailableTabs(tabs);
      if (tabs.length > 0 && !config.SHEET_GID) {
        setConfig(prev => ({ ...prev, SHEET_GID: tabs[0].id.toString() }));
      }
      addLog(`Đã tải danh sách ${tabs.length} tabs.`, 'success');
    } catch (error: any) {
      addLog(`Lỗi tải tabs: ${error.message}`, 'error');
    } finally {
      setIsFetchingTabs(false);
    }
  };

  useEffect(() => {
    if (accessToken && config.GOOGLE_SHEET_ID && availableTabs.length === 0) {
      fetchTabs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, config.GOOGLE_SHEET_ID]);

  // Update briefs when column configuration changes
  useEffect(() => {
    if (briefs.length === 0) return;
    
    setBriefs(prev => prev.map(b => {
      if (!b.rawData) return b; // Skip if rawData is not available
      
      const newBriefData: Record<string, string> = {};
      config.COL_BRIEFS.forEach(col => {
        if (b.rawData[col]) {
          newBriefData[col] = b.rawData[col];
        }
      });
      
      return {
        ...b,
        briefData: newBriefData,
        tone: config.COL_TONE ? (b.rawData[config.COL_TONE] || '') : '',
        content: b.status === 'pending' ? (config.COL_CONTENT ? (b.rawData[config.COL_CONTENT] || '') : '') : b.content,
        imageUrl: b.status === 'pending' ? (config.COL_IMAGE ? (b.rawData[config.COL_IMAGE] || '') : '') : b.imageUrl,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.COL_BRIEFS, config.COL_TONE, config.COL_CONTENT, config.COL_IMAGE]);

  const loadBriefs = async () => {
    try {
      setIsProcessing(true);
      addLog('Đang tải dữ liệu từ Google Sheet...', 'info');
      
      let rows: string[][] = [];
      
      if (accessToken) {
        // Use Sheets API if we have access token
        const tab = availableTabs.find(t => t.id.toString() === config.SHEET_GID);
        const tabTitle = tab ? tab.title : config.SHEET_GID; // Fallback to GID if title not found
        
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}/values/'${tabTitle}'`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!res.ok) {
          let errorMsg = 'Không thể truy cập Google Sheet qua API.';
          try {
            const errorData = await res.json();
            if (errorData.error && errorData.error.message) {
              errorMsg = `Lỗi từ Google: ${errorData.error.message}`;
            }
          } catch (e) {}
          throw new Error(errorMsg);
        }
        const data = await res.json();
        
        if (!data.values || data.values.length < 2) throw new Error('Sheet không có dữ liệu.');
        
        rows = data.values.map((row: any[]) => row.map(cell => String(cell || '')));
        
      } else {
        // Fallback to public export
        const url = `https://docs.google.com/spreadsheets/d/${config.GOOGLE_SHEET_ID}/export?format=csv&gid=${config.SHEET_GID}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Không thể truy cập Google Sheet. Hãy đảm bảo Sheet đã được share "Anyone with the link" hoặc Đăng nhập.');
        const csvText = await res.text();
        rows = parseCSV(csvText);
      }
      
      if (rows.length < 2) throw new Error('Sheet không có dữ liệu.');
      
      const headers = rows[0].map(h => h.trim());
      setAvailableHeaders(headers);
      
      const newConfig = { ...config };
      if (!newConfig.COL_BRIEFS || newConfig.COL_BRIEFS.length === 0) {
        newConfig.COL_BRIEFS = [headers[0], headers[1]].filter(Boolean);
      } else {
        // Ensure selected brief columns exist in headers
        newConfig.COL_BRIEFS = newConfig.COL_BRIEFS.filter(col => headers.includes(col));
        if (newConfig.COL_BRIEFS.length === 0) {
          newConfig.COL_BRIEFS = [headers[0], headers[1]].filter(Boolean);
        }
      }
      
      if (!headers.includes(newConfig.COL_CONTENT)) newConfig.COL_CONTENT = headers[2] || "";
      if (!headers.includes(newConfig.COL_IMAGE)) newConfig.COL_IMAGE = headers[3] || "";
      
      if (JSON.stringify(newConfig.COL_BRIEFS) !== JSON.stringify(config.COL_BRIEFS) || 
          newConfig.COL_CONTENT !== config.COL_CONTENT ||
          newConfig.COL_IMAGE !== config.COL_IMAGE) {
        setConfig(newConfig);
      }
      
      const contentIdx = headers.indexOf(newConfig.COL_CONTENT);
      const imageIdx = headers.indexOf(newConfig.COL_IMAGE);
      const toneIdx = newConfig.COL_TONE ? headers.indexOf(newConfig.COL_TONE) : -1;
      
      const loadedBriefs: Brief[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        const rawData: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rawData[h] = row[idx] || '';
        });

        const briefData: Record<string, string> = {};
        let hasData = false;
        
        newConfig.COL_BRIEFS.forEach(colName => {
          const idx = headers.indexOf(colName);
          if (idx !== -1 && row[idx]) {
            briefData[colName] = row[idx];
            hasData = true;
          }
        });
        
        if (!hasData) continue;
        
        const id = `row_${i + 1}`;
        const existingBrief = briefs.find(b => b.id === id);
        
        loadedBriefs.push({
          id,
          rowIndex: i + 1,
          rawData,
          briefData,
          tone: toneIdx !== -1 ? (row[toneIdx] || '') : '',
          content: existingBrief && existingBrief.status !== 'pending' ? existingBrief.content : (contentIdx !== -1 ? (row[contentIdx] || '') : ''),
          imageUrl: existingBrief && existingBrief.status !== 'pending' ? existingBrief.imageUrl : (imageIdx !== -1 ? (row[imageIdx] || '') : ''),
          imageBase64: existingBrief ? existingBrief.imageBase64 : undefined,
          status: existingBrief ? existingBrief.status : 'pending'
        });
      }
      
      setBriefs(loadedBriefs);
      addLog(`Đã tải ${loadedBriefs.length} briefs thành công.`, 'success');
      setShowConfig(false);
    } catch (err: any) {
      addLog(`Lỗi tải Sheet: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateContent = async () => {
    if (selectedIds.size === 0) return;
    if (!config.GEMINI_API_KEY) {
      addLog('Vui lòng nhập Gemini API Key trong phần Cấu hình.', 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Content' });
    
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    let count = 0;
    
    for (const id of selectedIds) {
      const brief = briefs.find(b => b.id === id);
      if (!brief) continue;
      
      try {
        addLog(`Đang tạo content cho dòng ${brief.rowIndex}...`, 'info');
        setActiveBriefId(brief.id);
        
        const briefText = Object.entries(brief.briefData)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n');

        const toneInstruction = brief.tone ? `- Giọng điệu yêu cầu: ${brief.tone}` : '- Giọng điệu theo đúng yêu cầu trong Ghi chú (nếu có)';

        const prompt = `Bạn là chuyên gia viết content marketing.

KIẾN THỨC CHUYÊN NGÀNH:
${config.KNOWLEDGE_BASE}

BRIEF:
${briefText}

YÊU CẦU:
- Viết content chi tiết, hấp dẫn, phù hợp với brief
- Sử dụng kiến thức chuyên ngành đã cung cấp, KHÔNG bịa thông tin
${toneInstruction}
- Độ dài: 150-500 từ (trừ khi brief yêu cầu khác)
- Xuất content dạng text thuần, không dùng markdown`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
        });
        
        const content = response.text || '';
        
        setBriefs(prev => prev.map(b => b.id === id ? { ...b, content, status: 'content_generated' } : b));
        addLog(`Đã tạo content cho dòng ${brief.rowIndex}.`, 'success');
      } catch (err: any) {
        addLog(`Lỗi tạo content dòng ${brief.rowIndex}: ${err.message}`, 'error');
        setBriefs(prev => prev.map(b => b.id === id ? { ...b, status: 'error' } : b));
      }
      
      count++;
      setProgress(p => ({ ...p, current: count }));
    }
    
    setIsProcessing(false);
  };

  const generateImage = async () => {
    if (selectedIds.size === 0) return;
    if (!config.GEMINI_API_KEY) {
      addLog('Vui lòng nhập Gemini API Key.', 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Ảnh AI' });
    
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    let count = 0;
    
    for (const id of selectedIds) {
      const brief = briefs.find(b => b.id === id);
      if (!brief) continue;
      if (!brief.content) {
        addLog(`Dòng ${brief.rowIndex} chưa có content, bỏ qua tạo ảnh.`, 'error');
        count++;
        setProgress(p => ({ ...p, current: count }));
        continue;
      }
      
      try {
        addLog(`Đang tạo prompt ảnh cho dòng ${brief.rowIndex}...`, 'info');
        setActiveBriefId(brief.id);
        
        const promptResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Dựa trên nội dung content sau, hãy tạo 1 prompt bằng tiếng Anh mô tả ảnh minh họa phù hợp:

CONTENT: ${brief.content}

Yêu cầu prompt ảnh:
- Ảnh chân thực, phong cách chụp ảnh thật (photorealistic)
- Không có text/chữ trong ảnh
- Phù hợp để đăng trên mạng xã hội
- Ánh sáng tự nhiên, bố cục đẹp
- Chỉ trả về nội dung prompt, không thêm text nào khác.`
        });
        
        const imagePrompt = promptResponse.text || 'A beautiful photorealistic image';
        addLog(`Đang sinh ảnh cho dòng ${brief.rowIndex}...`, 'info');
        
        const imageResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: imagePrompt,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: "1:1"
            }
          }
        });
        
        const base64Data = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        
        if (base64Data) {
          setBriefs(prev => prev.map(b => b.id === id ? { ...b, imageBase64: base64Data, status: 'image_generated' } : b));
          addLog(`Đã tạo ảnh cho dòng ${brief.rowIndex}.`, 'success');
        } else {
          throw new Error('Không nhận được dữ liệu ảnh từ API.');
        }
      } catch (err: any) {
        addLog(`Lỗi tạo ảnh dòng ${brief.rowIndex}: ${err.message}`, 'error');
        setBriefs(prev => prev.map(b => b.id === id ? { ...b, status: 'error' } : b));
      }
      
      count++;
      setProgress(p => ({ ...p, current: count }));
    }
    
    setIsProcessing(false);
  };

  const uploadImages = async () => {
    if (selectedIds.size === 0) return;
    if (!config.IMGBB_API_KEY) {
      addLog('Vui lòng nhập ImgBB API Key.', 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.size, task: 'Upload Ảnh' });
    let count = 0;
    
    for (const id of selectedIds) {
      const brief = briefs.find(b => b.id === id);
      if (!brief) continue;
      if (!brief.imageBase64) {
        count++;
        setProgress(p => ({ ...p, current: count }));
        continue;
      }
      
      try {
        addLog(`Đang upload ảnh dòng ${brief.rowIndex}...`, 'info');
        setActiveBriefId(brief.id);
        
        const formData = new FormData();
        formData.append('image', brief.imageBase64);
        
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${config.IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (data.success) {
          setBriefs(prev => prev.map(b => b.id === id ? { ...b, imageUrl: data.data.url, status: 'uploaded' } : b));
          addLog(`Upload thành công dòng ${brief.rowIndex}: ${data.data.url}`, 'success');
        } else {
          throw new Error(data.error?.message || 'Upload thất bại');
        }
      } catch (err: any) {
        addLog(`Lỗi upload dòng ${brief.rowIndex}: ${err.message}`, 'error');
      }
      
      count++;
      setProgress(p => ({ ...p, current: count }));
    }
    
    setIsProcessing(false);
  };

  const saveToSheet = async () => {
    if (selectedIds.size === 0) return;
    
    setIsProcessing(true);
    addLog('Đang lưu dữ liệu về Google Sheet...', 'info');
    
    try {
      if (accessToken) {
        // Use Google Sheets API directly
        const tab = availableTabs.find(t => t.id.toString() === config.SHEET_GID);
        const tabTitle = tab ? tab.title : '';
        
        if (!tabTitle) throw new Error('Không xác định được tên Tab để ghi dữ liệu.');
        
        const data = [];
        
        // Fetch headers to get column letters
        const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}/values/'${tabTitle}'!1:1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const headerData = await headerRes.json();
        const sheetHeaders = (headerData.values?.[0] || []).map((h: any) => String(h).trim());
        
        const contentColIdx = sheetHeaders.indexOf(config.COL_CONTENT);
        const imageColIdx = sheetHeaders.indexOf(config.COL_IMAGE);
        
        const getColLetter = (idx: number) => {
          let letter = '';
          let temp = idx;
          while (temp >= 0) {
            letter = String.fromCharCode((temp % 26) + 65) + letter;
            temp = Math.floor(temp / 26) - 1;
          }
          return letter;
        };

        for (const id of selectedIds) {
          const brief = briefs.find(b => b.id === id);
          if (!brief) continue;
          
          if (brief.content && contentColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(contentColIdx)}${brief.rowIndex}`,
              values: [[brief.content]]
            });
          }
          if (brief.imageUrl && imageColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(imageColIdx)}${brief.rowIndex}`,
              values: [[brief.imageUrl]]
            });
          }
        }
        
        if (data.length === 0) {
           addLog('Không có dữ liệu mới để lưu hoặc không tìm thấy cột.', 'info');
           setIsProcessing(false);
           return;
        }
        
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}/values:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: data
          })
        });
        
        if (!res.ok) {
          let errorMsg = 'Lỗi khi ghi dữ liệu qua API.';
          try {
            const errorData = await res.json();
            if (errorData.error && errorData.error.message) {
              errorMsg = `Lỗi từ Google: ${errorData.error.message}`;
            }
          } catch (e) {}
          throw new Error(errorMsg);
        }
        
        addLog(`Đã lưu ${data.length} ô dữ liệu về Sheet thành công qua API.`, 'success');
        setBriefs(prev => prev.map(b => selectedIds.has(b.id) ? { ...b, status: 'saved' } : b));
        
      } else {
        // Fallback to GAS Web App
        if (!config.GAS_WEB_APP_URL) {
          addLog('Vui lòng đăng nhập Google hoặc nhập GAS Web App URL.', 'error');
          setShowConfig(true);
          setIsProcessing(false);
          return;
        }
        
        const data: any[] = [];
        for (const id of selectedIds) {
          const brief = briefs.find(b => b.id === id);
          if (!brief) continue;
          
          data.push({
            rowIndex: brief.rowIndex,
            content: brief.content || '',
            imageUrl: brief.imageUrl || ''
          });
        }
        
        if (data.length === 0) {
          addLog('Không có dữ liệu mới để lưu.', 'info');
          setIsProcessing(false);
          return;
        }
        
        const payload = {
          sheetId: config.GOOGLE_SHEET_ID,
          tabId: config.SHEET_GID,
          contentCol: config.COL_CONTENT,
          imageCol: config.COL_IMAGE,
          data: data
        };
        
        const res = await fetch(config.GAS_WEB_APP_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
        
        const result = await res.json();
        if (result.status === 'success') {
          addLog(`Đã lưu ${data.length} dòng dữ liệu về Sheet thành công.`, 'success');
          setBriefs(prev => prev.map(b => selectedIds.has(b.id) ? { ...b, status: 'saved' } : b));
        } else {
          throw new Error(result.message || 'GAS trả về lỗi');
        }
      }
    } catch (err: any) {
      addLog(`Lỗi khi lưu về Sheet: ${err.message}`, 'error');
    }
    
    setIsProcessing(false);
  };

  return (
    <div className="h-screen w-screen bg-bg-primary flex overflow-hidden font-sans text-text-primary selection:bg-accent-primary/30 selection:text-accent-primary">
      {/* Loading Overlay */}
      <AnimatePresence>
        {isConfigLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-primary/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-accent-primary animate-spin" />
            <p className="text-sm font-medium text-text-secondary">Đang tải cấu hình...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarCollapsed ? 68 : 260 }}
        className="shrink-0 border-r border-border-subtle bg-bg-secondary flex flex-col z-20 relative transition-all duration-300"
      >
        <div className="h-16 flex items-center px-4 border-b border-border-subtle shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center font-bold text-lg text-white shadow-[0_0_15px_rgba(108,92,231,0.4)] shrink-0">C</div>
          {!isSidebarCollapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-3 font-display font-bold text-lg tracking-wide whitespace-nowrap">Content Pro</motion.span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
          {/* Menu Items */}
          <div className="space-y-1">
            <button onClick={() => setShowConfig(true)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${showConfig ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
              <Settings size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Cấu hình hệ thống</span>}
            </button>
            <button onClick={() => setIsLogExpanded(!isLogExpanded)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isLogExpanded ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
              <Terminal size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>System Logs</span>}
            </button>
          </div>

          {/* Column Config */}
          {!isSidebarCollapsed && availableHeaders.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Cấu hình Cột</h3>
                <button 
                  onClick={fetchHeaders} 
                  disabled={isFetchingHeaders}
                  className="text-text-muted hover:text-accent-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary"
                  title="Làm mới danh sách cột"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetchingHeaders ? "animate-spin" : ""}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Cột Brief (Đầu vào)</label>
                  <MultiSelectDropdown options={availableHeaders} selected={config.COL_BRIEFS || []} onChange={(val: string[]) => setConfig({...config, COL_BRIEFS: val})} label="Chọn cột..." icon={FileText} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Giọng điệu Content</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_TONE || ''} onChange={(val: string) => setConfig({...config, COL_TONE: val})} label="Chọn cột..." icon={MessageSquare} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Cột Content (Đầu ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_CONTENT} onChange={(val: string) => setConfig({...config, COL_CONTENT: val})} label="Chọn cột..." icon={Edit3} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Cột Link Ảnh (Đầu ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_IMAGE} onChange={(val: string) => setConfig({...config, COL_IMAGE: val})} label="Chọn cột..." icon={ImageIcon} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User / Connection Status */}
        <div className="p-4 border-t border-border-subtle shrink-0">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-medium flex items-center justify-center shrink-0 overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-status-success animate-pulse"></div>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-medium text-text-primary truncate">{user.displayName || user.email}</span>
                    <span className="text-[10px] text-text-muted">{accessToken ? 'Đã kết nối Google' : 'Chưa kết nối Google Sheet'}</span>
                  </div>
                )}
              </div>
              
              {!accessToken && !isSidebarCollapsed && (
                <button 
                  onClick={handleLogin} 
                  className="w-full flex items-center justify-center gap-2 py-2 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 rounded-lg text-xs font-medium hover:bg-accent-primary/20 transition-colors"
                >
                  <Layers size={14} /> Kết nối Google Sheet
                </button>
              )}
              
              {!isSidebarCollapsed && (
                <button 
                  onClick={handleLogout} 
                  className="w-full flex items-center justify-center gap-2 py-1.5 text-text-muted hover:text-status-danger transition-colors text-[10px] font-medium uppercase tracking-wider"
                >
                  <LogOut size={12} /> Đăng xuất
                </button>
              )}
            </div>
          ) : (
            <button onClick={handleLogin} className="w-full flex items-center justify-center gap-2 p-2 bg-bg-tertiary hover:bg-border-subtle border border-border-medium rounded-lg text-sm font-medium transition-colors">
              <LogIn size={16} />
              {!isSidebarCollapsed && <span>Đăng nhập</span>}
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-bg-tertiary border border-border-medium rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:border-accent-primary transition-colors z-30 shadow-sm"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </motion.aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-border-subtle bg-bg-primary flex items-center justify-between px-6 shrink-0 relative z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-display font-bold text-lg tracking-tight">Dashboard</h2>
            {availableTabs.length > 0 && (
              <div className="h-6 w-px bg-border-medium mx-2"></div>
            )}
            {user && availableTabs.length > 0 && (
              <div className="flex items-center gap-2 bg-bg-secondary rounded-lg px-3 py-1.5 border border-border-subtle">
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Sheet:</span>
                <div className="relative">
                  <select 
                    value={config.SHEET_GID} 
                    onChange={async e => {
                      const newConfig = {...config, SHEET_GID: e.target.value};
                      setConfig(newConfig);
                      if (user) {
                        try {
                          await setDoc(doc(db, 'users', user.uid), { config: newConfig }, { merge: true });
                        } catch (error: any) {
                          console.error("Error saving config:", error);
                          if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
                            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
                          }
                        }
                      }
                    }}
                    className="bg-transparent text-sm text-text-primary outline-none cursor-pointer appearance-none pr-5 font-medium hover:text-accent-primary transition-colors"
                  >
                    {availableTabs.map(tab => (
                      <option key={tab.id} value={tab.id} className="bg-bg-secondary text-text-primary">{tab.title}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1 text-text-muted pointer-events-none" size={14} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={loadBriefs} disabled={isProcessing} className="btn-secondary"><Download size={16}/> Tải Dữ Liệu</button>
            <button onClick={saveToSheet} disabled={isProcessing || selectedIds.size === 0} className="btn-primary"><Save size={16}/> Lưu về Sheet</button>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 flex overflow-hidden relative bg-bg-primary">
          {/* Table Area */}
          <div className={`flex flex-col h-full border-r border-border-subtle transition-all duration-300 ${activeBriefId && isPreviewExpanded ? 'w-0 opacity-0 overflow-hidden' : activeBriefId ? 'w-[60%]' : 'w-full'}`}>
            {/* Action Bar */}
            <div className="px-6 py-4 border-b border-border-subtle bg-bg-primary flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-bg-tertiary px-3 py-1.5 rounded-lg border border-border-subtle shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></span>
                  <span className="text-sm font-medium text-text-secondary">
                    Đã chọn: <span className="text-text-primary font-bold">{selectedIds.size}</span>
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-text-muted hover:text-status-danger transition-colors font-medium">
                    Bỏ chọn
                  </button>
                )}
              </div>
              <div className="flex items-center bg-bg-tertiary p-1 rounded-xl border border-border-subtle shadow-sm">
                <button 
                  onClick={generateContent} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-secondary hover:text-accent-primary hover:shadow-sm text-text-primary"
                >
                  <Edit3 size={16}/> Tạo Content
                </button>
                <div className="w-px h-4 bg-border-medium mx-1"></div>
                <button 
                  onClick={generateImage} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-secondary hover:text-accent-primary hover:shadow-sm text-text-primary"
                >
                  <ImageIcon size={16}/> Tạo Ảnh AI
                </button>
                <div className="w-px h-4 bg-border-medium mx-1"></div>
                <button 
                  onClick={uploadImages} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-secondary hover:text-accent-primary hover:shadow-sm text-text-primary"
                >
                  <UploadCloud size={16}/> Upload Ảnh
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <AnimatePresence>
              {isProcessing && progress.total > 0 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-3 bg-accent-primary/5 border-b border-accent-primary/20 overflow-hidden shrink-0"
                >
                  <div className="flex justify-between text-xs font-bold text-accent-primary mb-2 uppercase tracking-wider">
                    <span>{progress.task} ({progress.current}/{progress.total})</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-bg-tertiary rounded-full h-1.5 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                      className="bg-gradient-to-r from-accent-primary to-accent-secondary h-full rounded-full shadow-[0_0_10px_rgba(108,92,231,0.5)]"
                    ></motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table */}
            <div className="flex-1 overflow-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
              <div className="h-2 shrink-0"></div>
              <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                <thead className="text-xs text-text-muted uppercase tracking-wider sticky top-0 z-20 bg-bg-primary">
                  <tr>
                    <th className="p-3 w-12 text-center bg-bg-primary">
                      <input type="checkbox" 
                        className="w-4 h-4 rounded border-border-medium bg-bg-tertiary text-accent-primary focus:ring-accent-primary/50 focus:ring-offset-bg-primary transition-colors cursor-pointer"
                        checked={briefs.length > 0 && selectedIds.size === briefs.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(briefs.map(b => b.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    <th className="p-3 w-16 font-semibold bg-bg-primary">Dòng</th>
                    <th className="p-3 font-semibold bg-bg-primary">Tóm tắt Brief</th>
                    <th className="p-3 w-40 font-semibold bg-bg-primary">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {briefs.map(brief => (
                      <motion.tr 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={brief.id} 
                          className={`group cursor-pointer transition-all duration-200 ${activeBriefId === brief.id ? 'bg-bg-tertiary shadow-sm' : 'bg-bg-secondary hover:bg-bg-tertiary/50'} rounded-xl`}
                          onClick={() => setActiveBriefId(brief.id)}>
                        <td className="p-3 text-center rounded-l-xl border-y border-l border-border-subtle group-hover:border-border-medium transition-colors" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" 
                            className="w-4 h-4 rounded border-border-medium bg-bg-tertiary text-accent-primary focus:ring-accent-primary/50 focus:ring-offset-bg-primary transition-colors cursor-pointer"
                            checked={selectedIds.has(brief.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedIds);
                              if (e.target.checked) newSet.add(brief.id);
                              else newSet.delete(brief.id);
                              setSelectedIds(newSet);
                            }}
                          />
                        </td>
                        <td className="p-3 font-mono text-text-muted text-xs border-y border-border-subtle group-hover:border-border-medium transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-bg-primary border border-border-subtle flex items-center justify-center">
                            {brief.rowIndex}
                          </div>
                        </td>
                        <td className="p-3 border-y border-border-subtle group-hover:border-border-medium transition-colors">
                          <div className="font-medium text-text-primary line-clamp-1 mb-1">
                            {config.COL_BRIEFS.length > 0 ? brief.briefData[config.COL_BRIEFS[0]] || <span className="text-text-muted italic">Trống</span> : <span className="text-text-muted italic">Trống</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-secondary line-clamp-1">
                            {config.COL_BRIEFS.length > 1 && brief.briefData[config.COL_BRIEFS[1]] && (
                              <span className="truncate">{brief.briefData[config.COL_BRIEFS[1]]}</span>
                            )}
                            {config.COL_TONE && brief.tone && (
                              <span className="flex items-center gap-1 bg-accent-primary/10 text-accent-primary px-1.5 py-0.5 rounded border border-accent-primary/20 shrink-0">
                                <MessageSquare size={10} /> {brief.tone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 rounded-r-xl border-y border-r border-border-subtle group-hover:border-border-medium transition-colors">
                          <StatusBadge status={brief.status} />
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {briefs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-16 text-center">
                        <div className="flex flex-col items-center justify-center text-text-muted gap-4">
                          <div className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center border border-border-subtle">
                            <Download size={24} className="text-text-secondary" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text-primary mb-1">Chưa có dữ liệu</p>
                            <p className="text-xs">Hãy nhấn "Tải Dữ Liệu" để bắt đầu lấy dữ liệu từ Google Sheet.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview Panel Wrapper */}
          <AnimatePresence>
            {activeBriefId && (
              <motion.div 
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: isPreviewExpanded ? '100%' : '40%', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="flex flex-col bg-bg-secondary relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.2)] border-l border-border-subtle"
              >
                <PreviewPanel 
                  brief={briefs.find(b => b.id === activeBriefId)!} 
                  updateBrief={(id, updates) => setBriefs(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))}
                  onClose={() => setActiveBriefId(null)}
                  onToggleExpand={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  isExpanded={isPreviewExpanded}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Log Console */}
        <AnimatePresence>
          {isLogExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 200, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="border-t border-border-subtle bg-[#0A0A0F] flex flex-col shrink-0 relative z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.3)]"
            >
              <div className="flex justify-between items-center px-4 py-2 border-b border-border-subtle bg-[#13131A]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-status-success animate-pulse"></div>
                  <span className="font-mono font-bold text-text-secondary tracking-wider uppercase text-[10px]">System Terminal</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLogs([])} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors" title="Clear logs"><Trash2 size={14}/></button>
                  <button onClick={() => setIsLogExpanded(false)} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors" title="Close terminal"><X size={14}/></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px] scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
                <AnimatePresence>
                  {logs.map((log, i) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={i} 
                      className="flex gap-3 hover:bg-[#1C1C2A] px-2 py-1 rounded transition-colors"
                    >
                      <span className="text-text-muted shrink-0 select-none">[{log.time}]</span>
                      <span className={`${log.type === 'error' ? 'text-status-danger' : log.type === 'success' ? 'text-status-success' : 'text-accent-secondary'}`}>
                        {log.type === 'error' && <span className="mr-2">✖</span>}
                        {log.type === 'success' && <span className="mr-2">✓</span>}
                        {log.type === 'info' && <span className="mr-2">❯</span>}
                        {renderLogMessage(log.msg)}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {logs.length === 0 && (
                  <div className="text-text-muted italic px-2 py-1 flex items-center gap-2">
                    <span className="animate-pulse">_</span> System initialized. Waiting for events...
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-bg-secondary rounded-2xl shadow-2xl shadow-black/50 w-full max-w-2xl max-h-[85vh] flex flex-col border border-border-medium overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-bg-secondary shrink-0">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Settings className="text-accent-primary" size={20} />
                  Cấu hình hệ thống
                </h2>
                <button onClick={() => setShowConfig(false)} className="text-text-muted hover:text-status-danger hover:bg-status-danger/10 p-2 rounded-full transition-colors"><XCircle size={20} /></button>
              </div>
              
              <div className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent space-y-5">
                <div className="p-3 bg-accent-primary/10 border border-accent-primary/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-accent-primary shrink-0 mt-0.5" size={18} />
                  <p className="text-sm text-text-primary font-medium">
                    Khuyến nghị: Hãy thao tác và dùng web trên máy tính để đảm bảo công việc ổn định nhất.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-secondary mb-1.5">Gemini API Key</label>
                  <input type="password" value={config.GEMINI_API_KEY} onChange={e => setConfig({...config, GEMINI_API_KEY: e.target.value})} className="w-full p-2.5 bg-bg-tertiary border border-border-medium rounded-xl focus:ring-2 focus:ring-accent-primary focus:border-accent-primary transition-all outline-none text-text-primary placeholder:text-text-muted" placeholder="Nhập API Key..." />
                  <details className="mt-2 text-xs text-text-muted group">
                    <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none">
                      <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                      Cách lấy Gemini API Key?
                    </summary>
                    <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg">
                      Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-accent-primary underline">Google AI Studio</a>, đăng nhập và nhấn "Create API key" để lấy mã.
                    </div>
                  </details>
                </div>

                <div className="p-5 bg-bg-tertiary border border-border-medium rounded-xl shadow-sm">
                  <h3 className="font-bold text-text-primary mb-3 flex items-center gap-2">
                    <img src="https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png" alt="Sheets" className="w-5 h-5 drop-shadow-sm" />
                    Kết nối Google Sheet
                  </h3>
                  
                  {!accessToken ? (
                    <div className="text-sm text-text-secondary mb-4 bg-bg-secondary p-3 rounded-lg border border-border-subtle">
                      {user ? 'Phiên đăng nhập đã hết hạn quyền truy cập Google Sheet. Vui lòng đăng nhập lại.' : 'Đăng nhập bằng Google để chọn Sheet và Ghi dữ liệu trực tiếp không cần cài đặt Apps Script.'}
                      
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={handleLogin} className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-border-medium text-text-primary rounded-lg font-medium hover:border-accent-primary hover:text-accent-primary hover:shadow-sm transition-all active:scale-95">
                          <LogIn size={16} /> {user ? 'Cấp lại quyền truy cập' : 'Đăng nhập với Google'}
                        </button>
                        
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.hostname);
                            addLog(`Đã sao chép tên miền: ${window.location.hostname}`, 'info');
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-border-medium text-text-muted rounded-lg text-xs hover:text-text-primary transition-all"
                        >
                          <Copy size={14} /> Sao chép tên miền hiện tại
                        </button>
                      </div>
                      
                      <p className="mt-2 text-[10px] text-text-muted italic">
                        * Nếu gặp lỗi "unauthorized-domain", hãy sao chép tên miền trên và thêm vào "Authorized domains" trong Firebase Console.
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-status-success mb-4 flex items-center gap-1.5 font-medium bg-status-success/10 p-2.5 rounded-lg border border-status-success/20">
                      <div className="w-2 h-2 rounded-full bg-status-success animate-pulse"></div>
                      Đã kết nối tài khoản: {user?.email}
                      <button onClick={() => accessToken && fetchSpreadsheets(accessToken)} className="ml-auto text-xs text-accent-primary hover:underline">Làm mới danh sách</button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {accessToken && (
                      <div className="p-4 bg-bg-secondary border border-border-subtle rounded-xl space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                            <Search size={14} className="text-accent-primary" />
                            1. Chọn Bảng tính (Spreadsheet)
                          </label>
                          
                          {isFetchingSpreadsheets ? (
                            <div className="flex items-center gap-2 text-sm text-text-muted p-2 bg-bg-tertiary rounded-lg border border-border-subtle italic">
                              <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
                              Đang tìm kiếm trong Drive của bạn...
                            </div>
                          ) : availableSpreadsheets.length > 0 ? (
                            <div className="relative">
                              <select 
                                value={config.GOOGLE_SHEET_ID} 
                                onChange={e => setConfig({...config, GOOGLE_SHEET_ID: e.target.value})}
                                className="w-full p-2.5 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary appearance-none bg-bg-tertiary text-text-primary pr-10"
                              >
                                <option value="">-- Chọn một Bảng tính từ Drive --</option>
                                {availableSpreadsheets.map(ss => (
                                  <option key={ss.id} value={ss.id}>{ss.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-3 text-text-muted pointer-events-none" size={16} />
                            </div>
                          ) : (
                            <div className="text-xs text-status-warning p-3 bg-status-warning/10 border border-status-warning/20 rounded-lg">
                              Không tìm thấy file Google Sheet nào trong Drive. 
                              <button onClick={() => accessToken && fetchSpreadsheets(accessToken)} className="ml-2 underline font-bold">Thử lại</button>
                            </div>
                          )}
                          
                          <div className="mt-2">
                            <details className="text-xs text-text-muted group">
                              <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none">
                                <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                                Hoặc nhập ID/Link thủ công
                              </summary>
                              <input 
                                type="text" 
                                value={config.GOOGLE_SHEET_ID} 
                                onChange={e => {
                                  let val = e.target.value;
                                  const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                  if (match) val = match[1];
                                  setConfig({...config, GOOGLE_SHEET_ID: val});
                                }} 
                                className="w-full mt-2 p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary text-xs" 
                                placeholder="Dán link Google Sheet vào đây nếu không thấy trong danh sách"
                              />
                            </details>
                          </div>
                        </div>

                        {config.GOOGLE_SHEET_ID && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pt-4 border-t border-border-subtle"
                          >
                            <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                              <Layers size={14} className="text-accent-primary" />
                              2. Chọn Tab (Sheet nhỏ)
                            </label>
                            
                            {isFetchingTabs ? (
                              <div className="flex items-center gap-2 text-sm text-text-muted p-2 bg-bg-tertiary rounded-lg border border-border-subtle italic">
                                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
                                Đang lấy danh sách các tab...
                              </div>
                            ) : availableTabs.length > 0 ? (
                              <div className="relative">
                                <select 
                                  value={config.SHEET_GID} 
                                  onChange={e => setConfig({...config, SHEET_GID: e.target.value})}
                                  className="w-full p-2.5 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary appearance-none bg-bg-tertiary text-text-primary pr-10"
                                >
                                  {availableTabs.map(tab => (
                                    <option key={tab.id} value={tab.id}>{tab.title}</option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-text-muted pointer-events-none" size={16} />
                              </div>
                            ) : (
                              <button 
                                onClick={fetchTabs}
                                className="w-full p-2 bg-accent-primary/10 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/20 transition-colors text-sm font-medium"
                              >
                                Nhấn để tải danh sách Tab
                              </button>
                            )}
                          </motion.div>
                        )}
                      </div>
                    )}

                    {!accessToken && (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Google Sheet ID hoặc URL (Thủ công)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={config.GOOGLE_SHEET_ID} 
                            onChange={e => {
                              let val = e.target.value;
                              const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                              if (match) val = match[1];
                              setConfig({...config, GOOGLE_SHEET_ID: val});
                            }} 
                            className="flex-1 p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-secondary text-text-primary" 
                            placeholder="Nhập ID hoặc dán link Google Sheet"
                          />
                          <button 
                            onClick={fetchTabs} 
                            disabled={isFetchingTabs || !config.GOOGLE_SHEET_ID}
                            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-secondary disabled:opacity-50 whitespace-nowrap transition-colors"
                          >
                            {isFetchingTabs ? 'Đang tải...' : 'Lấy Tab'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Google Apps Script Web App URL</label>
                <input type="text" value={config.GAS_WEB_APP_URL} onChange={e => setConfig({...config, GAS_WEB_APP_URL: e.target.value})} className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary" placeholder="https://script.google.com/macros/s/.../exec" />
                <details className="mt-2 text-xs text-text-muted group">
                  <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none">
                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                    Cách lấy GAS Web App URL?
                  </summary>
                  <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg">
                    Xem hướng dẫn chi tiết ở phần "Hướng dẫn tạo Google Apps Script Web App" phía dưới cùng.
                  </div>
                </details>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">ImgBB API Key</label>
                <input type="password" value={config.IMGBB_API_KEY} onChange={e => setConfig({...config, IMGBB_API_KEY: e.target.value})} className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary" />
                <details className="mt-2 text-xs text-text-muted group">
                  <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none">
                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                    Cách lấy ImgBB API Key?
                  </summary>
                  <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg">
                    Đăng ký tài khoản tại <a href="https://api.imgbb.com/" target="_blank" rel="noreferrer" className="text-accent-primary underline">ImgBB API</a> và tạo API key để tải ảnh lên.
                  </div>
                </details>
              </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Knowledge Base (Kiến thức chuyên ngành)</label>
                  <textarea value={config.KNOWLEDGE_BASE} onChange={e => setConfig({...config, KNOWLEDGE_BASE: e.target.value})} className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary h-24 font-mono text-sm bg-bg-tertiary text-text-primary" />
                </div>
                
                <details className="mt-4 p-4 bg-bg-tertiary border border-border-medium rounded-lg text-sm text-text-secondary group">
                  <summary className="font-bold text-text-primary cursor-pointer flex items-center justify-between">
                    Hướng dẫn tạo Google Apps Script Web App
                    <ChevronDown size={16} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-3">
                    <ol className="list-decimal pl-5 space-y-1 mb-3">
                      <li>Mở Google Sheet của bạn, chọn <strong className="text-text-primary">Extensions &gt; Apps Script</strong>.</li>
                      <li>Xóa code cũ và dán đoạn code bên dưới vào.</li>
                      <li>Nhấn <strong className="text-text-primary">Deploy &gt; New deployment</strong>.</li>
                      <li>Chọn type là <strong className="text-text-primary">Web app</strong>.</li>
                      <li>Execute as: <strong className="text-text-primary">Me</strong>. Who has access: <strong className="text-text-primary">Anyone</strong>.</li>
                      <li>Nhấn Deploy, copy <strong className="text-text-primary">Web app URL</strong> và dán vào ô cấu hình bên trên.</li>
                    </ol>
                    <pre className="bg-[#0A0A0F] text-text-primary p-3 rounded overflow-x-auto text-xs font-mono border border-border-subtle">
{`function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.openById(payload.sheetId || "${config.GOOGLE_SHEET_ID}");
  var tab = sheet.getSheets().find(s => s.getSheetId() == (payload.tabId || ${config.SHEET_GID}));
  var data = payload.data;
  
  var headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
  var contentColIdx = headers.indexOf(payload.contentCol) + 1;
  var imageColIdx = headers.indexOf(payload.imageCol) + 1;

  data.forEach(function(item) {
    if (contentColIdx > 0 && item.content) {
      tab.getRange(item.rowIndex, contentColIdx).setValue(item.content);
    }
    if (imageColIdx > 0 && item.imageUrl) {
      tab.getRange(item.rowIndex, imageColIdx).setValue(item.imageUrl);
    }
  });

  return ContentService.createTextOutput(JSON.stringify({status: "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput("App Script is running");
}`}
                    </pre>
                  </div>
                </details>
              </div>

              <div className="px-6 py-4 border-t border-border-subtle bg-bg-tertiary flex justify-end shrink-0">
                <button onClick={async () => {
                  setShowConfig(false);
                  if (user) {
                    try {
                      await setDoc(doc(db, 'userConfigs', user.uid), config, { merge: true });
                      addLog('Đã lưu cấu hình vào database.', 'success');
                    } catch (error: any) {
                      console.error("Error saving config:", error);
                      addLog('Lỗi khi lưu cấu hình vào database.', 'error');
                      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
                        handleFirestoreError(error, OperationType.WRITE, `userConfigs/${user.uid}`);
                      }
                    }
                  }
                }} className="btn-primary">Lưu Cấu Hình</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
