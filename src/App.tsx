import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from '@google/genai';
import { Settings, Download, Edit3, Image as ImageIcon, UploadCloud, Save, XCircle, Trash2, LogIn, LogOut, ChevronDown, ChevronLeft, ChevronRight, FileText, MessageSquare, Menu, LayoutPanelLeft, Maximize2, Minimize2, Terminal, ChevronUp, CheckCircle2, AlertCircle, Loader2, Play, Database, CheckSquare, Square, PanelRightClose, PanelRightOpen, X, Search, Layers, Copy, BookOpen, ExternalLink, History, Upload, Info, Plus, Link, Zap } from 'lucide-react';
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

// Helper to remove undefined values for Firestore
const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
};

const GEMINI_KEYS = [
  "AIzaSyC-vQcgpR2B4ZN6zp6eAo4M-NUsPj066Aw",
  "AIzaSyAlg754zty0-hpgmBg_9qNVT8koZlfgPQ0"
];

const IMGBB_KEYS = [
  "ae8c634463c8ae42ac5d47f46120fbb3",
  "8ab8ca2ab8dc92c8cbfc48c5c70bf031"
];

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
  COL_IMAGE: "Link Ảnh/Video",
  FILTER_TAB: "all" as 'all' | 'done' | 'pending' | 'incomplete',
  SEARCH_QUERY: ""
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
  status: 'pending' | 'content_generated' | 'image_generated' | 'video_generated' | 'uploaded' | 'saved' | 'done' | 'incomplete' | 'error' | 'generating_content' | 'generating_media';
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

const btnPrimary = "flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[10px] shadow-md shadow-accent-primary/25";
const btnSecondary = "flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-primary border border-white/5 rounded-lg font-bold uppercase tracking-widest hover:bg-white/5 hover:border-accent-primary/40 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-[10px] shadow-inner";

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string, text: string, dot: string }> = {
    pending: { color: 'badge-neutral', text: 'Chưa xử lý', dot: 'bg-slate-500' },
    content_generated: { color: 'badge-processing', text: 'Đã có Content', dot: 'bg-accent-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]' },
    image_generated: { color: 'badge-success', text: 'Đã có Ảnh', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' },
    uploaded: { color: 'bg-amber-500/30 text-amber-100 border border-amber-400/70', text: 'Đã Upload', dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' },
    saved: { color: 'badge-success', text: 'Hoàn thành', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' },
    done: { color: 'badge-success', text: 'DONE', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' },
    incomplete: { color: 'badge-neutral', text: 'Thiếu thông tin', dot: 'bg-slate-500' },
    error: { color: 'badge-error', text: 'Lỗi', dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' },
  };
  const c = config[status] || { color: 'badge-neutral', text: status, dot: 'bg-slate-500' };

  return (
    <span className={`badge ${c.color} shadow-lg`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
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
        className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-tertiary/50 border border-white/5 text-text-primary rounded-lg text-[13px] hover:border-accent-primary/50 transition-colors w-full shadow-sm"
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
            className="absolute top-full left-0 mt-1 w-full bg-bg-tertiary border border-white/5 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
          >
            <div className="p-1.5 space-y-0.5">
              {options.map((opt: string, idx: number) => (
                <label key={opt + '-' + idx} className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-bg-hover rounded-md cursor-pointer group transition-colors">
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
                    <div className="w-4 h-4 rounded border border-white/10 bg-bg-secondary peer-checked:bg-accent-primary peer-checked:border-accent-primary transition-all flex items-center justify-center">
                      <svg className={`w-3 h-3 text-white transition-transform ${selected.includes(opt) ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                  </div>
                  <span className="text-[13px] text-text-primary truncate group-hover:text-white transition-colors">{opt}</span>
                </label>
              ))}
              {options.length === 0 && (
                <div className="p-3 text-[13px] text-text-muted text-center italic">Không có cột nào</div>
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
        className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-tertiary/50 border border-white/5 text-text-primary rounded-lg text-[13px] hover:border-accent-primary/50 transition-colors w-full shadow-sm"
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
            className="absolute top-full left-0 mt-1 w-full bg-bg-tertiary border border-white/5 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
          >
            <div className="p-1.5 space-y-0.5">
              {options.map((opt: string, idx: number) => (
                <button 
                  key={opt + '-' + idx}
                  onClick={() => { onChange(opt); setIsOpen(false); }}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 hover:bg-bg-hover rounded-md cursor-pointer transition-colors ${selected === opt ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary'}`}
                >
                  <span className="text-[13px] truncate">{opt}</span>
                  {selected === opt && <CheckCircle2 size={14} className="ml-auto shrink-0" />}
                </button>
              ))}
              {options.length === 0 && (
                <div className="p-3 text-[13px] text-text-muted text-center italic">Không có cột nào</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface WorkspaceItemProps {
  key?: any;
  brief: Brief;
  onContentClick: () => void;
  onImageClick: () => void;
  onRetry: () => void;
}

const WorkspaceItem = ({ brief, onContentClick, onImageClick, onRetry }: WorkspaceItemProps) => {
  return (
    <div className="flex gap-4 p-4 border-b border-white/5 hover:bg-bg-tertiary/30 transition-colors group relative">
      {/* Error Overlay & Retry Button */}
      {brief.status === 'error' && (
        <div className="absolute inset-0 bg-status-danger/5 backdrop-blur-[1px] z-20 flex items-center justify-center gap-3">
          <div className="bg-bg-secondary border border-status-danger/30 rounded-xl p-3 shadow-xl flex items-center gap-3">
            <AlertCircle size={20} className="text-status-danger" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-primary">Xảy ra lỗi</span>
              <span className="text-[11px] text-text-muted max-w-[150px] truncate">{brief.statusDetail}</span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="ml-2 px-3 py-1.5 bg-status-danger text-white rounded-lg text-[11px] font-bold hover:bg-status-danger/80 transition-colors flex items-center gap-1.5"
            >
              <History size={12} />
              LÀM LẠI
            </button>
          </div>
        </div>
      )}

      {/* Content Box */}
      <div 
        onClick={onContentClick}
        className="flex-1 bg-bg-tertiary/30 rounded-xl border border-white/5 p-4 cursor-pointer hover:border-accent-primary/50 hover:scale-[1.01] hover:shadow-lg transition-all relative overflow-hidden min-h-[120px]"
      >
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 size={14} className="text-text-muted" />
        </div>
        <div className="text-[11px] font-bold text-accent-primary uppercase tracking-wider mb-2 flex justify-between">
          <span>Dòng {brief.rowIndex}</span>
          {brief.statusDetail && <span className="text-text-muted">{brief.statusDetail}</span>}
        </div>
        <p className="text-sm text-text-primary line-clamp-4 whitespace-pre-wrap leading-relaxed font-sans">
          {brief.content || <span className="text-text-muted italic">Đang chờ tạo nội dung...</span>}
        </p>
      </div>

      {/* Image Box */}
      <div 
        onClick={onImageClick}
        className="w-32 h-32 shrink-0 bg-bg-tertiary/30 rounded-xl border border-white/5 overflow-hidden cursor-pointer hover:border-accent-primary/50 hover:scale-[1.02] hover:shadow-lg transition-all group/img relative"
      >
        {brief.imageBase64 ? (
          <img src={`data:image/jpeg;base64,${brief.imageBase64}`} className="w-full h-full object-cover" alt="AI" />
        ) : brief.imageUrl ? (
          <img src={brief.imageUrl} className="w-full h-full object-cover" alt="Media" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-text-muted gap-2">
            <ImageIcon size={20} />
            <span className="text-[11px]">Chưa có ảnh</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <Maximize2 size={16} className="text-white" />
        </div>
      </div>
    </div>
  );
};

const WorkspacePanel = ({ 
  selectedBriefs, 
  onClose, 
  onContentClick, 
  onImageClick,
  isCollapsed,
  onRetry
}: { 
  selectedBriefs: Brief[], 
  onClose: () => void,
  onContentClick: (brief: Brief) => void,
  onImageClick: (brief: Brief) => void,
  isCollapsed: boolean,
  onRetry: (id: string) => void
}) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-secondary relative border-l border-white/5">
      <div className={`px-6 py-4 border-b border-white/5 bg-bg-tertiary/50 flex items-center justify-between sticky top-0 z-10 ${isCollapsed ? 'px-2 justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col gap-1' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center font-bold text-sm border border-accent-primary/20 shadow-sm shrink-0">
            {selectedBriefs.length}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <h3 className="font-bold text-base text-text-primary tracking-tight">Không Gian Làm Việc</h3>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-0.5">Xử lý tập trung</span>
            </div>
          )}
          {isCollapsed && (
            <div className="[writing-mode:vertical-rl] rotate-180 text-text-muted text-[9px] font-bold uppercase tracking-widest opacity-50 mt-4">
              KHÔNG GIAN LÀM VIỆC
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded-lg transition-all hover:scale-110">
            <X size={16} />
          </button>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent ${isCollapsed ? 'hidden' : ''}`}>
        {selectedBriefs.map((brief, idx) => (
          <WorkspaceItem 
            key={brief.id}
            brief={brief} 
            onContentClick={() => onContentClick(brief)}
            onImageClick={() => onImageClick(brief)}
            onRetry={() => onRetry(brief.id)}
          />
        ))}
        {selectedBriefs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-text-muted p-8 text-center">
            <FileText size={48} className="mb-4 opacity-20" />
            <p>Chọn các brief trong bảng để bắt đầu xử lý</p>
          </div>
        )}
      </div>
    </div>
  );
};

const PreviewPanel = ({ 
  brief, 
  updateBrief, 
  onClose, 
  addLog, 
  setPreviewMedia,
  generateSingleContent,
  generateSingleImage
}: { 
  brief: Brief, 
  updateBrief: (id: string, updates: Partial<Brief>) => void, 
  onClose: () => void, 
  addLog: (msg: string, type?: 'info'|'error'|'success') => void, 
  setPreviewMedia: (media: { url: string, type: 'image' | 'video' } | null) => void,
  generateSingleContent: (brief: Brief) => Promise<void>,
  generateSingleImage: (brief: Brief) => Promise<void>
}) => {
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
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.3 }}
        className="bg-bg-secondary w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/5"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/5 bg-bg-tertiary/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center font-bold text-sm border border-accent-primary/20 shadow-sm">
              {brief.rowIndex}
            </div>
            <div className="flex flex-col">
              <h3 className="font-bold text-base text-text-primary tracking-tight">Chi tiết Brief</h3>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-0.5">Chỉnh sửa & Xem trước</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-status-danger hover:bg-status-danger/10 rounded-full transition-colors" title="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Brief Data & Settings */}
          <div className="w-full md:w-1/3 border-r border-white/5 bg-bg-secondary flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-6">
            <div className="space-y-6">
              {/* Original Brief Data */}
              <div>
                <h4 className="text-[10px] font-display font-black text-accent-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FileText size={14} /> Dữ liệu đầu vào
                </h4>
                <div className="grid grid-cols-1 gap-3 bg-bg-tertiary/30 p-4 rounded-xl border border-white/5">
                  {Object.entries(brief.briefData).map(([key, value], idx) => (
                    <div key={key + '-' + idx} className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-text-secondary">{key}</span>
                      <span className="text-text-primary bg-bg-secondary p-2 rounded-lg border border-white/5">{value || <span className="text-text-muted italic">Trống</span>}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* New Media Fields */}
              <div>
                <h4 className="text-[10px] font-display font-black text-accent-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ImageIcon size={14} /> Cấu hình Media
                </h4>
                <div className="space-y-4 bg-bg-tertiary/30 p-4 rounded-xl border border-white/5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Mô tả ảnh/video</label>
                    <textarea 
                      value={brief.briefMedia || ''} 
                      onChange={e => updateBrief(brief.id, { briefMedia: e.target.value })}
                      className="w-full p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none min-h-[80px] resize-none font-sans"
                      placeholder="Nhập mô tả, mong muốn để AI tạo ảnh/video..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Định dạng</label>
                      <select 
                        value={brief.mediaFormat || 'Ảnh'} 
                        onChange={e => updateBrief(brief.id, { mediaFormat: e.target.value as any, mediaSize: mediaSizes[e.target.value as keyof typeof mediaSizes][0] })}
                        className="w-full p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none"
                      >
                        <option value="Ảnh">Ảnh</option>
                        <option value="Video">Video</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Kích thước</label>
                      <select 
                        value={brief.mediaSize || '1:1'} 
                        onChange={e => updateBrief(brief.id, { mediaSize: e.target.value })}
                        className="w-full p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none"
                      >
                        {mediaSizes[brief.mediaFormat || 'Ảnh'].map((size, idx) => (
                          <option key={size + '-' + idx} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Tham chiếu media</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={brief.mediaReference?.startsWith('data:') ? 'Đã tải ảnh lên' : (brief.mediaReference || '')} 
                        onChange={e => updateBrief(brief.id, { mediaReference: e.target.value })}
                        className="flex-1 p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none"
                        placeholder="Dán link ảnh mẫu..."
                      />
                      <label className="p-2 bg-bg-secondary border border-white/5 rounded-lg text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 cursor-pointer transition-all shadow-sm">
                        <UploadCloud size={16} />
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                      </label>
                    </div>
                    <p className="text-[10px] text-text-muted italic">Tải ảnh hoặc link ảnh lên để làm mẫu thiết kế</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Content & Preview */}
          <div className="flex-1 flex flex-col bg-bg-tertiary/10">
            <div className="px-6 pt-4 border-b border-white/5 bg-bg-secondary shrink-0 flex gap-6">
              <button 
                onClick={() => setActiveTab('content')}
                className={`pb-3 text-xs font-medium transition-colors relative ${activeTab === 'content' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} /> Content
                </div>
                {activeTab === 'content' && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('image')}
                className={`pb-3 text-xs font-medium transition-colors relative ${activeTab === 'image' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={14} /> Ảnh/Video
                </div>
                {activeTab === 'image' && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
                )}
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`pb-3 text-xs font-medium transition-colors relative ${activeTab === 'history' ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <div className="flex items-center gap-2">
                  <History size={14} /> Lịch sử
                </div>
                {activeTab === 'history' && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary rounded-t-full" />
                )}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <AnimatePresence mode="wait">
          {activeTab === 'content' ? (
            <motion.div 
              key="content"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col gap-4"
            >
              <div className="flex gap-2">
                <textarea 
                  className="flex-1 p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary"
                  placeholder="Sửa content..."
                  defaultValue={brief.content}
                  onBlur={(e) => updateBrief(brief.id, { content: e.target.value })}
                />
                <button 
                  onClick={() => generateSingleContent(brief)}
                  className="px-4 py-2 bg-accent-primary text-white rounded-lg text-xs font-bold hover:bg-accent-primary/80 transition-colors"
                >
                  Sửa Content
                </button>
              </div>
                    {!brief.content && brief.status !== 'content_generated' ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4 border border-dashed border-white/10 rounded-xl p-8">
                        <div className="w-16 h-16 rounded-full bg-bg-tertiary/50 flex items-center justify-center">
                          <Edit3 size={24} className="text-text-secondary" />
                        </div>
                        <p className="text-xs">Chưa có nội dung. Hãy chọn dòng brief này và nhấn Tạo Content ở bảng chính.</p>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col bg-bg-secondary rounded-xl border border-white/5 overflow-hidden focus-within:border-accent-primary focus-within:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all shadow-inner">
                        <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-bg-tertiary/30">
                          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{brief.content.length} ký tự</span>
                          <button onClick={() => navigator.clipboard.writeText(brief.content)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg transition-colors" title="Copy content">
                            <Download size={12} /> Copy
                          </button>
                        </div>
                        <textarea 
                          className="flex-1 w-full p-6 resize-none focus:outline-none bg-transparent text-text-primary text-sm leading-relaxed font-sans"
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
              <div className="flex gap-2 px-6">
                <input 
                  type="text"
                  className="flex-1 p-2 bg-bg-secondary border border-white/5 rounded-lg text-xs text-text-primary"
                  placeholder="Sửa mô tả media..."
                  defaultValue={brief.briefMedia}
                  onBlur={(e) => updateBrief(brief.id, { briefMedia: e.target.value })}
                />
                <button 
                  onClick={() => generateSingleImage(brief)}
                  className="px-4 py-2 bg-accent-secondary text-white rounded-lg text-xs font-bold hover:bg-accent-secondary/80 transition-colors"
                >
                  Sửa Media
                </button>
              </div>
                    <div className="w-full max-w-2xl mx-auto aspect-video bg-bg-secondary rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden relative group shadow-inner">
                      {brief.imageBase64 ? (
                        <>
                          <img 
                            src={`data:image/jpeg;base64,${brief.imageBase64}`} 
                            alt="AI Generated" 
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105 cursor-zoom-in" 
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
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105 cursor-zoom-in" 
                            onClick={() => setPreviewMedia({ url: brief.imageUrl, type: brief.mediaFormat === 'Video' ? 'video' : 'image' })}
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm pointer-events-none">
                            <span className="text-white font-medium flex items-center gap-2"><Maximize2 size={16}/> Click to view full</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-text-muted flex flex-col items-center gap-4">
                          <div className="w-20 h-20 rounded-full bg-bg-tertiary/50 flex items-center justify-center border border-white/5 shadow-inner">
                            <ImageIcon size={32} className="text-text-secondary" />
                          </div>
                          <span className="text-sm font-medium">Chưa có ảnh/video</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="w-full max-w-2xl mx-auto">
                      {brief.imageUrl ? (
                        <div className="bg-bg-secondary p-4 rounded-xl border border-white/5 shadow-inner">
                          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5"><UploadCloud size={14}/> Link media public</label>
                          <div className="flex items-center gap-2">
                            <input type="text" readOnly value={brief.imageUrl} className="flex-1 p-2.5 text-xs bg-bg-tertiary/30 border border-white/5 rounded-lg text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors" />
                            <button onClick={() => navigator.clipboard.writeText(brief.imageUrl || '')} className="p-2.5 bg-bg-tertiary/30 border border-white/5 rounded-lg text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 transition-colors" title="Copy link">
                              <Download size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-text-muted italic bg-bg-secondary p-4 rounded-xl border border-white/5 flex items-center gap-3 shadow-inner">
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
                      <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4 border border-dashed border-white/10 rounded-xl p-8">
                        <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center shadow-inner">
                          <History size={24} className="text-text-secondary" />
                        </div>
                        <p className="text-xs">Chưa có lịch sử làm việc</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {brief.history.map((item, idx) => (
                          <div key={item.id} className="bg-bg-secondary border border-white/5 rounded-xl p-5 space-y-4 hover:border-accent-primary/30 transition-all group shadow-sm">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-text-muted uppercase bg-bg-tertiary/50 px-2.5 py-1 rounded border border-white/5">
                                  {new Date(item.timestamp).toLocaleString('vi-VN')}
                                </span>
                                <span className="text-[11px] font-bold text-accent-primary uppercase tracking-wider">{item.statusDetail}</span>
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
                                className="px-3 py-1.5 bg-accent-primary/10 text-accent-primary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-accent-primary/20 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5"
                              >
                                <History size={12} /> Khôi phục
                              </button>
                            </div>
                            {item.content && (
                              <div className="text-xs text-text-secondary line-clamp-2 bg-bg-tertiary/30 p-3 rounded-lg border border-white/5 leading-relaxed">
                                {item.content}
                              </div>
                            )}
                            {item.imageUrl && (
                              <img src={item.imageUrl} className="w-20 h-20 object-cover rounded-lg border border-white/5" alt="History" />
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
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const lastSavedConfig = useRef(config);
  const lastSavedData = useRef<any>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (user && config && JSON.stringify(config) !== JSON.stringify(lastSavedConfig.current)) {
        setDoc(doc(db, 'userConfigs', user.uid), removeUndefined(config), { merge: true });
        lastSavedConfig.current = config;
      }
    }, 10000);
    return () => clearTimeout(handler);
  }, [config, user]);
  const [showConfig, setShowConfig] = useState(true);
  const [isOverwrite, setIsOverwrite] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showComponentDesc, setShowComponentDesc] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{id: string, time: string, msg: string, type: 'info'|'error'|'success'}[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [availableTabs, setAvailableTabs] = useState<{id: number, title: string}[]>([]);
  const [isFetchingTabs, setIsFetchingTabs] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
  const [availableSpreadsheets, setAvailableSpreadsheets] = useState<{id: string, name: string}[]>([]);
  const [isFetchingSpreadsheets, setIsFetchingSpreadsheets] = useState(false);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [isFetchingHeaders, setIsFetchingHeaders] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  const [progress, setProgress] = useState({ current: 0, total: 0, task: '' });
  const [syncError, setSyncError] = useState<string | null>(null);
  const stopProcessingRef = useRef(false);

  // Layout states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(true);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(true);

  // Auto expand/collapse workspace based on selection
  useEffect(() => {
    if (selectedIds.size > 0) {
      setIsWorkspaceCollapsed(false);
    } else {
      setIsWorkspaceCollapsed(true);
    }
  }, [selectedIds.size]);

  const updateBriefField = (id: string, field: keyof Brief, value: any) => {
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const updateBrief = (id: string, updates: Partial<Brief>) => {
    setBriefs(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const retryBrief = async (briefId: string) => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief) return;
    
    // Save current selection
    const currentSelected = new Set(selectedIds);
    // Set selection to only this brief
    setSelectedIds(new Set([briefId]));
    
    // Determine what failed
    // Luôn cho phép retry cả content và image
    await generateContent(true);
    await generateImage(true);
    
    // Restore selection
    setSelectedIds(currentSelected);
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
  const [filterTab, setFilterTab] = useState<'all' | 'done' | 'pending' | 'incomplete' | 'review_content' | 'review_media'>(config.FILTER_TAB || 'all');
  const [showReviewDropdown, setShowReviewDropdown] = useState(false);

  useEffect(() => {
    if (config.FILTER_TAB) {
      setFilterTab(config.FILTER_TAB);
    }
  }, [config.FILTER_TAB]);
  const [historyBriefId, setHistoryBriefId] = useState<string | null>(null);

  const addLog = (msg: string, type: 'info'|'error'|'success' = 'info') => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setLogs(prev => [{ id, time, msg, type }, ...prev].slice(0, 100));
  };

  const renderLogMessage = (msg: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = msg.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return <a key={`log-url-${part}-${i}`} href={part} target="_blank" rel="noreferrer" className="underline text-accent-primary break-all">{part}</a>;
      }
      return <span key={`log-text-${part}-${i}`}>{part}</span>;
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
        // Restore Google Access Token if available and not expired
        const savedTokenData = localStorage.getItem(`google_access_token_${currentUser.uid}`);
        if (savedTokenData) {
          try {
            const { token, expiry } = JSON.parse(savedTokenData);
            if (expiry > Date.now()) {
              setAccessToken(token);
            }
          } catch (e) {
            console.error("Error restoring token:", e);
          }
        }

        setIsConfigLoading(true);
        setIsDataLoading(true);
        try {
          // Load Config
          const configRef = doc(db, 'userConfigs', currentUser.uid);
          const configSnap = await getDoc(configRef);
          let currentConfig = { ...DEFAULT_CONFIG };

          if (configSnap.exists()) {
            const loadedConfig = configSnap.data();
            currentConfig = { ...currentConfig, ...loadedConfig };
            
            // If keys are missing, apply the auto-assignment logic
            if (!currentConfig.GEMINI_API_KEY || !currentConfig.IMGBB_API_KEY) {
              if (currentUser.email === "phamsonbgmkt@gmail.com") {
                if (!currentConfig.GEMINI_API_KEY) currentConfig.GEMINI_API_KEY = "AIzaSyAfQigk0oEr0rjqAgV5uoF7FV5jMZZruos";
                if (!currentConfig.IMGBB_API_KEY) currentConfig.IMGBB_API_KEY = "9adc1585e5ab16b74e717e00be2f579f";
              } else {
                if (!currentConfig.GEMINI_API_KEY) currentConfig.GEMINI_API_KEY = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];
                if (!currentConfig.IMGBB_API_KEY) currentConfig.IMGBB_API_KEY = IMGBB_KEYS[Math.floor(Math.random() * IMGBB_KEYS.length)];
              }
              await setDoc(configRef, removeUndefined(currentConfig), { merge: true });
            }
            
            setConfig(currentConfig);
            addLog('Đã tải cấu hình từ database.', 'success');
            if (currentConfig.GEMINI_API_KEY && currentConfig.GOOGLE_SHEET_ID) {
              setShowConfig(false);
            }
          } else {
            // New user, set default keys
            let geminiKey = "";
            let imgbbKey = "";
            
            if (currentUser.email === "phamsonbgmkt@gmail.com") {
              geminiKey = "AIzaSyAfQigk0oEr0rjqAgV5uoF7FV5jMZZruos";
              imgbbKey = "9adc1585e5ab16b74e717e00be2f579f";
            } else {
              geminiKey = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];
              imgbbKey = IMGBB_KEYS[Math.floor(Math.random() * IMGBB_KEYS.length)];
            }
            
            const newConfig = { ...DEFAULT_CONFIG, GEMINI_API_KEY: geminiKey, IMGBB_API_KEY: imgbbKey };
            setConfig(newConfig);
            await setDoc(configRef, removeUndefined(newConfig));
            addLog('Đã khởi tạo cấu hình mặc định.', 'info');
          }

          // Load Briefs and Logs
          const dataRef = doc(db, 'userData', currentUser.uid);
          const dataSnap = await getDoc(dataRef);
          if (dataSnap.exists()) {
            const data = dataSnap.data();
            if (data.briefs) {
              const briefsData = data.briefs as Brief[];
              const uniqueBriefs = Array.from(new Map(briefsData.map((b: Brief) => [b.id, b])).values());
              setBriefs(uniqueBriefs);
            }
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
    if (briefs.length > 0) {
      // Always save to localStorage immediately for maximum persistence
      try {
        localStorage.setItem('ais_briefs_backup', JSON.stringify(briefs));
        localStorage.setItem('ais_logs_backup', JSON.stringify(logs.slice(0, 50)));
        localStorage.setItem('ais_last_updated', new Date().toISOString());
      } catch (e) {
        console.warn("LocalStorage quota exceeded, trying to save without large images...");
        try {
          // If quota exceeded, save a version without large base64 images
          const optimizedBriefs = briefs.map(b => ({ ...b, imageBase64: undefined }));
          localStorage.setItem('ais_briefs_backup', JSON.stringify(optimizedBriefs));
        } catch (e2) {
          console.error("Failed to save even optimized briefs to localStorage:", e2);
        }
      }

      if (user) {
        const saveData = async () => {
          try {
            // Firestore doesn't support 'undefined' values
            const optimizedBriefs = briefs.map(b => {
              const { imageBase64, ...rest } = b;
              return rest;
            });
            
            const dataToSave = removeUndefined({
              briefs: optimizedBriefs,
              logs: logs.slice(0, 50),
              updatedAt: new Date().toISOString()
            });

            const { updatedAt, ...dataToCompare } = dataToSave;

            if (JSON.stringify(dataToCompare) !== JSON.stringify(lastSavedData.current)) {
              await setDoc(doc(db, 'userData', user.uid), dataToSave, { merge: true });
              lastSavedData.current = dataToCompare;
            }
          } catch (error) {
            console.error("Error auto-saving data:", error);
          }
        };
        const timer = setTimeout(saveData, 10000); // Debounce save to Firestore
        return () => clearTimeout(timer);
      }
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
      const sheetHeaders = Array.from(new Set((data.values?.[0] || []).map((h: any) => String(h).trim())));
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
        const token = credential.accessToken;
        const expiry = Date.now() + 3500 * 1000; // ~1 hour
        setAccessToken(token);
        localStorage.setItem(`google_access_token_${result.user.uid}`, JSON.stringify({ token, expiry }));
        addLog('Đăng nhập Google thành công và đã cấp quyền truy cập Sheet.', 'success');
        fetchSpreadsheets(token);
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
      if (user) {
        localStorage.removeItem(`google_access_token_${user.uid}`);
      }
      await signOut(auth);
      setAccessToken(null);
      setUser(null);
      setAvailableTabs([]);
      setBriefs([]);
      setSelectedIds(new Set());
      setConfig(DEFAULT_CONFIG);
      setShowConfig(true);
      setSyncError(null);
      addLog('Đã đăng xuất.', 'info');
    } catch (error: any) {
      addLog(`Lỗi đăng xuất: ${error.message}`, 'error');
    }
  };

  const handleSyncAction = () => {
    setSyncError(null);
    
    if (!user || !accessToken) {
      handleLogin();
      return;
    }

    if (!config.GOOGLE_SHEET_ID || !config.SHEET_GID) {
      setSyncError('Vui lòng chọn Trang tính và Tab để tiếp tục.');
      setShowConfig(true);
      return;
    }

    loadBriefs();
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
      setSyncError(null);
      setIsProcessing(true);
      addLog('Đang tải dữ liệu từ Google Sheet...', 'info');
      
      let rows: string[][] = [];
      
      if (accessToken) {
        // Use Sheets API if we have access token
        let currentTabs = availableTabs;
        
        // If availableTabs is empty, fetch them first to get the title for SHEET_GID
        if (currentTabs.length === 0) {
          try {
            const tabsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.GOOGLE_SHEET_ID}`;
            const tabsRes = await fetch(tabsUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (tabsRes.ok) {
              const tabsData = await tabsRes.json();
              currentTabs = tabsData.sheets.map((s: any) => ({
                id: s.properties.sheetId,
                title: s.properties.title
              }));
              setAvailableTabs(currentTabs);
            }
          } catch (e) {
            console.error("Error fetching tabs in loadBriefs:", e);
          }
        }

        const tab = currentTabs.find(t => t.id.toString() === config.SHEET_GID);
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
        
        const id = `row_${i + 1}_${config.GOOGLE_SHEET_ID.slice(-5)}_${config.SHEET_GID}`;
        const existingBrief = briefs.find(b => b.id === id);
        
        const rowContent = contentIdx !== -1 ? (row[contentIdx] || '') : '';
        const rowImage = imageIdx !== -1 ? (row[imageIdx] || '') : '';
        
        // Determine initial status if not in memory
        let initialStatus: Brief['status'] = 'pending';
        let initialStatusDetail = 'Chưa xử lý';
        
        const hasContent = !!(existingBrief && existingBrief.status !== 'pending' ? existingBrief.content : rowContent);
        const hasImage = !!(existingBrief && existingBrief.status !== 'pending' ? existingBrief.imageUrl || existingBrief.imageBase64 : rowImage);

        if (existingBrief && existingBrief.status !== 'pending' && existingBrief.status !== 'incomplete' && existingBrief.status !== 'done' && existingBrief.status !== 'saved') {
          initialStatus = existingBrief.status;
          initialStatusDetail = existingBrief.statusDetail;
        } else if (hasContent && hasImage) {
          initialStatus = 'saved';
          initialStatusDetail = 'Hoàn Thành';
        } else if (hasContent || hasImage) {
          initialStatus = 'incomplete';
          initialStatusDetail = 'Cần Hoàn Thiện';
        } else if (existingBrief) {
          initialStatus = existingBrief.status;
          initialStatusDetail = existingBrief.statusDetail;
        }

        loadedBriefs.push({
          id,
          rowIndex: i + 1,
          rawData,
          briefData,
          tone: toneIdx !== -1 ? (row[toneIdx] || '') : '',
          content: existingBrief && existingBrief.status !== 'pending' ? existingBrief.content : rowContent,
          imageUrl: existingBrief && existingBrief.status !== 'pending' ? existingBrief.imageUrl : rowImage,
          imageBase64: existingBrief ? existingBrief.imageBase64 : undefined,
          status: initialStatus,
          statusDetail: initialStatusDetail,
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

  // Auto-load briefs when config is available
  useEffect(() => {
    if (config.GOOGLE_SHEET_ID && config.SHEET_GID && briefs.length === 0 && !isProcessing) {
      loadBriefs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, config.GOOGLE_SHEET_ID, config.SHEET_GID]);

  const generateSingleContent = async (brief: Brief) => {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    
    try {
      updateBrief(brief.id, { status: 'generating_content' });
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
${toneInstruction}

Yêu cầu: Viết nội dung dựa trên brief trên.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const content = response.text || "";
      updateBrief(brief.id, { content, status: 'content_generated', statusDetail: 'Đã tạo Content' });
      addLog(`Đã tạo content cho dòng ${brief.rowIndex}.`, 'success');
      
    } catch (error: any) {
      updateBrief(brief.id, { status: 'error', statusDetail: 'Lỗi Content' });
      addLog(`Lỗi tạo content dòng ${brief.rowIndex}: ${error.message}`, 'error');
    }
  };

  const generateSingleImage = async (brief: Brief) => {
    const originalSelectedIds = selectedIds;
    setSelectedIds(new Set([brief.id]));
    await generateImage(true);
    setSelectedIds(originalSelectedIds);
  };

  const generateContent = async (isForced = true) => {
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
    setIsPaused(false);
    stopProcessingRef.current = false;
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Content' });
    
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds).map(id => briefs.find(b => b.id === id)).filter(Boolean) as Brief[];

    try {
      for (const brief of selectedBriefs) {
        // Check for stop
        if (stopProcessingRef.current) {
          addLog('Đã dừng quá trình tạo content.', 'info');
          break;
        }

        // Check for pause
        while (isPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (stopProcessingRef.current) break;
        }
        if (stopProcessingRef.current) break;

        // Check if already has content and not forced
        if (!isForced && brief.content && brief.content.trim() !== "") {
          addLog(`Bỏ qua dòng ${brief.rowIndex} vì đã có content.`, 'info');
          count++;
          setProgress(p => ({ ...p, current: count }));
          continue;
        }

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

          const parts: any[] = [{ text: prompt }];
          
          config.KNOWLEDGE_BASE_FILES.forEach(file => {
            if (file.type.startsWith('image/') || file.type === 'application/pdf') {
              parts.push({
                inlineData: {
                  data: file.data.split(',')[1],
                  mimeType: file.type
                }
              });
            } else {
              parts.push({ text: `\nNỘI DUNG TÀI LIỆU (${file.name}):\n${file.data.substring(0, 50000)}` });
            }
          });

          let response;
          let retries = 0;
          const maxRetries = 2;
          
          while (retries <= maxRetries) {
            try {
              response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: [{ parts }],
              });
              break; // Success
            } catch (apiErr: any) {
              retries++;
              if (retries > maxRetries) throw apiErr;
              addLog(`Lỗi API dòng ${brief.rowIndex}, đang thử lại lần ${retries}...`, 'info');
              await new Promise(resolve => setTimeout(resolve, 2000 * retries));
            }
          }
          
          const content = response.text || '';
          
          setBriefs(prev => prev.map(b => {
            if (b.id === brief.id) {
              const newHistoryItem: HistoryItem = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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

          // Thêm khoảng nghỉ ngắn giữa các dòng để tránh rate limit
          if (count < selectedBriefs.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err: any) {
          addLog(`Lỗi tạo content dòng ${brief.rowIndex}: ${err.message}`, 'error');
          setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error' } : b));
        } finally {
          count++;
          setProgress(p => ({ ...p, current: count }));
        }
      }
    } catch (err: any) {
      addLog(`Lỗi hệ thống khi tạo Content: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
      setIsPaused(false);
    }
  };

  const generateImage = async (isForced = true) => {
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
    setIsPaused(false);
    stopProcessingRef.current = false;
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo Media AI' });
    
    // Check for API key selection if using gemini-3.1-flash-image-preview
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      addLog('Bạn cần chọn API Key trả phí để sử dụng tính năng sinh ảnh chất lượng cao.', 'info');
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Proceed after dialog closes (assuming success as per guidelines)
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config.GEMINI_API_KEY });
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds)
      .map(id => briefs.find(b => b.id === id))
      .filter(Boolean) as Brief[];
    
    addLog(`DEBUG: selectedIds size: ${selectedIds.size}`, 'info');
    addLog(`DEBUG: selectedBriefs length: ${selectedBriefs.length}`, 'info');
    addLog(`DEBUG: COL_IMAGE config: ${config.COL_IMAGE}`, 'info');

    // Sắp xếp theo rowIndex để xử lý tuần tự đúng thứ tự
    selectedBriefs.sort((a, b) => a.rowIndex - b.rowIndex);

    try {
      for (const brief of selectedBriefs) {
        // Check for stop
        if (stopProcessingRef.current) {
          addLog('Đã dừng quá trình tạo Media.', 'info');
          break;
        }

        // Check if already has image and not forced
        if (!isForced && brief.imageBase64) {
          addLog(`Bỏ qua dòng ${brief.rowIndex} vì đã có ảnh AI.`, 'info');
          count++;
          setProgress(p => ({ ...p, current: count }));
          continue;
        }

        // Check for pause
        while (isPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (stopProcessingRef.current) break;
        }
        if (stopProcessingRef.current) break;

        try {
          updateBrief(brief.id, { status: 'generating_media' });
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
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
            
            let promptResponse;
            let promptRetries = 0;
            const maxPromptRetries = 2;
            
            while (promptRetries <= maxPromptRetries) {
              try {
                promptResponse = await ai.models.generateContent({
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
                break;
              } catch (apiErr: any) {
                promptRetries++;
                if (promptRetries > maxPromptRetries) throw apiErr;
                addLog(`Lỗi tạo prompt dòng ${brief.rowIndex}, thử lại lần ${promptRetries}...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 2000 * promptRetries));
              }
            }
            
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

            let imageResponse;
            let imageRetries = 0;
            const maxImageRetries = 2;
            
            while (imageRetries <= maxImageRetries) {
              try {
                imageResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-flash-image',
                  contents: { parts },
                  config: {
                    imageConfig: {
                      aspectRatio: (brief.mediaSize || "1:1") as any
                    }
                  }
                });
                break;
              } catch (apiErr: any) {
                const errorMsg = apiErr.message || '';
                const isRateLimit = errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('too many requests');
                
                imageRetries++;
                if (imageRetries > maxImageRetries) throw apiErr;
                
                const waitTime = isRateLimit ? 10000 * imageRetries : 5000 * imageRetries;
                addLog(`Lỗi sinh ảnh dòng ${brief.rowIndex} (${isRateLimit ? 'Rate Limit' : 'API Error'}), thử lại sau ${waitTime/1000}s...`, 'info');
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }
            
            const candidate = imageResponse.candidates?.[0];
            const base64Data = candidate?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            
            if (base64Data) {
              setBriefs(prev => prev.map(b => {
                if (b.id === brief.id) {
                  const newHistoryItem: HistoryItem = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
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
              const finishReason = candidate?.finishReason;
              if (finishReason === 'SAFETY') {
                throw new Error('Yêu cầu bị chặn do vi phạm chính sách an toàn (Safety Filter). Hãy thử thay đổi mô tả.');
              } else if (finishReason === 'RECITATION') {
                throw new Error('Yêu cầu bị chặn do vi phạm bản quyền (Recitation Filter).');
              } else {
                console.log("Image API Debug:", imageResponse);
                throw new Error(`Không nhận được dữ liệu ảnh từ API. Lý do: ${finishReason || 'Không xác định'}.`);
              }
            }
          }
          
          // Thêm khoảng nghỉ để tránh rate limit (ảnh tốn nhiều tài nguyên hơn content)
          if (count < selectedBriefs.length - 1) {
            const delay = 4000; // Tăng lên 4s giữa các dòng
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (err: any) {
          addLog(`Lỗi tạo Media dòng ${brief.rowIndex}: ${err.message}`, 'error');
          setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error', statusDetail: 'Lỗi Media' } : b));
        } finally {
          count++;
          setProgress(p => ({ ...p, current: count }));
        }
      }
    } catch (err: any) {
      addLog(`Lỗi hệ thống khi tạo Media: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
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
    setIsPaused(false);
    stopProcessingRef.current = false;
    setProgress({ current: 0, total: selectedIds.size, task: 'Upload Ảnh' });
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds).map(id => briefs.find(b => b.id === id)).filter(Boolean) as Brief[];

    for (const brief of selectedBriefs) {
      if (stopProcessingRef.current) break;
      
      // Check for pause
      while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (stopProcessingRef.current) break;
      }
      if (stopProcessingRef.current) break;

      if (!brief.imageBase64) {
        addLog(`Bỏ qua dòng ${brief.rowIndex} vì chưa có dữ liệu ảnh AI.`, 'info');
        count++;
        setProgress(p => ({ ...p, current: count }));
        continue;
      }
      
      try {
        addLog(`Đang upload ảnh dòng ${brief.rowIndex}...`, 'info');
        setActiveBriefId(brief.id);
        
        let data;
        let retries = 0;
        const maxRetries = 2;
        
        while (retries <= maxRetries) {
          try {
            const formData = new FormData();
            formData.append('image', brief.imageBase64);
            
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${config.IMGBB_API_KEY}`, {
              method: 'POST',
              body: formData
            });
            
            data = await res.json();
            if (data.success) break;
            throw new Error(data.error?.message || 'Upload thất bại');
          } catch (apiErr: any) {
            retries++;
            if (retries > maxRetries) throw apiErr;
            addLog(`Lỗi upload dòng ${brief.rowIndex}, thử lại lần ${retries}...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 3000 * retries));
          }
        }

        if (data.success) {
          setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, imageUrl: data.data.url, status: 'uploaded', statusDetail: 'Đã Upload' } : b));
          addLog(`Upload thành công dòng ${brief.rowIndex}: ${data.data.url}`, 'success');
        }
      } catch (err: any) {
        addLog(`Lỗi upload dòng ${brief.rowIndex}: ${err.message}`, 'error');
        setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error' } : b));
      }
      
      count++;
      setProgress(p => ({ ...p, current: count }));

      // Thêm khoảng nghỉ ngắn giữa các dòng để tránh rate limit
      if (count < selectedBriefs.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setIsProcessing(false);
  };

  const processMediaCombined = async () => {
    if (selectedIds.size === 0) return;
    
    const missingConfigs = [];
    if (!config.GEMINI_API_KEY) missingConfigs.push("Gemini API Key");
    if (!config.IMGBB_API_KEY) missingConfigs.push("ImgBB API Key");
    if (!config.COL_IMAGE) missingConfigs.push("Cột Link Ảnh (Đầu ra)");

    if (missingConfigs.length > 0) {
      addLog(`Thiếu cấu hình: ${missingConfigs.join(", ")}.`, 'error');
      setShowConfig(true);
      return;
    }
    
    setIsProcessing(true);
    setIsPaused(false);
    stopProcessingRef.current = false;
    setProgress({ current: 0, total: selectedIds.size, task: 'Tạo & Upload Media' });
    
    // Use the latest API Key from environment if available (for paid models)
    const apiKey = process.env.API_KEY || config.GEMINI_API_KEY;
    
    // Removed mandatory paid API key check for free tier compatibility
    
    let count = 0;
    
    const selectedBriefs = Array.from(selectedIds).map(id => briefs.find(b => b.id === id)).filter(Boolean) as Brief[];

    try {
      for (const brief of selectedBriefs) {
        // Re-initialize AI instance inside the loop
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config.GEMINI_API_KEY });
        
        if (stopProcessingRef.current) break;
        
        while (isPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (stopProcessingRef.current) break;
        }
        if (stopProcessingRef.current) break;

        try {
          let currentImageUrl = brief.imageUrl;
          let currentBase64 = brief.imageBase64;

          // 1. Generate if needed
          if ((!currentBase64 || isOverwrite) && brief.mediaFormat !== 'Video') {
            addLog(`[1/2] Đang tạo ảnh AI cho dòng ${brief.rowIndex}...`, 'info');
            
            // Step A: Generate Prompt with Retry
            let imagePrompt = 'A professional marketing image, high quality, photorealistic';
            let promptRetries = 0;
            const maxPromptRetries = 2;

            while (promptRetries <= maxPromptRetries) {
              try {
                const promptResponse = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: `Bạn là chuyên gia thiết kế hình ảnh marketing. Hãy tạo một PROMPT tiếng Anh chi tiết để AI tạo ảnh dựa trên các thông tin sau:
                  - Tóm tắt brief: ${Object.entries(brief.briefData).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  - Giọng văn: ${brief.tone || 'Chuyên nghiệp'}
                  - Nội dung bài viết (Content): ${brief.content || 'Không có'}
                  - Mô tả media mong muốn: ${brief.briefMedia || 'Professional marketing photo'}
                  - Ảnh tham chiếu (nếu có): ${brief.mediaReference || 'Không có'}
                  
                  Yêu cầu:
                  - Tập trung vào phong cách marketing chuyên nghiệp, ánh sáng đẹp, bố cục rõ ràng.
                  - KHÔNG dùng từ ngữ nhạy cảm.
                  - KHÔNG bao gồm các tham số kỹ thuật của Midjourney (như --ar, --v, --stylize, --chaos, v.v.).
                  - Tỉ lệ ảnh: ${brief.mediaSize || '1:1'}.
                  - Xuất kết quả là PROMPT TIẾNG ANH.`
                });
                
                // Clean up the prompt: remove any Midjourney parameters
                imagePrompt = (promptResponse.text || 'A beautiful marketing image')
                  .replace(/--[a-zA-Z0-9\s]+/g, '')
                  .trim();
                  
                addLog(`[info] Prompt tạo ảnh: ${imagePrompt}`, 'info');
                break;
              } catch (pErr: any) {
                if (promptRetries === maxPromptRetries) throw pErr;
                promptRetries++;
                addLog(`Thử lại tạo prompt lần ${promptRetries}...`, 'info');
                await new Promise(r => setTimeout(r, 2000 * promptRetries));
              }
            }

            // Step B: Generate Image with Retry
            let imageRetries = 0;
            const maxImageRetries = 3;
            let imageResponse: any = null;

            while (imageRetries <= maxImageRetries) {
              try {
                imageResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-flash-image',
                  contents: { parts: [{ text: imagePrompt }] },
                  config: {
                    imageConfig: {
                      aspectRatio: (brief.mediaSize || "1:1") as any
                    }
                  }
                });
                break;
              } catch (iErr: any) {
                // Nếu lỗi do tham chiếu ảnh, thử lại mà không dùng tham chiếu
                if (iErr.message?.includes('reference') || iErr.message?.includes('image')) {
                   addLog(`Lỗi tham chiếu ảnh, đang thử lại mà không dùng ảnh mẫu...`, 'info');
                   brief.mediaReference = ''; 
                }
                
                if (iErr.message?.includes('429') || iErr.message?.includes('quota')) {
                  addLog(`Hết hạn mức API hoặc quá tải. Đang chờ...`, 'info');
                  await new Promise(r => setTimeout(r, 10000));
                }
                if (imageRetries === maxImageRetries) throw iErr;
                imageRetries++;
                addLog(`Thử lại tạo ảnh lần ${imageRetries}...`, 'info');
                await new Promise(r => setTimeout(r, 3000 * imageRetries));
              }
            }
            
            const candidate = imageResponse?.candidates?.[0];
            currentBase64 = candidate?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
            
            if (!currentBase64) {
              const finishReason = candidate?.finishReason;
              // Capture any text explanation returned by the model
              const textExplanation = candidate?.content?.parts?.find((p: any) => p.text)?.text;
              
              if (finishReason === 'SAFETY') {
                throw new Error('Bị chặn do vi phạm chính sách an toàn (Safety Filter).');
              } else if (finishReason === 'RECITATION') {
                throw new Error('Bị chặn do vi phạm bản quyền (Recitation Filter).');
              } else {
                throw new Error(`Không nhận được dữ liệu ảnh. Lý do: ${finishReason || 'Không xác định'}.${textExplanation ? ` AI nói: ${textExplanation}` : ''}`);
              }
            }
            
            // Update state with base64
            setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, imageBase64: currentBase64, status: 'image_generated' } : b));
          }

          // 2. Upload if we have base64
          if (currentBase64 && brief.mediaFormat !== 'Video' && !currentImageUrl) {
            addLog(`[2/2] Đang upload ảnh cho dòng ${brief.rowIndex}...`, 'info');
            const formData = new FormData();
            formData.append('image', currentBase64);
            
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${config.IMGBB_API_KEY}`, {
              method: 'POST',
              body: formData
            });
            
            const data = await res.json();
            if (data.success) {
              currentImageUrl = data.data.url;
              setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, imageUrl: currentImageUrl, status: 'uploaded', statusDetail: 'Đã tạo & Upload' } : b));
              addLog(`Dòng ${brief.rowIndex}: Hoàn thành tạo & upload.`, 'success');
            } else {
              throw new Error(data.error?.message || "Upload thất bại.");
            }
          } else if (brief.mediaFormat === 'Video') {
            addLog(`Tính năng Video hàng loạt đang được cập nhật...`, 'info');
          }

          // Delay between briefs to avoid rate limits
          if (count < selectedBriefs.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        } catch (err: any) {
          addLog(`Lỗi dòng ${brief.rowIndex}: ${err.message}`, 'error');
          setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'error' } : b));
        } finally {
          count++;
          setProgress(p => ({ ...p, current: count }));
        }
      }
    } finally {
      setIsProcessing(false);
    }
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
        const sheetHeaders = Array.from(new Set((headerData.values?.[0] || []).map((h: any) => String(h).trim())));
        
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
          
          if (contentColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(contentColIdx)}${brief.rowIndex}`,
              values: [[brief.content || '']]
            });
          }
          if (imageColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(imageColIdx)}${brief.rowIndex}`,
              values: [[brief.imageUrl || '']]
            });
          }
          if (briefMediaColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(briefMediaColIdx)}${brief.rowIndex}`,
              values: [[brief.briefMedia || '']]
            });
          }
          if (mediaFormatColIdx !== -1) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(mediaFormatColIdx)}${brief.rowIndex}`,
              values: [[brief.mediaFormat || '']]
            });
          }
          if (mediaRefColIdx !== -1 && (!brief.mediaReference || !brief.mediaReference.startsWith('data:'))) {
            data.push({
              range: `'${tabTitle}'!${getColLetter(mediaRefColIdx)}${brief.rowIndex}`,
              values: [[brief.mediaReference || '']]
            });
          }
        }
        
        if (data.length === 0) {
           addLog('Không có cột nào hợp lệ để lưu.', 'info');
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
    if (filterTab === 'done') return brief.status === 'done' || brief.status === 'saved' || brief.statusDetail === 'Hoàn Thành';
    if (filterTab === 'pending') return brief.status === 'pending' || brief.statusDetail === 'Chưa Xử Lý' || brief.statusDetail === 'Chưa xử lý';
    if (filterTab === 'incomplete') return brief.status === 'incomplete' || (brief.status !== 'pending' && brief.status !== 'done' && brief.status !== 'saved' && brief.statusDetail !== 'Hoàn Thành');
    if (filterTab === 'review_content') return !brief.content && (!!brief.imageUrl || !!brief.imageBase64);
    if (filterTab === 'review_media') return !!brief.content && (!brief.imageUrl && !brief.imageBase64);
    return true;
  });

  return (
    <div className="h-screen w-screen bg-bg-primary flex overflow-hidden font-sans text-text-primary selection:bg-accent-primary/30 selection:text-accent-primary">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-accent-primary/10 blur-[160px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent-secondary/10 blur-[160px] rounded-full animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-indigo-500/5 blur-[120px] rounded-full" />
      </div>

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
        animate={{ width: isSidebarCollapsed ? 72 : 260 }}
        className="glass-panel shrink-0 h-screen flex flex-col z-30 relative transition-all duration-500 ease-in-out border-r border-white/5"
      >
        <div className="h-16 flex items-center px-5 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-accent-primary/40 shrink-0 transform hover:rotate-12 transition-transform duration-300">
            <LayoutPanelLeft size={18} />
          </div>
          {!isSidebarCollapsed && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="ml-3 flex flex-col">
              <span className="font-logo font-black text-2xl uppercase tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40">AI STUDIO</span>
            </motion.div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6 scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
          {/* Column Config */}
          {!isSidebarCollapsed && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-sans font-bold text-amber-400 uppercase tracking-widest">Cấu Hình Cột</h3>
                <button 
                  onClick={fetchHeaders} 
                  disabled={isFetchingHeaders}
                  className="text-text-muted hover:text-accent-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary/50"
                  title="Làm mới danh sách cột"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetchingHeaders ? "animate-spin" : ""}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-text-secondary">Cột Brief (Đầu Vào)</label>
                  <MultiSelectDropdown options={availableHeaders} selected={config.COL_BRIEFS || []} onChange={(val: string[]) => setConfig({...config, COL_BRIEFS: val})} label="Chọn Cột..." icon={FileText} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-text-secondary">Giọng Điệu Content</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_TONE || ''} onChange={(val: string) => setConfig({...config, COL_TONE: val})} label="Chọn Cột..." icon={MessageSquare} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-text-secondary">Cột Content (Đầu Ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_CONTENT} onChange={(val: string) => setConfig({...config, COL_CONTENT: val})} label="Chọn Cột..." icon={Edit3} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-text-secondary">Cột Link Ảnh (Đầu Ra)</label>
                  <SingleSelectDropdown options={availableHeaders} selected={config.COL_IMAGE} onChange={(val: string) => setConfig({...config, COL_IMAGE: val})} label="Chọn Cột..." icon={ImageIcon} />
                </div>
              </div>
            </div>
          )}

          {/* Setting Section */}
          <div className={`space-y-4 ${!isSidebarCollapsed ? 'pt-4 border-t border-white/5' : ''}`}>
            {!isSidebarCollapsed && (
              <h3 className="text-[11px] font-sans font-bold text-amber-400 uppercase tracking-widest px-1">Settings</h3>
            )}
            <div className="space-y-1">
              <button onClick={() => setShowConfig(true)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${showConfig ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'}`}>
                <Settings size={14} className="shrink-0" />
                {!isSidebarCollapsed && <span>Cấu Hình Hệ Thống</span>}
              </button>
              <button onClick={() => setIsLogExpanded(!isLogExpanded)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${isLogExpanded ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'}`}>
                <Terminal size={14} className="shrink-0" />
                {!isSidebarCollapsed && <span>Hệ Thống Logs</span>}
              </button>
              <button onClick={() => setShowGuide(true)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${showGuide ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'}`}>
                <BookOpen size={14} className="shrink-0" />
                {!isSidebarCollapsed && <span>Tài Liệu Hướng Dẫn</span>}
              </button>
              <button onClick={() => setShowComponentDesc(true)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${showComponentDesc ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'}`}>
                <Info size={14} className="shrink-0" />
                {!isSidebarCollapsed && <span>Mô Tả Thành Phần</span>}
              </button>
            </div>
          </div>
        </div>

        {/* User / Connection Status */}
        <div className="p-4 border-t border-white/5 shrink-0">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-bg-tertiary/50 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-status-success animate-pulse"></div>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-text-primary truncate">{user.displayName || user.email}</span>
                    <span className="text-[10px] text-text-muted">{accessToken ? 'Đã kết nối Google' : 'Chưa kết nối Google Sheet'}</span>
                  </div>
                )}
              </div>
              
              {!accessToken && !isSidebarCollapsed && (
                <button 
                  onClick={handleLogin} 
                  className="w-full flex items-center justify-center gap-2 py-2 bg-accent-primary/10 text-accent-primary border border-accent-primary/20 rounded-lg text-[11px] font-medium hover:bg-accent-primary/20 transition-colors"
                >
                  <Layers size={14} /> Kết Nối Google Sheet
                </button>
              )}
              
              {!isSidebarCollapsed && (
                <button 
                  onClick={handleLogout} 
                  className="w-full flex items-center justify-center gap-2 py-1.5 text-text-muted hover:text-status-danger transition-colors text-[9px] font-medium uppercase tracking-wider"
                >
                  <LogOut size={12} /> Đăng xuất
                </button>
              )}
            </div>
          ) : (
            <button onClick={handleLogin} className="w-full flex items-center justify-center gap-2 p-2 bg-bg-tertiary/50 hover:bg-white/5 border border-white/5 rounded-lg text-xs font-medium transition-colors">
              <LogIn size={16} />
              {!isSidebarCollapsed && <span>Đăng nhập</span>}
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-bg-tertiary/50 border border-white/5 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:border-accent-primary/50 transition-colors z-30 shadow-sm"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </motion.aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="glass-panel sticky top-0 z-20 h-16 flex items-center justify-between px-6 border-b border-white/5">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h2 className="text-2xl font-logo font-black text-text-primary tracking-tight uppercase">Dashboard</h2>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-[0.2em] mt-0.5">AI Marketing Content Engine</p>
            </div>
            
            <div className="h-8 w-px bg-white/5 mx-1"></div>
            <div className="flex items-center gap-3">
              {/* Spreadsheet Selection */}
              <div className="flex items-center gap-2 bg-bg-tertiary/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10 shadow-sm hover:border-accent-primary/40 transition-all group">
                <span className="text-[12px] text-accent-primary font-bold uppercase tracking-widest">File:</span>
                <div className="relative">
                  <select 
                    value={config.GOOGLE_SHEET_ID} 
                    disabled={!accessToken}
                    onChange={e => {
                      const newId = e.target.value;
                      const newConfig = {...config, GOOGLE_SHEET_ID: newId, SHEET_GID: ""};
                      setConfig(newConfig);
                      setSyncError(null);
                    }}
                    className="bg-transparent text-[13px] text-text-primary outline-none cursor-pointer appearance-none pr-6 font-medium hover:text-accent-primary transition-colors max-w-[180px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-bg-tertiary text-text-primary">
                      {!accessToken ? "-- Chưa đăng nhập --" : "-- Chọn File --"}
                    </option>
                    {availableSpreadsheets.map((ss, idx) => (
                      <option key={ss.id} value={ss.id} className="bg-bg-tertiary text-text-primary">{ss.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none group-hover:text-accent-primary transition-colors" size={12} />
                </div>
              </div>

              {/* Tab Selection */}
              <div className="flex items-center gap-2 bg-bg-tertiary/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10 shadow-sm hover:border-accent-primary/40 transition-all group">
                <span className="text-[12px] text-accent-primary font-bold uppercase tracking-widest">Sheet:</span>
                <div className="relative">
                  <select 
                    value={config.SHEET_GID} 
                    disabled={!config.GOOGLE_SHEET_ID || availableTabs.length === 0}
                    onChange={e => {
                      const newConfig = {...config, SHEET_GID: e.target.value};
                      setConfig(newConfig);
                      setSyncError(null);
                    }}
                    className="bg-transparent text-[13px] text-text-primary outline-none cursor-pointer appearance-none pr-6 font-medium hover:text-accent-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-bg-tertiary text-text-primary">
                      {!config.GOOGLE_SHEET_ID ? "-- Trống --" : "-- Chọn Tab --"}
                    </option>
                    {availableTabs.map((tab, idx) => (
                      <option key={tab.id} value={tab.id} className="bg-bg-tertiary text-text-primary">{tab.title}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none group-hover:text-accent-primary transition-colors" size={12} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            {syncError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full right-0 mt-2 bg-status-danger/10 border border-status-danger/30 text-status-danger text-[10px] px-3 py-1.5 rounded-lg whitespace-nowrap z-50 flex items-center gap-2 shadow-lg backdrop-blur-sm"
              >
                <AlertCircle size={12} />
                {syncError}
              </motion.div>
            )}
            <button onClick={handleSyncAction} disabled={isProcessing} className="btn-secondary"><Download size={16}/> Đồng Bộ Dữ Liệu</button>
            <button onClick={saveToSheet} disabled={isProcessing || selectedIds.size === 0} className="btn-primary"><Save size={16}/> Lưu về Sheet</button>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 flex overflow-hidden bg-bg-primary">
          {/* Table Area */}
          <div className="flex flex-col h-full border-r border-border-subtle flex-1 min-w-0">
            {/* Action Bar */}
            <div className="px-6 py-4 border-b border-white/5 bg-bg-primary/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 z-50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-bg-tertiary/80 px-3 py-1.5 rounded-lg border border-white/10 shadow-inner">
                  <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]"></div>
                  <span className="text-[12px] font-bold text-text-secondary uppercase tracking-widest">
                    Đã chọn: <span className="text-sm font-black text-accent-primary ml-1">{selectedIds.size}</span>
                  </span>
                </div>
                
                <div className="flex items-center gap-1 bg-bg-tertiary/80 p-1 rounded-xl border border-white/10 shadow-inner z-[9999]">
                  {[
                    { id: 'all', label: 'Tất Cả' },
                    { id: 'done', label: 'Đã Làm' },
                    { id: 'pending', label: 'Chưa Làm' },
                    { id: 'incomplete', label: 'Cần Hoàn Thiện' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        const newTab = tab.id as any;
                        setFilterTab(newTab);
                        const newConfig = { ...config, FILTER_TAB: newTab };
                        setConfig(newConfig);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${filterTab === tab.id ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/25' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <div className="relative z-[9999]">
                    <button
                      onClick={() => setShowReviewDropdown(!showReviewDropdown)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${filterTab === 'review_content' || filterTab === 'review_media' ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/25' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
                    >
                      Rà Soát
                      {showReviewDropdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showReviewDropdown && (
                      <div className="absolute top-full right-0 mt-1 bg-bg-secondary border border-white/10 rounded-lg shadow-lg z-[9999] p-1 min-w-[150px]">
                        <button
                          onClick={() => { setFilterTab('review_content'); setShowReviewDropdown(false); }}
                          className={`block w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${filterTab === 'review_content' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
                        >
                          Thiếu Content
                        </button>
                        <button
                          onClick={() => { setFilterTab('review_media'); setShowReviewDropdown(false); }}
                          className={`block w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${filterTab === 'review_media' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
                        >
                          Thiếu Media
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {selectedIds.size > 0 && (
                  <button onClick={() => setSelectedIds(new Set())} className="text-[12px] text-text-muted hover:text-status-danger transition-colors font-bold uppercase tracking-widest">
                    Bỏ chọn
                  </button>
                )}
                
                <div className="flex items-center gap-2 ml-2 pl-4 border-l border-white/10">
                  <input
                    type="checkbox"
                    id="overwrite-data"
                    className="w-4 h-4 rounded border-white/10 bg-bg-tertiary text-accent-primary focus:ring-accent-primary/30 transition-all cursor-pointer shadow-inner"
                    checked={isOverwrite}
                    onChange={e => setIsOverwrite(e.target.checked)}
                  />
                  <label htmlFor="overwrite-data" className="text-[11px] text-accent-primary font-bold uppercase tracking-widest cursor-pointer select-none">
                    Ghi đè dữ liệu cũ
                  </label>
                </div>
              </div>
              <div className="flex items-center bg-bg-tertiary/80 p-1 rounded-xl border border-white/10 shadow-inner">
                <button 
                  onClick={() => generateContent(isOverwrite)} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-text-primary group relative overflow-hidden"
                >
                  {isProcessing && progress.task === 'Tạo Content' ? (
                    <>
                      <Loader2 size={12} className="text-accent-primary animate-spin" />
                      <span className="animate-pulse">Đang tạo...</span>
                      <div className="absolute inset-0 shimmer opacity-20 pointer-events-none" />
                    </>
                  ) : (
                    <>
                      <Edit3 size={12} className="text-accent-primary group-hover:scale-110 transition-transform"/> Tạo Content
                    </>
                  )}
                </button>
                <div className="w-px h-4 bg-white/5 mx-1"></div>
                <button 
                  onClick={() => generateImage(isOverwrite)} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-text-primary group relative overflow-hidden"
                >
                  {isProcessing && progress.task === 'Tạo Ảnh AI' ? (
                    <>
                      <Loader2 size={12} className="text-accent-primary animate-spin" />
                      <span className="animate-pulse">Đang tạo...</span>
                      <div className="absolute inset-0 shimmer opacity-20 pointer-events-none" />
                    </>
                  ) : (
                    <>
                      <ImageIcon size={12} className="text-accent-primary group-hover:scale-110 transition-transform"/> Tạo Ảnh AI
                    </>
                  )}
                </button>
                <div className="w-px h-4 bg-white/5 mx-1"></div>
                <button 
                  onClick={uploadImages} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-text-primary group relative overflow-hidden"
                >
                  {isProcessing && progress.task === 'Upload Ảnh' ? (
                    <>
                      <Loader2 size={12} className="text-accent-primary animate-spin" />
                      <span className="animate-pulse">Đang Upload...</span>
                      <div className="absolute inset-0 shimmer opacity-20 pointer-events-none" />
                    </>
                  ) : (
                    <>
                      <UploadCloud size={12} className="text-accent-primary group-hover:scale-110 transition-transform"/> Upload Ảnh
                    </>
                  )}
                </button>
                <div className="w-px h-4 bg-white/5 mx-1"></div>
                <button 
                  onClick={processMediaCombined} 
                  disabled={isProcessing || selectedIds.size === 0} 
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 text-text-primary group"
                  title="Tạo ảnh AI và Upload lên ImgBB trong 1 bước"
                >
                  <Zap size={12} className="text-accent-primary group-hover:scale-110 transition-transform"/> Tạo & Lấy link Ảnh
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
                  className="px-6 py-3 bg-accent-primary/[0.03] border-b border-accent-primary/10 overflow-hidden shrink-0"
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-ping" />
                      <span className="text-[9px] font-bold text-accent-primary uppercase tracking-[0.2em]">{progress.task}</span>
                      <span className="text-[8px] font-bold text-text-muted px-1.5 py-0.5 bg-bg-tertiary rounded-md">{progress.current}/{progress.total}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 bg-bg-tertiary shadow-md border border-white/10 rounded-xl px-3 py-1.5">
                        <button 
                          onClick={() => {
                            setIsPaused(!isPaused);
                            isPausedRef.current = !isPaused;
                          }}
                          className="text-accent-primary hover:scale-110 transition-all flex items-center gap-2 font-bold text-[10px] tracking-wider"
                          title={isPaused ? "Tiếp tục" : "Tạm dừng"}
                        >
                          {isPaused ? (
                            <div className="w-3 h-3 border-2 border-current rounded-full flex items-center justify-center">
                              <div className="w-1 h-1 bg-current rounded-full"></div>
                            </div>
                          ) : (
                            <div className="relative w-3 h-3">
                              <div className="absolute inset-0 bg-current rounded-full animate-ping opacity-75"></div>
                              <div className="absolute inset-0 bg-current rounded-full"></div>
                            </div>
                          )}
                          <span>{isPaused ? "TIẾP TỤC" : "TẠM DỪNG"}</span>
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        <button 
                          onClick={() => {
                            stopProcessingRef.current = true;
                            setIsPaused(false);
                            setIsProcessing(false);
                          }}
                          className="text-status-danger hover:scale-110 transition-all flex items-center gap-2 font-bold text-[10px] tracking-wider"
                          title="Dừng hẳn"
                        >
                          <XCircle size={14} />
                          <span>DỪNG</span>
                        </button>
                      </div>
                      <span className="text-sm font-black text-accent-primary tabular-nums">{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden border border-white/5 p-0.5 shadow-inner">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                      className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary rounded-full relative"
                    >
                      <div className="absolute inset-0 shimmer opacity-40" />
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <table className="w-full min-w-[1200px] text-xs text-left border-separate border-spacing-y-2 border-spacing-x-0 table-fixed">
                <colgroup>
                  <col className="w-14" />
                  <col className="w-20" />
                  <col className="w-[400px]" />
                  <col className="w-[300px]" />
                  <col className="w-[200px]" />
                  <col className="w-[250px]" />
                  <col className="w-40" />
                </colgroup>
                <thead className="text-[10px] text-text-muted font-bold uppercase tracking-[0.2em] sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-md">
                  <tr>
                    <th className="p-4 text-center">
                      <input type="checkbox" 
                        className="w-4 h-4 rounded border-white/10 bg-bg-tertiary text-accent-primary focus:ring-accent-primary/30 transition-all cursor-pointer shadow-inner"
                        checked={filteredBriefs.length > 0 && Array.from(selectedIds).filter(id => filteredBriefs.some(b => b.id === id)).length === filteredBriefs.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Chỉ chọn các brief trong bộ lọc hiện tại, xóa hết các brief khác
                            const newSet = new Set(filteredBriefs.map(b => b.id));
                            setSelectedIds(newSet);
                            setIsWorkspaceCollapsed(false);
                          } else {
                            // Chỉ xóa các brief trong bộ lọc hiện tại
                            const newSet = new Set(selectedIds);
                            filteredBriefs.forEach(b => newSet.delete(b.id));
                            setSelectedIds(newSet);
                          }
                        }}
                      />
                    </th>
                    <th className="p-4 text-center">Dòng</th>
                    <th className="p-4">Tóm tắt Brief</th>
                    <th className="p-4">Mô tả Media</th>
                    <th className="p-4">Định dạng</th>
                    <th className="p-4">Tham chiếu</th>
                    <th className="p-4 text-right pr-8">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredBriefs.map((brief, idx) => {
                      const isProcessingThis = isProcessing && selectedIds.has(brief.id);
                      return (
                        <motion.tr 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={brief.id} 
                            className={`card-row bg-bg-tertiary/20 group relative overflow-hidden cursor-pointer ${activeBriefId === brief.id ? 'selected' : ''} ${isProcessingThis ? 'processing' : ''} hover:bg-bg-tertiary/40 transition-colors`}>
                          
                          <td className="p-4 text-center rounded-l-2xl border-y border-l border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative" onClick={e => e.stopPropagation()}>
                            {isProcessingThis && (
                              <div className="absolute inset-0 shimmer opacity-10 pointer-events-none z-0 w-[1200px]" />
                            )}
                            <input type="checkbox" 
                              className="custom-checkbox"
                              checked={selectedIds.has(brief.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedIds);
                                if (e.target.checked) {
                                  newSet.add(brief.id);
                                } else {
                                  newSet.delete(brief.id);
                                }
                                setSelectedIds(newSet);
                              }}
                            />
                          </td>
                          <td className="p-4 font-mono text-text-muted text-xs border-y border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative">
                            <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-white/5 flex items-center justify-center font-bold text-text-secondary group-hover:bg-white/5 group-hover:border-accent-primary/40 transition-all shadow-inner mx-auto">
                              {brief.rowIndex}
                            </div>
                          </td>
                          <td className="p-4 border-y border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative" onClick={() => setActiveBriefId(brief.id)}>
                            <div className="text-sm font-medium leading-relaxed text-text-primary line-clamp-2 mb-2 transition-colors font-sans">
                              {config.COL_BRIEFS.length > 0 ? brief.briefData[config.COL_BRIEFS[0]] || <span className="text-text-muted/40 italic font-normal">Trống</span> : <span className="text-text-muted/40 italic font-normal">Trống</span>}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-text-secondary line-clamp-1">
                              {config.COL_TONE && brief.tone && (
                                <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 shrink-0 font-bold uppercase tracking-widest text-[9px]">
                                  <MessageSquare size={8} className="fill-current" /> {brief.tone}
                                </span>
                              )}
                              {config.COL_BRIEFS.length > 1 && brief.briefData[config.COL_BRIEFS[1]] && (
                                <span className="truncate font-medium opacity-60">{brief.briefData[config.COL_BRIEFS[1]]}</span>
                              )}
                            </div>
                          </td>
                        <td className="p-4 border-y border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative">
                          <textarea 
                            className="w-full bg-bg-tertiary/30 border border-white/5 rounded-xl px-3 py-2 text-[11px] text-text-primary font-medium resize-none min-h-[70px] scrollbar-none focus:ring-1 focus:ring-accent-primary/30 focus:border-accent-primary/40 transition-all font-sans"
                            value={brief.briefMedia || ''}
                            onChange={(e) => updateBriefField(brief.id, 'briefMedia', e.target.value)}
                            placeholder="Nhập mô tả media..."
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-4 border-y border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative">
                          <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                            <div className="relative group/select">
                              <select 
                                className="w-full bg-bg-tertiary/30 border border-white/5 rounded-xl px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none cursor-pointer appearance-none shadow-inner"
                                value={brief.mediaFormat || 'Ảnh'}
                                onChange={(e) => updateBriefField(brief.id, 'mediaFormat', e.target.value as any)}
                              >
                                <option value="Ảnh">Ảnh</option>
                                <option value="Video">Video</option>
                              </select>
                              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none group-hover/select:text-accent-primary transition-colors" />
                            </div>
                            <div className="relative group/select">
                              <select 
                                className="w-full bg-bg-tertiary/30 border border-white/5 rounded-xl px-2 py-1.5 text-[9px] font-medium text-text-muted focus:ring-1 focus:ring-accent-primary/30 outline-none cursor-pointer appearance-none shadow-inner"
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
                              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none group-hover/select:text-accent-primary transition-colors" />
                            </div>
                          </div>
                        </td>
                        <td className="p-4 border-y border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative">
                          <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                            <div className="relative group/ref">
                              <input 
                                type="text"
                                className="w-full bg-bg-tertiary/30 border border-white/5 rounded-xl px-3 py-1.5 text-[9px] font-medium text-text-primary focus:ring-1 focus:ring-accent-primary/30 outline-none pr-8 shadow-inner"
                                value={brief.mediaReference?.startsWith('data:') ? '' : (brief.mediaReference || '')}
                                onChange={(e) => updateBriefField(brief.id, 'mediaReference', e.target.value)}
                                placeholder="Dán link ảnh..."
                              />
                              {brief.mediaReference?.startsWith('data:') && (
                                <div className="absolute inset-0 bg-accent-primary/10 flex items-center px-3 rounded-xl border border-accent-primary/30 pointer-events-none">
                                  <span className="text-[9px] text-accent-primary font-bold uppercase tracking-widest">Ảnh đã tải</span>
                                </div>
                              )}
                              {brief.mediaReference && (
                                <button 
                                  onClick={() => updateBriefField(brief.id, 'mediaReference', '')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-status-danger p-1 transition-colors"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                            <label className="flex items-center justify-center gap-2 py-1.5 bg-bg-tertiary/30 border border-dashed border-white/10 rounded-xl text-[9px] font-bold uppercase tracking-widest text-text-muted hover:border-accent-primary/50 hover:text-accent-primary hover:bg-accent-primary/5 transition-all cursor-pointer shadow-inner">
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
                        <td className="p-4 rounded-r-2xl border-y border-r border-white/5 group-hover:border-accent-primary/30 transition-all z-10 relative text-right pr-8">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={brief.status} />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryBriefId(brief.id);
                                }}
                                className="p-1.5 text-text-muted hover:text-accent-primary hover:bg-white/5 rounded-lg transition-all"
                                title="Lịch sử"
                              >
                                <History size={14} />
                              </button>
                            </div>
                            {brief.statusDetail && (
                              <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest opacity-60 line-clamp-1 max-w-[120px] text-right">{brief.statusDetail}</span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )})}
                  </AnimatePresence>
                  {briefs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-16 text-center">
                        <div className="flex flex-col items-center justify-center text-text-muted gap-4">
                          <button 
                            onClick={handleSyncAction}
                            disabled={isProcessing}
                            className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center border border-border-subtle hover:border-accent-primary hover:text-accent-primary transition-all hover:scale-110 active:scale-95 group/sync"
                          >
                            <Download size={24} className="text-text-secondary group-hover/sync:text-accent-primary transition-colors" />
                          </button>
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-sm font-bold text-text-primary mb-1">Chưa có dữ liệu</p>
                            <p className="text-xs">Hãy nhấn "Tải Dữ Liệu" để bắt đầu lấy dữ liệu từ Google Sheet.</p>
                            {syncError && (
                              <motion.p 
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-xs text-status-danger font-medium mt-2 flex items-center gap-1.5"
                              >
                                <AlertCircle size={12} />
                                {syncError}
                              </motion.p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel Wrapper */}
          <motion.div 
            initial={false}
            animate={{ width: isWorkspaceCollapsed ? 68 : 450, opacity: 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="flex flex-col bg-bg-secondary h-full shrink-0 relative z-40 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] border-l border-border-subtle"
          >
            {/* Global Toggle Button */}
            <button 
              onClick={() => setIsWorkspaceCollapsed(!isWorkspaceCollapsed)}
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-bg-secondary border border-border-subtle rounded-full flex items-center justify-center text-text-muted hover:text-accent-primary hover:border-accent-primary transition-all z-30 shadow-sm"
            >
              {isWorkspaceCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>

            <WorkspacePanel 
              selectedBriefs={briefs.filter(b => selectedIds.has(b.id))}
              onClose={() => setSelectedIds(new Set())}
              onContentClick={(brief) => setActiveBriefId(brief.id)}
              onImageClick={(brief) => setPreviewMedia({ 
                url: brief.imageBase64 ? `data:image/jpeg;base64,${brief.imageBase64}` : (brief.imageUrl || ''), 
                type: brief.mediaFormat === 'Video' ? 'video' : 'image' 
              })}
              isCollapsed={isWorkspaceCollapsed}
              onRetry={retryBrief}
            />
          </motion.div>
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
                  <button 
                    onClick={() => {
                      const lastInfoPrompt = [...logs].reverse().find(l => l.msg.includes('[info] Prompt tạo ảnh:'));
                      const lastError = [...logs].reverse().find(l => l.type === 'error');
                      if (!lastInfoPrompt || !lastError) {
                        alert("Chưa có đủ thông tin (Prompt hoặc Lỗi) để tạo báo cáo.");
                        return;
                      }
                      const report = `Prompt tạo ảnh: ${lastInfoPrompt.msg.replace('[info] Prompt tạo ảnh: ', '')}\n\nLỗi: ${lastError.msg}`;
                      navigator.clipboard.writeText(report);
                      alert("Đã copy báo cáo lỗi vào clipboard! Hãy gửi cho tôi nhé.");
                    }}
                    className="p-1.5 text-text-muted hover:text-accent-primary hover:bg-bg-tertiary rounded-md transition-colors text-[10px] font-bold uppercase tracking-wider" 
                    title="Copy báo cáo lỗi"
                  >
                    Copy Lỗi
                  </button>
                  <button onClick={() => setLogs([])} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors" title="Clear logs"><Trash2 size={14}/></button>
                  <button onClick={() => setIsLogExpanded(false)} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors" title="Close terminal"><X size={14}/></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px] scrollbar-thin scrollbar-thumb-border-medium scrollbar-track-transparent">
                <AnimatePresence>
                  {logs.map((log) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={log.id} 
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

      {/* Preview Panel Modal */}
      <AnimatePresence>
        {activeBriefId && (
          <PreviewPanel 
            brief={briefs.find(b => b.id === activeBriefId)!} 
            updateBrief={(id, updates) => setBriefs(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))}
            onClose={() => setActiveBriefId(null)}
            addLog={addLog}
            setPreviewMedia={setPreviewMedia}
            generateSingleContent={generateSingleContent}
            generateSingleImage={generateSingleImage}
          />
        )}
      </AnimatePresence>

      {/* Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setShowGuide(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-bg-secondary rounded-2xl shadow-2xl shadow-black/50 w-full max-w-3xl max-h-[85vh] flex flex-col border border-border-medium overflow-hidden"
              onClick={e => e.stopPropagation()}
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
                          <p className="text-[14px] font-bold text-accent-primary uppercase tracking-wider">Cột Brief</p>
                          <p className="text-base text-text-secondary">Chọn các cột chứa thông tin yêu cầu (ví dụ: Tên sản phẩm, Đặc điểm, Đối tượng). AI sẽ tổng hợp dữ liệu từ các cột này.</p>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-accent-primary uppercase tracking-wider">Giọng Điệu Content</p>
                          <p className="text-base text-text-secondary">Chọn cột quy định phong cách viết (ví dụ: Hài hước, Chuyên nghiệp, Đồng cảm). Giúp nội dung nhất quán với thương hiệu.</p>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-accent-primary uppercase tracking-wider">Cột Content</p>
                          <p className="text-base text-text-secondary">Cột đích để hệ thống tự động điền nội dung chi tiết sau khi AI tạo xong. Giúp đồng bộ dữ liệu về Google Sheet.</p>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-accent-primary uppercase tracking-wider">Cột Link Ảnh</p>
                          <p className="text-base text-text-secondary">Cột đích để hệ thống tự động điền đường dẫn hình ảnh hoặc video sau khi tạo. Giúp quản lý tài nguyên media dễ dàng.</p>
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
            onClick={() => setShowConfig(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-bg-secondary rounded-2xl shadow-2xl shadow-black/50 w-full max-w-2xl max-h-[85vh] flex flex-col border border-border-medium overflow-hidden"
              onClick={e => e.stopPropagation()}
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
                  <label className="block text-[15px] font-semibold text-text-secondary mb-1.5">Gemini API Key</label>
                  <input type="password" value={config.GEMINI_API_KEY} onChange={e => setConfig({...config, GEMINI_API_KEY: e.target.value})} className="w-full p-2.5 bg-bg-tertiary border border-border-medium rounded-xl focus:ring-2 focus:ring-accent-primary focus:border-accent-primary transition-all outline-none text-text-primary placeholder:text-text-muted" placeholder="Nhập API Key..." />
                  <details className="mt-2 text-sm text-text-muted group">
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
                        <li>Lấy key tại đây nếu chưa setup được: <a href="https://anotepad.com/notes/9br67ayg" target="_blank" rel="noreferrer" className="text-accent-primary underline">https://anotepad.com/notes/9br67ayg</a></li>
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

                      <details className="mt-3 text-sm text-text-muted group">
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
                          <p className="text-xs mt-2 italic">Chưa có Bảng tính? <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-accent-primary underline font-bold">Tạo Google Sheet mới ngay</a></p>
                          <p className="text-xs mt-1">* Nếu gặp lỗi "unauthorized-domain", hãy sao chép tên miền trên và thêm vào "Authorized domains" trong Firebase Console.</p>
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
                                  onChange={e => { setConfig({...config, GOOGLE_SHEET_ID: e.target.value}); setSyncError(null); }}
                                  className="w-full p-2.5 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary appearance-none bg-bg-tertiary text-text-primary pr-10"
                                >
                                  <option value="">-- Chọn một Bảng tính từ Drive --</option>
                                  {availableSpreadsheets.map((ss, idx) => (
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
                            <label className="block text-sm font-medium text-text-secondary mb-1">Google Sheet ID hoặc URL (Thủ công)</label>
                            <input 
                              type="text" 
                              value={config.GOOGLE_SHEET_ID} 
                              onChange={e => {
                                let val = e.target.value;
                                const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
                                if (match) val = match[1];
                                setConfig({...config, GOOGLE_SHEET_ID: val});
                                setSyncError(null);
                              }} 
                              className="w-full p-2 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary bg-bg-tertiary text-text-primary text-sm" 
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
                                    onChange={e => { setConfig({...config, SHEET_GID: e.target.value}); setSyncError(null); }}
                                    className="w-full p-2.5 border border-border-medium rounded-lg focus:ring-2 focus:ring-accent-primary appearance-none bg-bg-tertiary text-text-primary pr-10"
                                  >
                                    <option value="">-- Chọn Một Tab --</option>
                                    {availableTabs.map((tab, idx) => (
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
                      <li>Lấy key tại đây nếu chưa setup được: <a href="https://anotepad.com/notes/9br67ayg" target="_blank" rel="noreferrer" className="text-accent-primary underline">https://anotepad.com/notes/9br67ayg</a></li>
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
                        <div key={`kb-link-${idx}`} className="flex gap-2">
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
                          <div key={`kb-file-${idx}`} className="flex items-center justify-between p-2 bg-bg-tertiary border border-border-subtle rounded-lg group">
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
    if (contentColIdx > 0) {
      tab.getRange(item.rowIndex, contentColIdx).setValue(item.content || '');
    }
    if (imageColIdx > 0) {
      tab.getRange(item.rowIndex, imageColIdx).setValue(item.imageUrl || '');
    }
    if (briefMediaColIdx > 0) {
      tab.getRange(item.rowIndex, briefMediaColIdx).setValue(item.briefMedia || '');
    }
    if (mediaFormatColIdx > 0) {
      tab.getRange(item.rowIndex, mediaFormatColIdx).setValue(item.mediaFormat || '');
    }
    if (mediaRefColIdx > 0 && item.mediaReference && item.mediaReference.indexOf('data:') !== 0) {
      tab.getRange(item.rowIndex, mediaRefColIdx).setValue(item.mediaReference);
    } else if (mediaRefColIdx > 0 && !item.mediaReference) {
      tab.getRange(item.rowIndex, mediaRefColIdx).setValue('');
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
                      await setDoc(doc(db, 'userConfigs', user.uid), removeUndefined(config), { merge: true });
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
