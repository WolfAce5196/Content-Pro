import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from '@google/genai';
import { Settings, Download, Edit3, Image as ImageIcon, UploadCloud, Save, XCircle, Trash2, LogIn, LogOut, ChevronDown, ChevronLeft, ChevronRight, FileText, MessageSquare, Menu, LayoutPanelLeft, Maximize2, Minimize2, Terminal, ChevronUp, CheckCircle2, AlertCircle, Loader2, Play, Database, CheckSquare, Square, PanelRightClose, PanelRightOpen, X, Search, Layers, Copy, BookOpen, ExternalLink, History, Upload, Info, Plus, Link } from 'lucide-react';
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
  GOOGLE_SHEET_ID: "",
  SHEET_GID: "",
  GAS_WEB_APP_URL: "",
  IMGBB_API_KEY: "",
  KNOWLEDGE_BASE_TEXT: "",
  KNOWLEDGE_BASE_LINKS: [""],
  KNOWLEDGE_BASE_FILES: [] as { name: string; type: string; data: string; size: string }[],
  COL_BRIEFS: ["Tóm Tắt", "Ghi chú"],
  COL_TONE: "",
  COL_CONTENT: "Content chi tiết",
  COL_IMAGE: "Link Ảnh/Video"
};

interface HistoryItem {
  id: string;
  content: string;
  imageUrl: string;
  imageBase64?: string;
  timestamp: string;
  status: string;
  statusDetail?: string;
}

interface Brief {
  id: string;
  rowIndex: number;
  rawData: Record<string, string>;
  briefData: Record<string, string>;
  tone?: string;
  content: string;
  imageUrl: string;
  imageBase64?: string;
  status: 'pending' | 'content_generated' | 'image_generated' | 'video_generated' | 'uploaded' | 'saved' | 'error';
  statusDetail?: string;
  // New fields
  briefMedia?: string;
  mediaFormat?: 'Ảnh' | 'Video';
  mediaSize?: string;
  mediaReference?: string; // Link or base64
  history: HistoryItem[];
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

const PreviewPanel = ({ brief, updateBrief, onClose, onToggleExpand, isExpanded, addLog, setPreviewMedia }: { brief: Brief, updateBrief: (id: string, updates: Partial<Brief>) => void, onClose: () => void, onToggleExpand: () => void, isExpanded: boolean, addLog: (msg: string, type?: 'info'|'error'|'success') => void, setPreviewMedia: (media: { url: string, type: 'image' | 'video' } | null) => void }) => {
  const [activeTab, setActiveTab] = useState<'content' | 'image' | 'history'>('content');

  const mediaSizes = {
    'Ảnh': ['1:1', '4:3', '3:4', '16:9', '9:16'],
    'Video': ['16:9', '9:16']
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateBrief(brief.id, { mediaReference: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

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

      <div className="px-6 pt-4 border-b border-border-subtle bg-bg-secondary overflow-y-auto max-h-[40%] scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
        <div className="space-y-4 mb-6">
          {/* Original Brief Data */}
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(brief.briefData).map(([key, value]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 text-sm">
                <span className="font-medium text-text-secondary w-32 shrink-0">{key}:</span>
                <span className="text-text-primary">{value || <span className="text-text-muted italic">Trống</span>}</span>
              </div>
            ))}
          </div>

          {/* New Media Fields */}
          <div className="pt-4 border-t border-border-subtle/50 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Brief Media (Mô tả ảnh/video)</label>
              <textarea 
                value={brief.briefMedia || ''} 
                onChange={e => updateBrief(brief.id, { briefMedia: e.target.value })}
                className="w-full p-2.5 bg-bg-tertiary border border-border-medium rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent-primary outline-none min-h-[80px]"
                placeholder="Nhập mô tả, mong muốn để AI tạo ảnh/video..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Định dạng</label>
                <select 
                  value={brief.mediaFormat || 'Ảnh'} 
                  onChange={e => updateBrief(brief.id, { mediaFormat: e.target.value as any, mediaSize: mediaSizes[e.target.value as keyof typeof mediaSizes][0] })}
                  className="w-full p-2.5 bg-bg-tertiary border border-border-medium rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent-primary outline-none"
                >
                  <option value="Ảnh">Ảnh</option>
                  <option value="Video">Video</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Kích thước</label>
                <select 
                  value={brief.mediaSize || '1:1'} 
                  onChange={e => updateBrief(brief.id, { mediaSize: e.target.value })}
                  className="w-full p-2.5 bg-bg-tertiary border border-border-medium rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent-primary outline-none"
                >
                  {mediaSizes[brief.mediaFormat || 'Ảnh'].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Tham chiếu media</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={brief.mediaReference?.startsWith('data:') ? 'Đã tải ảnh lên' : (brief.mediaReference || '')} 
                  onChange={e => updateBrief(brief.id, { mediaReference: e.target.value })}
                  className="flex-1 p-2.5 bg-bg-tertiary border border-border-medium rounded-xl text-sm text-text-primary focus:ring-2 focus:ring-accent-primary outline-none"
                  placeholder="Dán link ảnh mẫu..."
                />
                <label className="p-2.5 bg-bg-tertiary border border-border-medium rounded-xl text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 cursor-pointer transition-all">
                  <UploadCloud size={18} />
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              </div>
              <p className="text-[10px] text-text-muted italic">Tải ảnh hoặc link ảnh lên để làm mẫu thiết kế</p>
            </div>
          </div>
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
              <ImageIcon size={16} /> Ảnh/Video
            </div>
            {activeTab === 'image' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'history' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <div className="flex items-center gap-2">
              <History size={16} /> Lịch sử
            </div>
            {activeTab === 'history' && (
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
          ) : activeTab === 'image' ? (
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
                    <img 
                      src={`data:image/jpeg;base64,${brief.imageBase64}`} 
                      alt="AI Generated" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in" 
                      onClick={() => setPreviewMedia({ url: `data:image/jpeg;base64,${brief.imageBase64}`, type: 'image' })}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm pointer-events-none">
                      <span className="text-white font-medium flex items-center gap-2"><Maximize2 size={16}/> Click to view full</span>
                    </div>
                  </>
                ) : brief.imageUrl ? (
                  <>
                    <img 
                      src={brief.imageUrl} 
                      alt="Uploaded" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in" 
                      onClick={() => setPreviewMedia({ url: brief.imageUrl, type: brief.mediaFormat === 'Video' ? 'video' : 'image' })}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm pointer-events-none">
                      <span className="text-white font-medium flex items-center gap-2"><Maximize2 size={16}/> Click to view full</span>
                    </div>
                  </>
                ) : (
                  <div className="text-text-muted flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center border border-border-subtle">
                      <ImageIcon size={24} className="text-text-secondary" />
                    </div>
                    <span className="text-sm font-medium">Chưa có ảnh/video</span>
                  </div>
                )}
              </div>
              
              <div className="w-full max-w-md mx-auto">
                {brief.imageUrl ? (
                  <div className="bg-bg-tertiary p-4 rounded-xl border border-border-medium">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5"><UploadCloud size={14}/> Link media public</label>
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
                    Media sẽ xuất hiện ở đây sau khi tạo hoặc upload.
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col gap-4"
            >
              {brief.history.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4 border border-dashed border-border-medium rounded-xl p-8">
                  <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                    <History size={24} className="text-text-secondary" />
                  </div>
                  <p className="text-sm">Chưa có lịch sử làm việc</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {brief.history.map((item) => (
                    <div key={item.id} className="bg-bg-tertiary border border-border-medium rounded-xl p-4 space-y-3 hover:border-accent-primary/30 transition-all group">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-text-muted uppercase bg-bg-secondary px-2 py-0.5 rounded border border-border-subtle">
                            {new Date(item.timestamp).toLocaleString('vi-VN')}
                          </span>
                          <span className="text-xs font-medium text-accent-primary">{item.statusDetail}</span>
                        </div>
                        <button 
                          onClick={() => {
                            updateBrief(brief.id, {
                              content: item.content,
                              imageUrl: item.imageUrl,
                              imageBase64: item.imageBase64,
                              status: item.status as any,
                              statusDetail: item.statusDetail
                            });
                            addLog(`Đã khôi phục phiên bản từ ${new Date(item.timestamp).toLocaleString('vi-VN')}`, 'success');
                          }}
                          className="text-xs text-accent-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Khôi phục
                        </button>
                      </div>
                      <p className="text-sm text-text-primary line-clamp-3 italic">"{item.content}"</p>
                      {item.imageUrl && (
                        <img src={item.imageUrl} className="w-20 h-20 object-cover rounded-lg border border-border-subtle" alt="History" />
                      )}
                    </div>
                  ))}
                </div>
              )}
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
  const [showGuide, setShowGuide] = useState(false);
  const [showComponentDesc, setShowComponentDesc] = useState(false);
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

  const updateBriefField = (id: string, field: keyof Brief, value: any) => {
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const handleMediaUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      updateBriefField(id, 'mediaReference', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleKnowledgeFileUpload = async (files: FileList | null) => {
    if (!files) return;
    
    const newFiles = [...config.KNOWLEDGE_BASE_FILES];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      const filePromise = new Promise<{ name: string; type: string; data: string; size: string }>((resolve) => {
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve({
            name: file.name,
            type: file.type,
            data: result,
            size: (file.size / 1024).toFixed(1) + ' KB'
          });
        };
        
        // For images and PDFs, read as DataURL (base64)
        // For others, we can try reading as text if we want to extract content, 
        // but for now, base64 is safer for multimodal Gemini
        reader.readAsDataURL(file);
      });
      
      const fileData = await filePromise;
      newFiles.push(fileData);
    }
    
    setConfig({ ...config, KNOWLEDGE_BASE_FILES: newFiles });
    addLog(`Đã tải lên ${files.length} tài liệu vào Knowledge Base.`, 'success');
  };

  const removeKnowledgeFile = (index: number) => {
    const newFiles = [...config.KNOWLEDGE_BASE_FILES];
    newFiles.splice(index, 1);
    setConfig({ ...config, KNOWLEDGE_BASE_FILES: newFiles });
  };

  const addKnowledgeLink = () => {
    setConfig({ ...config, KNOWLEDGE_BASE_LINKS: [...config.KNOWLEDGE_BASE_LINKS, ""] });
  };

  const updateKnowledgeLink = (index: number, value: string) => {
    const newLinks = [...config.KNOWLEDGE_BASE_LINKS];
    newLinks[index] = value;
    setConfig({ ...config, KNOWLEDGE_BASE_LINKS: newLinks });
  };

  const removeKnowledgeLink = (index: number) => {
    const newLinks = [...config.KNOWLEDGE_BASE_LINKS];
    newLinks.splice(index, 1);
    setConfig({ ...config, KNOWLEDGE_BASE_LINKS: newLinks.length === 0 ? [""] : newLinks });
  };

  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // New states for enhancements
  const [filterTab, setFilterTab] = useState<'all' | 'done' | 'pending' | 'incomplete'>('all');
  const [historyBriefId, setHistoryBriefId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

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

  // History Modal Component
  const HistoryModal = () => {
    if (!historyBriefId) return null;
    const brief = briefs.find(b => b.id === historyBriefId);
    if (!brief) return null;

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={() => setHistoryBriefId(null)}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-bg-secondary w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-border-subtle overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-bg-primary shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                <History size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Lịch sử phiên bản</h2>
                <p className="text-xs text-text-muted">Brief dòng {brief.rowIndex}</p>
              </div>
            </div>
            <button onClick={() => setHistoryBriefId(null)} className="p-2 hover:bg-bg-tertiary rounded-full transition-colors text-text-muted">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
            {brief.history && brief.history.length > 0 ? (
              <div className="space-y-4">
                {brief.history.slice().reverse().map((item, idx) => (
                  <div key={item.id} className="p-4 bg-bg-tertiary rounded-2xl border border-border-subtle hover:border-accent-primary/50 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-accent-primary bg-accent-primary/10 px-2 py-1 rounded">v{brief.history.length - idx}</span>
                        <span className="text-xs text-text-muted">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <button 
                        onClick={() => {
                          updateBriefField(brief.id, 'content', item.content);
                          updateBriefField(brief.id, 'imageUrl', item.imageUrl);
                          updateBriefField(brief.id, 'imageBase64', item.imageBase64 || '');
                          addLog(`Đã khôi phục phiên bản v${brief.history.length - idx} cho brief dòng ${brief.rowIndex}`, 'success');
                          setHistoryBriefId(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary text-white text-xs font-bold rounded-lg hover:bg-accent-primary/80 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                      >
                        <Save size={12} /> Khôi phục
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Content</h4>
                        <div className="p-3 bg-bg-primary rounded-xl border border-border-subtle text-xs text-text-primary line-clamp-4 font-mono">
                          {item.content}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Media</h4>
                        <div className="aspect-video bg-bg-primary rounded-xl border border-border-subtle overflow-hidden relative">
                          {item.imageBase64 ? (
                            <img src={`data:image/jpeg;base64,${item.imageBase64}`} alt="History" className="w-full h-full object-cover" />
                          ) : item.imageUrl ? (
                            <img src={item.imageUrl} alt="History" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-muted">
                              <ImageIcon size={20} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-4">
                <History size={48} className="opacity-20" />
                <p className="text-sm">Chưa có lịch sử phiên bản cho brief này.</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  };

  // Media Preview Modal Component
  const MediaPreviewModal = () => {
    if (!previewMedia) return null;

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
        onClick={() => setPreviewMedia(null)}
      >
        <button 
          onClick={() => setPreviewMedia(null)}
          className="absolute top-6 right-6 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
        >
          <X size={32} />
        </button>

        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-6xl h-full flex items-center justify-center"
          onClick={e => e.stopPropagation()}
        >
          {previewMedia.type === 'image' ? (
            <img 
              src={previewMedia.url} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
            />
          ) : (
            <video 
              src={previewMedia.url} 
              controls 
              autoPlay 
              className="max-w-full max-h-full shadow-2xl rounded-lg"
            />
          )}
        </motion.div>
      </motion.div>
    );
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
        setIsDataLoading(true);
        try {
          // Load Config
          const configRef = doc(db, 'userConfigs', currentUser.uid);
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const loadedConfig = configSnap.data();
            setConfig(prev => ({ ...prev, ...loadedConfig }));
            addLog('Đã tải cấu hình từ database.', 'success');
            if (loadedConfig.GEMINI_API_KEY && loadedConfig.GOOGLE_SHEET_ID) {
              setShowConfig(false);
            }
          }

          // Load Briefs and Logs
          const dataRef = doc(db, 'userData', currentUser.uid);
          const dataSnap = await getDoc(dataRef);
          if (dataSnap.exists()) {
            const data = dataSnap.data();
            if (data.briefs) setBriefs(data.briefs);
            if (data.logs) setLogs(data.logs);
            addLog('Đã khôi phục phiên làm việc trước đó.', 'success');
          }
        } catch (error: any) {
          console.error("Error loading data:", error);
          if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
            handleFirestoreError(error, OperationType.GET, `userData/${currentUser.uid}`);
          }
        } finally {
          setIsConfigLoading(false);
          setIsDataLoading(false);
        }
      } else {
        setShowConfig(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-reconnect Google Sheets if user is logged in
  useEffect(() => {
    const tryReconnect = async () => {
      if (user && !accessToken) {
        // We don't force a popup here because it's intrusive, 
        // but we can try to get the redirect result or just wait for user action.
        // However, the user wants "automatic" connection.
        // If they are already logged in with Google, we can try to trigger the login flow
        // but it will likely show a popup. 
        // For now, we'll ensure that if they HAVE a token, we fetch spreadsheets.
      }
    };
    tryReconnect();
  }, [user]);

  // If we have an access token, always fetch spreadsheets to keep list updated
  useEffect(() => {
    if (accessToken) {
      fetchSpreadsheets(accessToken);
    }
  }, [accessToken]);

  // Auto-save briefs and logs
  useEffect(() => {
    if (user && briefs.length > 0) {
      const saveData = async () => {
        try {
          await setDoc(doc(db, 'userData', user.uid), {
            briefs,
            logs: logs.slice(0, 50), // Only save last 50 logs to avoid size limits
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error("Error auto-saving data:", error);
        }
      };
      const timer = setTimeout(saveData, 3000); // Debounce save
      return () => clearTimeout(timer);
    }
  }, [briefs, logs, user]);
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
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)&orderBy=modifiedTime desc`, {
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
      const briefMediaIdx = headers.findIndex(h => h.toLowerCase().includes('brief media'));
      
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
          status: existingBrief ? existingBrief.status : 'pending',
          statusDetail: existingBrief ? existingBrief.statusDetail : 'Chưa xử lý',
          briefMedia: existingBrief && existingBrief.briefMedia ? existingBrief.briefMedia : (briefMediaIdx !== -1 ? (row[briefMediaIdx] || '') : ''),
          mediaFormat: existingBrief ? existingBrief.mediaFormat : 'Ảnh',
          mediaSize: existingBrief ? existingBrief.mediaSize : '1:1',
          mediaReference: existingBrief ? existingBrief.mediaReference : '',
          history: existingBrief ? existingBrief.history : []
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
    
    const missingConfigs = [];
    if (!config.GEMINI_API_KEY) missingConfigs.push("Gemini API Key");
    if (!config.GOOGLE_SHEET_ID) missingConfigs.push("ID Google Sheet");
    if (!config.SHEET_GID) missingConfigs.push("Tab Sheet (GID)");
    if (!config.COL_BRIEFS || config.COL_BRIEFS.length === 0) missingConfigs.push("Cột Brief (Đầu vào)");
    if (!config.COL_CONTENT) missingConfigs.push("Cột Content (Đầu ra)");

    if (missingConfigs.length > 0) {
      addLog(`Thiếu cấu hình để tạo Content: ${missingConfigs.join(", ")}. Vui lòng kiểm tra lại mục Cấu hình hệ thống.`, 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Content' });
    
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds).map(id => briefs.find(b => b.id === id)).filter(Boolean) as Brief[];

    await Promise.all(selectedBriefs.map(async (brief) => {
      try {
        addLog(`Đang tạo content cho dòng ${brief.rowIndex}...`, 'info');
        
        const briefText = Object.entries(brief.briefData)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n');

        const toneInstruction = brief.tone ? `- Giọng điệu yêu cầu: ${brief.tone}` : '- Giọng điệu theo đúng yêu cầu trong Ghi chú (nếu có)';

        const knowledgeBaseLinks = config.KNOWLEDGE_BASE_LINKS.filter(l => l.trim() !== "").map(l => `- ${l}`).join('\n');
        const knowledgeBaseText = config.KNOWLEDGE_BASE_TEXT || "";
        
        const knowledgeBasePrompt = `
KIẾN THỨC CHUYÊN NGÀNH:
${knowledgeBaseText}
${knowledgeBaseLinks ? `\nTÀI LIỆU THAM KHẢO (LINKS):\n${knowledgeBaseLinks}` : ""}
`;

        const prompt = `Bạn là chuyên gia viết content marketing.

${knowledgeBasePrompt}

BRIEF:
${briefText}

YÊU CẦU:
- Viết content chi tiết, hấp dẫn, phù hợp với brief
- Sử dụng kiến thức chuyên ngành đã cung cấp (bao gồm cả văn bản, liên kết và tài liệu đính kèm), KHÔNG bịa thông tin
${toneInstruction}
- Độ dài: 150-500 từ (trừ khi brief yêu cầu khác)
- Xuất content dạng text thuần, không dùng markdown
- BẮT BUỘC: Viết bằng tiếng Việt có dấu.`;

        // Prepare parts for multimodal input
        const parts: any[] = [{ text: prompt }];
        
        // Add files to parts
        config.KNOWLEDGE_BASE_FILES.forEach(file => {
          if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            parts.push({
              inlineData: {
                data: file.data.split(',')[1], // Remove data:mime;base64,
                mimeType: file.type
              }
            });
          } else {
            parts.push({ text: `\nNỘI DUNG TÀI LIỆU (${file.name}):\n${file.data.substring(0, 50000)}` });
          }
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: [{ parts }],
        });
        
        const content = response.text || '';
        
        setBriefs(prev => prev.map(b => {
          if (b.id === brief.id) {
            const newHistoryItem: HistoryItem = {
              id: Math.random().toString(36).substr(2, 9),
              content,
              imageUrl: b.imageUrl,
              imageBase64: b.imageBase64,
              timestamp: new Date().toISOString(),
              status: 'content_generated',
              statusDetail: 'Đã tạo content'
            };
            return { 
              ...b, 
              content, 
              status: 'content_generated', 
              statusDetail: 'Đã tạo content',
              history: [newHistoryItem, ...b.history]
            };
          }
          return b;
        }));
        addLog(`Đã tạo content cho dòng ${brief.rowIndex}.`, 'success');
      } catch (err: any) {
        addLog(`Lỗi tạo content dòng ${brief.rowIndex}: ${err.message}`, 'error');
        setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error' } : b));
      } finally {
        count++;
        setProgress(p => ({ ...p, current: count }));
      }
    }));
    
    setIsProcessing(false);
  };

  const generateImage = async () => {
    if (selectedIds.size === 0) return;
    
    const missingConfigs = [];
    if (!config.GEMINI_API_KEY) missingConfigs.push("Gemini API Key");
    if (!config.COL_IMAGE) missingConfigs.push("Cột Link Ảnh (Đầu ra)");

    if (missingConfigs.length > 0) {
      addLog(`Thiếu cấu hình để tạo Media AI: ${missingConfigs.join(", ")}. Vui lòng kiểm tra lại mục Cấu hình hệ thống.`, 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Media AI' });
    
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds).map(id => briefs.find(b => b.id === id)).filter(Boolean) as Brief[];

    await Promise.all(selectedBriefs.map(async (brief) => {
      try {
        if (brief.mediaFormat === 'Video') {
          addLog(`Đang tạo Video cho dòng ${brief.rowIndex}...`, 'info');
          
          const videoPrompt = `Tạo video minh họa dựa trên các thông tin sau:
TÓM TẮT BRIEF: ${Object.entries(brief.briefData).map(([k, v]) => `${k}: ${v}`).join(', ')}
MÔ TẢ MEDIA: ${brief.briefMedia || 'Tự động sáng tạo dựa trên brief'}
CONTENT CHI TIẾT: ${brief.content || ''}`;

          let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: videoPrompt,
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: brief.mediaSize === '16:9' ? '16:9' : '9:16'
            }
          });

          while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
          }

          const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
          if (downloadLink) {
            const videoUrl = `${downloadLink}?x-goog-api-key=${config.GEMINI_API_KEY}`;
            
            setBriefs(prev => prev.map(b => {
              if (b.id === brief.id) {
                const newHistoryItem: HistoryItem = {
                  id: Math.random().toString(36).substr(2, 9),
                  content: b.content,
                  imageUrl: videoUrl,
                  timestamp: new Date().toISOString(),
                  status: 'image_generated',
                  statusDetail: 'Đã tạo Video AI'
                };
                return { 
                  ...b, 
                  imageUrl: videoUrl, 
                  status: 'image_generated',
                  statusDetail: 'Đã tạo Video AI',
                  history: [newHistoryItem, ...b.history]
                };
              }
              return b;
            }));
            addLog(`Đã tạo Video cho dòng ${brief.rowIndex} thành công.`, 'success');
          }
        } else {
          addLog(`Đang tạo prompt ảnh cho dòng ${brief.rowIndex}...`, 'info');
          
          const promptResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Bạn là chuyên gia thiết kế hình ảnh và video marketing.
Nhiệm vụ của bạn là tạo ra một PROMPT chi tiết để AI có thể tạo ra hình ảnh/video chất lượng cao nhất.

THÔNG TIN ĐẦU VÀO:
- TÓM TẮT BRIEF: ${Object.entries(brief.briefData).map(([k, v]) => `${k}: ${v}`).join(', ')}
- MÔ TẢ MEDIA: ${brief.briefMedia || 'Tự động sáng tạo dựa trên brief'}
- CONTENT CHI TIẾT: ${brief.content || 'Nội dung bài viết đi kèm'}
- ĐỊNH DẠNG: Ảnh
- TỈ LỆ: ${brief.mediaSize || '1:1'}

YÊU CẦU PROMPT:
1. Mô tả chi tiết về bối cảnh, ánh sáng, góc chụp.
2. Mô tả về đối tượng chính, màu sắc chủ đạo, phong cách.
3. Nếu là Video: Mô tả chuyển động.
4. KHÔNG bao gồm các từ nhạy cảm hoặc bị cấm.
5. Xuất kết quả là PROMPT TIẾNG ANH.
6. BẮT BUỘC: Phần giải thích ý tưởng phải viết bằng tiếng Việt có dấu.`
          });
          
          const imagePrompt = promptResponse.text || 'A beautiful photorealistic image';
          addLog(`Đang sinh ảnh cho dòng ${brief.rowIndex}...`, 'info');
          
          const parts: any[] = [];
          
          if (brief.mediaReference) {
            if (brief.mediaReference.startsWith('data:')) {
              const base64Data = brief.mediaReference.split(',')[1];
              const mimeType = brief.mediaReference.split(';')[0].split(':')[1];
              parts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              });
              parts.push({ text: "Dựa vào phong cách và bố cục của ảnh mẫu này," });
            } else {
              parts.push({ text: `Dựa vào phong cách của ảnh mẫu tại link này: ${brief.mediaReference}.` });
            }
          }

          parts.push({ text: imagePrompt });

          const imageResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: { parts },
            config: {
              imageConfig: {
                aspectRatio: (brief.mediaSize || "1:1") as any,
                imageSize: "1K"
              }
            }
          });
          
          const base64Data = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
          
          if (base64Data) {
            setBriefs(prev => prev.map(b => {
              if (b.id === brief.id) {
                const newHistoryItem: HistoryItem = {
                  id: Math.random().toString(36).substr(2, 9),
                  content: b.content,
                  imageUrl: b.imageUrl,
                  imageBase64: base64Data,
                  timestamp: new Date().toISOString(),
                  status: 'image_generated',
                  statusDetail: 'Đã tạo ảnh AI'
                };
                return { 
                  ...b, 
                  imageBase64: base64Data, 
                  status: 'image_generated',
                  statusDetail: 'Đã tạo ảnh AI',
                  history: [newHistoryItem, ...b.history]
                };
              }
              return b;
            }));
            addLog(`Đã tạo ảnh cho dòng ${brief.rowIndex} thành công.`, 'success');
          } else {
            throw new Error('Không nhận được dữ liệu ảnh từ API.');
          }
        }
      } catch (err: any) {
        addLog(`Lỗi tạo Media dòng ${brief.rowIndex}: ${err.message}`, 'error');
        setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error' } : b));
      } finally {
        count++;
        setProgress(p => ({ ...p, current: count }));
      }
    }));
    
    setIsProcessing(false);
  };

  const uploadImages = async () => {
    if (selectedIds.size === 0) return;
    
    const missingConfigs = [];
    if (!config.IMGBB_API_KEY) missingConfigs.push("ImgBB API Key");
    if (!config.COL_IMAGE) missingConfigs.push("Cột Link Ảnh (Đầu ra)");

    if (missingConfigs.length > 0) {
      addLog(`Thiếu cấu hình để Upload ảnh: ${missingConfigs.join(", ")}. Vui lòng kiểm tra lại mục Cấu hình hệ thống.`, 'error');
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
        const briefMediaColIdx = sheetHeaders.indexOf(config.COL_BRIEF_MEDIA);
        const mediaFormatColIdx = sheetHeaders.indexOf(config.COL_MEDIA_FORMAT);
        const mediaRefColIdx = sheetHeaders.indexOf(config.COL_MEDIA_REF);
        
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
          if (brief.briefMedia && briefMediaColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(briefMediaColIdx)}${brief.rowIndex}`,
              values: [[brief.briefMedia]]
            });
          }
          if (brief.mediaFormat && mediaFormatColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(mediaFormatColIdx)}${brief.rowIndex}`,
              values: [[brief.mediaFormat]]
            });
          }
          if (brief.mediaReference && mediaRefColIdx !== -1 && !brief.mediaReference.startsWith('data:')) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(mediaRefColIdx)}${brief.rowIndex}`,
              values: [[brief.mediaReference]]
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
        setBriefs(prev => prev.map(b => selectedIds.has(b.id) ? { ...b, status: 'saved', statusDetail: 'Hoàn Thành' } : b));
        
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
            imageUrl: brief.imageUrl || '',
            briefMedia: brief.briefMedia || '',
            mediaFormat: brief.mediaFormat || 'Ảnh',
            mediaReference: brief.mediaReference || ''
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
          briefMediaCol: config.COL_BRIEF_MEDIA,
          mediaFormatCol: config.COL_MEDIA_FORMAT,
          mediaRefCol: config.COL_MEDIA_REF,
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
          setBriefs(prev => prev.map(b => selectedIds.has(b.id) ? { ...b, status: 'saved', statusDetail: 'Hoàn Thành' } : b));
        } else {
          throw new Error(result.message || 'GAS trả về lỗi');
        }
      }
    } catch (err: any) {
      addLog(`Lỗi khi lưu về Sheet: ${err.message}`, 'error');
    }
    
    setIsProcessing(false);
  };

  const filteredBriefs = briefs.filter(brief => {
    if (filterTab === 'all') return true;
    if (filterTab === 'done') return brief.status === 'saved' || brief.statusDetail === 'Hoàn Thành';
    if (filterTab === 'pending') return brief.status === 'pending' || brief.statusDetail === 'Chưa Xử Lý';
    if (filterTab === 'incomplete') return brief.status !== 'saved' && brief.statusDetail !== 'Hoàn Thành';
    return true;
  });

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
              {!isSidebarCollapsed && <span>Cấu Hình Hệ Thống</span>}
            </button>
            <button onClick={() => setIsLogExpanded(!isLogExpanded)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isLogExpanded ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
              <Terminal size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Hệ Thống Logs</span>}
            </button>
            <button onClick={() => setShowGuide(true)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${showGuide ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
              <BookOpen size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Tài Liệu Hướng Dẫn</span>}
            </button>
            <button onClick={() => setShowComponentDesc(true)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${showComponentDesc ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
              <Info size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Mô Tả Thành Phần</span>}
            </button>
          </div>

          {/* Column Config */}
          {!isSidebarCollapsed && (
            <div className="space-y-4 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Cấu Hình Cột</h3>
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
                  <label className="text-xs font-medium text-text-secondary">Cột Brief (Đầu Vào)</label>
                  <MultiSelectDropdown options={availableHeaders} selected={config.COL_BRIEFS || []} onChange={(val: string[]) => setConfig({...config, COL_BRIEFS: val})} label="Chọn Cột..." icon={FileText} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Giọng Điệu Content</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_TONE || ''} onChange={(val: string) => setConfig({...config, COL_TONE: val})} label="Chọn Cột..." icon={MessageSquare} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Cột Content (Đầu Ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_CONTENT} onChange={(val: string) => setConfig({...config, COL_CONTENT: val})} label="Chọn Cột..." icon={Edit3} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Cột Link Ảnh (Đầu Ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_IMAGE} onChange={(val: string) => setConfig({...config, COL_IMAGE: val})} label="Chọn Cột..." icon={ImageIcon} />
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
                  <Layers size={14} /> Kết Nối Google Sheet
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
            
            <div className="h-6 w-px bg-border-medium mx-2"></div>
            <div className="flex items-center gap-3">
              {/* Spreadsheet Selection */}
              <div className="flex items-center gap-2 bg-bg-secondary rounded-lg px-3 py-1.5 border border-border-subtle">
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">File:</span>
                <div className="relative">
                  <select 
                    value={config.GOOGLE_SHEET_ID} 
                    disabled={!accessToken}
                    onChange={async e => {
                      const newId = e.target.value;
                      const newConfig = {...config, GOOGLE_SHEET_ID: newId, SHEET_GID: ""};
                      setConfig(newConfig);
                      if (user) {
                        try {
                          await setDoc(doc(db, 'userConfigs', user.uid), newConfig, { merge: true });
                        } catch (error: any) {
                          console.error("Error saving config:", error);
                        }
                      }
                    }}
                    className="bg-transparent text-sm text-text-primary outline-none cursor-pointer appearance-none pr-5 font-medium hover:text-accent-primary transition-colors max-w-[180px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-bg-secondary text-text-primary">
                      {!accessToken ? "-- Chưa đăng nhập --" : "-- Chọn File --"}
                    </option>
                    {availableSpreadsheets.map(ss => (
                      <option key={ss.id} value={ss.id} className="bg-bg-secondary text-text-primary">{ss.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1 text-text-muted pointer-events-none" size={14} />
                </div>
              </div>

              {/* Tab Selection */}
              <div className="flex items-center gap-2 bg-bg-secondary rounded-lg px-3 py-1.5 border border-border-subtle">
                <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Sheet:</span>
                <div className="relative">
                  <select 
                    value={config.SHEET_GID} 
                    disabled={!config.GOOGLE_SHEET_ID || availableTabs.length === 0}
                    onChange={async e => {
                      const newConfig = {...config, SHEET_GID: e.target.value};
                      setConfig(newConfig);
                      if (user) {
                        try {
                          await setDoc(doc(db, 'userConfigs', user.uid), newConfig, { merge: true });
                        } catch (error: any) {
                          console.error("Error saving config:", error);
                        }
                      }
                    }}
                    className="bg-transparent text-sm text-text-primary outline-none cursor-pointer appearance-none pr-5 font-medium hover:text-accent-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-bg-secondary text-text-primary">
                      {!config.GOOGLE_SHEET_ID ? "-- Trống --" : "-- Chọn Tab --"}
                    </option>
                    {availableTabs.map(tab => (
                      <option key={tab.id} value={tab.id} className="bg-bg-secondary text-text-primary">{tab.title}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1 text-text-muted pointer-events-none" size={14} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={loadBriefs} disabled={isProcessing} className="btn-secondary"><Download size={16}/> Đồng Bộ Dữ Liệu</button>
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
                
                <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-lg border border-border-subtle ml-2">
                  {[
                    { id: 'all', label: 'Tất Cả Brief' },
                    { id: 'done', label: 'Brief Đã Làm' },
                    { id: 'pending', label: 'Brief Chưa Làm' },
                    { id: 'incomplete', label: 'Brief Cần Hoàn Thiện' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterTab(tab.id as any)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        filterTab === tab.id 
                          ? 'bg-accent-primary text-white shadow-sm' 
                          : 'text-text-muted hover:text-text-primary hover:bg-bg-secondary'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
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
                        checked={filteredBriefs.length > 0 && Array.from(selectedIds).filter(id => filteredBriefs.some(b => b.id === id)).length === filteredBriefs.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newSet = new Set(selectedIds);
                            filteredBriefs.forEach(b => newSet.add(b.id));
                            setSelectedIds(newSet);
                          } else {
                            const newSet = new Set(selectedIds);
                            filteredBriefs.forEach(b => newSet.delete(b.id));
                            setSelectedIds(newSet);
                          }
                        }}
                      />
                    </th>
                    <th className="p-3 w-16 font-semibold bg-bg-primary">Dòng</th>
                    <th className="p-3 font-semibold bg-bg-primary">Tóm tắt Brief</th>
                    <th className="p-3 w-[30%] font-semibold bg-bg-primary">Mô tả Media</th>
                    <th className="p-3 w-32 font-semibold bg-bg-primary">Định dạng</th>
                    <th className="p-3 w-48 font-semibold bg-bg-primary">Tham chiếu</th>
                    <th className="p-3 w-40 font-semibold bg-bg-primary">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredBriefs.map(brief => (
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
                        <td className="p-3 border-y border-border-subtle group-hover:border-border-medium transition-colors">
                          <textarea 
                            className="w-full bg-transparent border-none focus:ring-0 text-xs text-text-primary italic resize-none p-0 min-h-[60px] scrollbar-none"
                            value={brief.briefMedia || ''}
                            onChange={(e) => updateBriefField(brief.id, 'briefMedia', e.target.value)}
                            placeholder="Nhập mô tả media..."
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-3 border-y border-border-subtle group-hover:border-border-medium transition-colors">
                          <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                            <select 
                              className="bg-bg-tertiary border border-border-subtle rounded px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-primary focus:ring-1 focus:ring-accent-primary outline-none cursor-pointer"
                              value={brief.mediaFormat || 'Ảnh'}
                              onChange={(e) => updateBriefField(brief.id, 'mediaFormat', e.target.value as any)}
                            >
                              <option value="Ảnh">Ảnh</option>
                              <option value="Video">Video</option>
                            </select>
                            <select 
                              className="bg-bg-tertiary border border-border-subtle rounded px-1.5 py-1 text-[10px] text-text-muted focus:ring-1 focus:ring-accent-primary outline-none cursor-pointer"
                              value={brief.mediaSize || '1:1'}
                              onChange={(e) => updateBriefField(brief.id, 'mediaSize', e.target.value)}
                            >
                              {brief.mediaFormat === 'Video' ? (
                                <>
                                  <option value="9:16">9:16 (Dọc)</option>
                                  <option value="16:9">16:9 (Ngang)</option>
                                </>
                              ) : (
                                <>
                                  <option value="1:1">1:1 (Vuông)</option>
                                  <option value="4:3">4:3</option>
                                  <option value="3:4">3:4</option>
                                  <option value="16:9">16:9</option>
                                  <option value="9:16">9:16</option>
                                </>
                              )}
                            </select>
                          </div>
                        </td>
                        <td className="p-3 border-y border-border-subtle group-hover:border-border-medium transition-colors">
                          <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                            <div className="relative group/ref">
                              <input 
                                type="text"
                                className="w-full bg-bg-tertiary border border-border-subtle rounded px-2 py-1.5 text-[10px] text-text-primary focus:ring-1 focus:ring-accent-primary outline-none pr-6"
                                value={brief.mediaReference?.startsWith('data:') ? '' : (brief.mediaReference || '')}
                                onChange={(e) => updateBriefField(brief.id, 'mediaReference', e.target.value)}
                                placeholder="Dán link ảnh..."
                              />
                              {brief.mediaReference?.startsWith('data:') && (
                                <div className="absolute inset-0 bg-accent-primary/10 flex items-center px-2 rounded border border-accent-primary/20 pointer-events-none">
                                  <span className="text-[10px] text-accent-primary font-medium truncate">Ảnh đã tải lên</span>
                                </div>
                              )}
                              {brief.mediaReference && (
                                <button 
                                  onClick={() => updateBriefField(brief.id, 'mediaReference', '')}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-status-danger p-1"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                            <label className="flex items-center justify-center gap-1.5 py-1.5 bg-bg-tertiary border border-dashed border-border-medium rounded text-[10px] text-text-muted hover:border-accent-primary hover:text-accent-primary transition-colors cursor-pointer">
                              <Upload size={10} />
                              Tải ảnh lên
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleMediaUpload(brief.id, file);
                                }}
                              />
                            </label>
                          </div>
                        </td>
                        <td className="p-3 rounded-r-xl border-y border-r border-border-subtle group-hover:border-border-medium transition-colors">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <StatusBadge status={brief.status} />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryBriefId(brief.id);
                                }}
                                className="p-1 text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 rounded transition-colors"
                                title="Lịch sử"
                              >
                                <History size={14} />
                              </button>
                            </div>
                            {brief.statusDetail && (
                              <span className="text-[10px] text-text-muted font-medium line-clamp-1">{brief.statusDetail}</span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {briefs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-16 text-center">
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
                  addLog={addLog}
                  setPreviewMedia={setPreviewMedia}
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

      {/* Guide Modal */}
      <AnimatePresence>
        {showGuide && (
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
              className="bg-bg-secondary rounded-2xl shadow-2xl shadow-black/50 w-full max-w-3xl max-h-[85vh] flex flex-col border border-border-medium overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-bg-secondary shrink-0">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <BookOpen className="text-accent-primary" size={20} />
                  Tài Liệu Hướng Dẫn Sử Dụng
                </h2>
                <button onClick={() => setShowGuide(false)} className="text-text-muted hover:text-status-danger hover:bg-status-danger/10 p-2 rounded-full transition-colors"><XCircle size={20} /></button>
              </div>
              
              <div className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent space-y-8 text-left">
                {/* Section 0: Template & Login */}
                <section className="p-4 bg-accent-primary/5 rounded-2xl border border-accent-primary/20">
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center text-accent-primary">0</div>
                    Chuẩn bị dữ liệu & Đăng nhập
                  </h3>
                  <div className="pl-10 space-y-3">
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-2">
                      <li>
                        Đây là template file Google Sheet để ứng dụng web app: 
                        <a href="https://docs.google.com/spreadsheets/d/1QbQILYBdNABqwsbo5TqfmWDGHSvna_dIFfG1ku1slzU/edit?gid=615081352#gid=615081352" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline ml-1 inline-flex items-center gap-1">
                          Template Google Sheet <ExternalLink size={12}/>
                        </a>
                      </li>
                      <li>Cần đăng nhập tài khoản Google và <strong>Clone (Tạo bản sao)</strong> file sheet này ra trước.</li>
                      <li>Đăng nhập trên Web App bằng chính tài khoản Google đã tạo file sheet ở trên.</li>
                    </ul>
                  </div>
                </section>

                {/* Section 1: Gemini API */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center text-accent-primary">1</div>
                    Cấu Hình Gemini API Key
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Gemini API là "bộ não" của hệ thống, dùng để tạo nội dung văn bản và prompt hình ảnh.
                    </p>
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-2">
                      <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline inline-flex items-center gap-1">Google AI Studio <ExternalLink size={12}/></a>.</li>
                      <li>Nhấn nút <strong>"Create API key"</strong>.</li>
                      <li>Chọn dự án và sao chép mã API Key (có dạng <code>AIza...</code>).</li>
                      <li>Dán vào ô <strong>Gemini API Key</strong> trong phần Cấu Hình Hệ Thống.</li>
                    </ul>
                  </div>
                </section>

                {/* Section 2: Google Sheets */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success">2</div>
                    Kết nối Google Sheet
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Hệ thống cần quyền truy cập vào Google Sheet để đọc Brief và ghi lại kết quả.
                    </p>
                    <div className="bg-bg-tertiary p-4 rounded-xl border border-border-subtle">
                      <h4 className="text-sm font-bold text-text-primary mb-2">Các bước thực hiện:</h4>
                      <ol className="list-decimal pl-5 text-sm text-text-secondary space-y-2">
                        <li>Nhấn <strong>"Đăng nhập với Google"</strong> trong phần Cấu hình.</li>
                        <li>Cấp quyền truy cập vào Google Drive và Google Sheets khi được hỏi.</li>
                        <li>Chọn <strong>Bảng Tính (Spreadsheet)</strong> từ danh sách hiện ra.</li>
                        <li>Chọn <strong>Tab (Sheet Nhỏ)</strong> chứa dữ liệu của bạn.</li>
                        <li>Thiết lập các cột tương ứng (Cột Brief, Cột Content, Cột Ảnh).</li>
                      </ol>
                    </div>
                  </div>
                </section>

                {/* Section 3: ImgBB */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-secondary/10 flex items-center justify-center text-accent-secondary">3</div>
                    Cấu Hình ImgBB API Key
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Dùng để lưu trữ ảnh AI sinh ra và lấy link public để dán vào Google Sheet.
                    </p>
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-2">
                      <li>Truy cập <a href="https://imgbb.com/signup" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline inline-flex items-center gap-1">ImgBB <ExternalLink size={12}/></a> để đăng ký tài khoản.</li>
                      <li>Sau khi đăng nhập, vào trang <a href="https://api.imgbb.com/" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline inline-flex items-center gap-1">API ImgBB <ExternalLink size={12}/></a>.</li>
                      <li>Nhấn <strong>"Add API Key"</strong> và sao chép mã.</li>
                      <li>Dán vào ô <strong>ImgBB API Key</strong> trong phần Cấu Hình Hệ Thống.</li>
                    </ul>
                  </div>
                </section>

                {/* Section 4: Google Apps Script (Tùy chọn) */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-status-warning/10 flex items-center justify-center text-status-warning">4</div>
                    Google Apps Script (Dự phòng)
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Nếu việc ghi dữ liệu trực tiếp qua API gặp lỗi, bạn có thể sử dụng Web App URL để ghi dữ liệu.
                    </p>
                    <div className="p-3 bg-status-warning/5 border border-status-warning/20 rounded-lg">
                      <p className="text-xs text-status-warning italic">
                        * Hướng dẫn chi tiết và mã nguồn đã được cung cấp sẵn trong phần cuối của mục Cấu Hình Hệ Thống.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 5: Knowledge Base */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center text-accent-primary">5</div>
                    Kiến Thức Chuyên Ngành (Knowledge Base)
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Cung cấp thêm dữ liệu chuyên sâu để AI tạo nội dung chính xác và chuyên nghiệp hơn.
                    </p>
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-2">
                      <li><strong>Dán văn bản:</strong> Nhập trực tiếp các quy định, kiến thức sản phẩm.</li>
                      <li><strong>Link tài liệu:</strong> Cung cấp các đường dẫn tham khảo từ website.</li>
                      <li><strong>Tải tệp tin:</strong> Hỗ trợ PDF, Excel, Ảnh chứa thông tin chuyên môn.</li>
                    </ul>
                  </div>
                </section>

                {/* Section 6: Column Config */}
                <section>
                  <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-secondary/10 flex items-center justify-center text-accent-secondary">6</div>
                    Cấu Hình Cột (Column Configuration)
                  </h3>
                  <div className="pl-10 space-y-3">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      Thiết lập sự tương ứng giữa các cột trong Google Sheet và các trường dữ liệu trong ứng dụng.
                    </p>
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-2">
                      <li><strong>Cột Brief:</strong> Chọn các cột chứa thông tin mô tả sản phẩm/dịch vụ.</li>
                      <li><strong>Giọng Điệu:</strong> Chọn cột quy định phong cách viết bài.</li>
                      <li><strong>Cột Content:</strong> Cột mà hệ thống sẽ ghi nội dung bài viết vào.</li>
                      <li><strong>Cột Link Ảnh:</strong> Cột mà hệ thống sẽ ghi link hình ảnh/video vào.</li>
                    </ul>
                  </div>
                </section>
              </div>

              <div className="px-6 py-4 border-t border-border-subtle bg-bg-tertiary flex justify-end shrink-0">
                <button onClick={() => setShowGuide(false)} className="btn-primary">Đã hiểu</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Config Modal */}
      <AnimatePresence>
        {showComponentDesc && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowComponentDesc(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-bg-secondary w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl border border-border-subtle overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-bg-primary shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Info size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">Mô Tả Thành Phần</h2>
                    <p className="text-xs text-text-muted">Chi tiết các cột và tính năng trên Dashboard</p>
                  </div>
                </div>
                <button onClick={() => setShowComponentDesc(false)} className="p-2 hover:bg-bg-tertiary rounded-full transition-colors text-text-muted">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
                <div className="grid gap-6">
                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <FileText size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Tóm Tắt Brief</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Dữ liệu đầu vào được lấy từ các cột bạn đã cấu hình trong Google Sheet. Đây là nguồn thông tin chính để AI hiểu về sản phẩm, dịch vụ và mục tiêu của chiến dịch marketing.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <Edit3 size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Mô Tả Media</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Nơi bạn nhập chi tiết yêu cầu về hình ảnh hoặc video. Bạn có thể mô tả bối cảnh, ánh sáng, đối tượng, hoặc cảm xúc muốn truyền tải. Nếu để trống, AI sẽ tự động sáng tạo dựa trên nội dung Brief.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Định Dạng & Kích Thước</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Lựa chọn kết quả đầu ra là <strong>Ảnh</strong> hoặc <strong>Video</strong>. Tùy theo lựa chọn, bạn có thể chọn tỉ lệ khung hình tương ứng (ví dụ: 1:1 cho Instagram, 9:16 cho TikTok/Reels).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <ExternalLink size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Tham Chiếu (Reference)</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Cung cấp mẫu để AI học tập. Bạn có thể dán link ảnh từ web hoặc tải ảnh trực tiếp từ máy tính. AI sẽ dựa vào đây để mô phỏng phong cách, bố cục và màu sắc.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-secondary/20 flex items-center justify-center text-accent-secondary shrink-0">
                      <Settings size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Cấu Hình Cột</h3>
                      <div className="space-y-3 mt-2">
                        <div>
                          <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">Cột Brief</p>
                          <p className="text-sm text-text-secondary">Chọn các cột chứa thông tin yêu cầu (ví dụ: Tên sản phẩm, Đặc điểm, Đối tượng). AI sẽ tổng hợp dữ liệu từ các cột này.</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">Giọng Điệu Content</p>
                          <p className="text-sm text-text-secondary">Chọn cột quy định phong cách viết (ví dụ: Hài hước, Chuyên nghiệp, Đồng cảm). Giúp nội dung nhất quán với thương hiệu.</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">Cột Content</p>
                          <p className="text-sm text-text-secondary">Cột đích để hệ thống tự động điền nội dung chi tiết sau khi AI tạo xong. Giúp đồng bộ dữ liệu về Google Sheet.</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-accent-primary uppercase tracking-wider">Cột Link Ảnh</p>
                          <p className="text-sm text-text-secondary">Cột đích để hệ thống tự động điền đường dẫn hình ảnh hoặc video sau khi tạo. Giúp quản lý tài nguyên media dễ dàng.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Content Chi Tiết</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Nội dung văn bản chi tiết (bài viết social, kịch bản...) được AI tạo ra dựa trên Brief và Giọng điệu đã chọn.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-bg-tertiary rounded-xl border border-border-subtle">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-1">Trạng Thái</h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        Hiển thị tiến độ xử lý của từng dòng: Đang chờ, Đã tạo Content, Đã tạo Media, hoặc có Lỗi xảy ra.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border-subtle bg-bg-primary flex justify-end shrink-0">
                <button onClick={() => setShowComponentDesc(false)} className="btn-primary px-8">Đóng</button>
              </div>
            </motion.div>
          </motion.div>
        )}

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
                  Cấu Hình Hệ Thống
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
                    <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg space-y-2">
                      <p className="font-medium text-text-primary">Các bước thực hiện:</p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-accent-primary underline">Google AI Studio</a>.</li>
                        <li>Đăng nhập bằng tài khoản Google của bạn.</li>
                        <li>Nhấn nút <strong className="text-text-primary">"Create API key"</strong>.</li>
                        <li>Chọn <strong className="text-text-primary">"Create API key in new project"</strong>.</li>
                        <li>Sao chép mã (chuỗi ký tự dài) và dán vào ô trên.</li>
                      </ol>
                    </div>
                  </details>
                </div>

                <div className="p-5 bg-bg-tertiary border border-border-medium rounded-xl shadow-sm">
                  <h3 className="font-bold text-text-primary mb-3 flex items-center gap-2">
                    <img src="https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png" alt="Sheets" className="w-5 h-5 drop-shadow-sm" />
                    Kết Nối Google Sheet
                  </h3>
                  
                  {!accessToken ? (
                    <div className="text-sm text-text-secondary mb-4 bg-bg-secondary p-4 rounded-xl border border-border-subtle">
                      <p className="mb-3">Đăng nhập bằng Google để chọn Sheet và Ghi dữ liệu trực tiếp không cần cài đặt Apps Script.</p>
                      
                      <div className="flex flex-wrap gap-2">
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

                      <details className="mt-3 text-[11px] text-text-muted group">
                        <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none italic">
                          <ChevronDown size={10} className="group-open:rotate-180 transition-transform" />
                          Tại sao cần đăng nhập?
                        </summary>
                        <div className="mt-2 p-3 bg-bg-tertiary rounded-lg space-y-2">
                          <p>Việc đăng nhập giúp ứng dụng có quyền:</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Tìm kiếm các tệp Google Sheet trong Drive của bạn.</li>
                            <li>Đọc dữ liệu Brief từ các cột bạn đã chọn.</li>
                            <li>Ghi trực tiếp Content và Link ảnh vào Sheet mà không cần cấu hình kỹ thuật phức tạp.</li>
                          </ul>
                          <p className="text-[10px] mt-2 italic">Chưa có Bảng tính? <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-accent-primary underline font-bold">Tạo Google Sheet mới ngay</a></p>
                          <p className="text-[10px] mt-1">* Nếu gặp lỗi "unauthorized-domain", hãy sao chép tên miền trên và thêm vào "Authorized domains" trong Firebase Console.</p>
                        </div>
                      </details>
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
                              1. Chọn Bảng Tính (Spreadsheet)
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
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Google Sheet ID hoặc URL (Thủ công)</label>
                            <input 
                              type="text" 
                              value={config.GOOGLE_SHEET_ID} 
                              onChange={e => {
                                let val = e.target.value;
                                const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                if (match) val = match[1];
                                setConfig({...config, GOOGLE_SHEET_ID: val});
                              }} 
                              className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary text-xs" 
                              placeholder="Nhập ID hoặc dán link Google Sheet"
                            />
                          </div>

                          {config.GOOGLE_SHEET_ID && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="pt-4 border-t border-border-subtle"
                            >
                              <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                                <Layers size={14} className="text-accent-primary" />
                                2. Chọn Tab (Sheet Nhỏ)
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
                                    <option value="">-- Chọn Một Tab --</option>
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
                                  Nhấn Để Tải Danh Sách Tab
                                </button>
                              )}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Google Apps Script Web App URL (Không cần cài đặt nếu đã kết nối được Google Sheet)</label>
                <input type="text" value={config.GAS_WEB_APP_URL} onChange={e => setConfig({...config, GAS_WEB_APP_URL: e.target.value})} className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary" placeholder="https://script.google.com/macros/s/.../exec" />
                <details className="mt-2 text-xs text-text-muted group">
                  <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none">
                    <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                    Cách cài đặt Apps Script (Dành cho người dùng nâng cao)?
                  </summary>
                  <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg space-y-3">
                    <p>Nếu bạn không muốn đăng nhập Google, bạn có thể dùng Apps Script làm cầu nối:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Truy cập <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-accent-primary underline">Google Apps Script</a>.</li>
                      <li>Mở Google Sheet, chọn <strong className="text-text-primary">Extensions &gt; Apps Script</strong>.</li>
                      <li>Dán đoạn mã ở phần hướng dẫn chi tiết phía dưới.</li>
                      <li>Nhấn <strong className="text-text-primary">Deploy &gt; New deployment</strong>.</li>
                      <li>Chọn type là <strong className="text-text-primary">Web app</strong>.</li>
                      <li>Execute as: <strong className="text-text-primary">Me</strong>. Who has access: <strong className="text-text-primary">Anyone</strong>.</li>
                      <li>Sao chép URL nhận được và dán vào ô trên.</li>
                    </ol>
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
                  <div className="mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg space-y-2">
                    <p>ImgBB dùng để lưu trữ ảnh tạm thời trước khi đưa link vào Google Sheet:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Truy cập <a href="https://api.imgbb.com/" target="_blank" rel="noreferrer" className="text-accent-primary underline">ImgBB API</a>.</li>
                      <li>Đăng ký hoặc đăng nhập tài khoản.</li>
                      <li>Nhấn <strong className="text-text-primary">"Create API Key"</strong>.</li>
                      <li>Sao chép mã và dán vào ô trên.</li>
                    </ol>
                  </div>
                </details>
              </div>
                <div className="space-y-4 pt-4 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-text-primary flex items-center gap-2">
                      <BookOpen size={18} className="text-accent-primary" />
                      Knowledge Base (Kiến thức chuyên ngành)
                    </label>
                    <details className="text-[10px] text-text-muted group">
                      <summary className="cursor-pointer hover:text-accent-primary flex items-center gap-1 list-none italic">
                        <ChevronDown size={10} className="group-open:rotate-180 transition-transform" />
                        Nó hoạt động như thế nào?
                      </summary>
                      <div className="absolute right-6 mt-2 p-3 bg-bg-secondary border border-border-subtle rounded-lg shadow-xl z-10 max-w-xs">
                        <p>AI sẽ đọc tất cả thông tin bạn cung cấp ở đây (văn bản, tệp PDF, ảnh, link web) để làm tư liệu viết bài. Giúp nội dung chính xác, đúng chuyên môn và không bịa đặt.</p>
                      </div>
                    </details>
                  </div>
                  
                  {/* Section: Links */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                        <Link size={14} /> Thêm Link Tài Liệu
                      </label>
                      <button 
                        onClick={addKnowledgeLink}
                        className="text-accent-primary hover:text-accent-secondary flex items-center gap-1 text-xs font-bold transition-colors"
                      >
                        <Plus size={14} /> Thêm Link
                      </button>
                    </div>
                    <div className="space-y-2">
                      {config.KNOWLEDGE_BASE_LINKS.map((link, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input 
                            type="url" 
                            value={link} 
                            onChange={(e) => updateKnowledgeLink(idx, e.target.value)}
                            className="flex-1 p-2 bg-bg-tertiary border border-border-medium rounded-lg text-xs text-text-primary outline-none focus:ring-1 focus:ring-accent-primary"
                            placeholder="https://example.com/document"
                          />
                          {config.KNOWLEDGE_BASE_LINKS.length > 1 && (
                            <button 
                              onClick={() => removeKnowledgeLink(idx)}
                              className="p-2 text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: File Upload */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                      <Upload size={14} /> Tải Tài Liệu (PDF, Ảnh, Excel...)
                    </label>
                    <div 
                      className="border-2 border-dashed border-border-medium rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-accent-primary hover:bg-accent-primary/5 transition-all cursor-pointer group"
                      onClick={() => document.getElementById('kb-file-upload')?.click()}
                    >
                      <UploadCloud size={32} className="text-text-muted group-hover:text-accent-primary transition-colors" />
                      <p className="text-xs text-text-muted group-hover:text-text-primary">Kéo thả hoặc nhấn để tải lên nhiều tệp</p>
                      <input 
                        id="kb-file-upload"
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => handleKnowledgeFileUpload(e.target.files)}
                      />
                    </div>
                    
                    {config.KNOWLEDGE_BASE_FILES.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {config.KNOWLEDGE_BASE_FILES.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-bg-tertiary border border-border-subtle rounded-lg group">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText size={16} className="text-accent-primary shrink-0" />
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-xs text-text-primary font-medium truncate">{file.name}</span>
                                <span className="text-[10px] text-text-muted">{file.size}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => removeKnowledgeFile(idx)}
                              className="p-1.5 text-text-muted hover:text-status-danger opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section: Text Content */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                      <Edit3 size={14} /> Dán Nội Dung Trực Tiếp
                    </label>
                    <textarea 
                      value={config.KNOWLEDGE_BASE_TEXT} 
                      onChange={e => setConfig({...config, KNOWLEDGE_BASE_TEXT: e.target.value})} 
                      className="w-full p-3 bg-bg-tertiary border border-border-medium rounded-xl focus:ring-2 focus:ring-accent-primary outline-none h-32 text-sm text-text-primary placeholder:text-text-muted" 
                      placeholder="Dán nội dung kiến thức chuyên ngành vào đây..."
                    />
                  </div>
                </div>
                
                <details className="mt-4 p-4 bg-bg-tertiary border border-border-medium rounded-lg text-sm text-text-secondary group">
                  <summary className="font-bold text-text-primary cursor-pointer flex items-center justify-between">
                    Hướng dẫn tạo Google Apps Script Web App
                    <ChevronDown size={16} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-3">
                    <ol className="list-decimal pl-5 space-y-1 mb-3">
                      <li>Truy cập <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-accent-primary underline">Google Apps Script</a> hoặc mở Google Sheet của bạn, chọn <strong className="text-text-primary">Extensions &gt; Apps Script</strong>.</li>
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
  var briefMediaColIdx = headers.indexOf(payload.briefMediaCol) + 1;
  var mediaFormatColIdx = headers.indexOf(payload.mediaFormatCol) + 1;
  var mediaRefColIdx = headers.indexOf(payload.mediaRefCol) + 1;

  data.forEach(function(item) {
    if (contentColIdx > 0 && item.content) {
      tab.getRange(item.rowIndex, contentColIdx).setValue(item.content);
    }
    if (imageColIdx > 0 && item.imageUrl) {
      tab.getRange(item.rowIndex, imageColIdx).setValue(item.imageUrl);
    }
    if (briefMediaColIdx > 0 && item.briefMedia) {
      tab.getRange(item.rowIndex, briefMediaColIdx).setValue(item.briefMedia);
    }
    if (mediaFormatColIdx > 0 && item.mediaFormat) {
      tab.getRange(item.rowIndex, mediaFormatColIdx).setValue(item.mediaFormat);
    }
    if (mediaRefColIdx > 0 && item.mediaReference && item.mediaReference.indexOf('data:') !== 0) {
      tab.getRange(item.rowIndex, mediaRefColIdx).setValue(item.mediaReference);
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
        <HistoryModal />
        <MediaPreviewModal />
      </AnimatePresence>
    </div>
  );
}
