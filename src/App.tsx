import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard,
  Receipt,
  Send,
  Upload,
  Play,
  CheckCircle2,
  RefreshCw,
  FileCode,
  BookOpen,
  Sparkles,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  ArrowRight,
  Clock,
  Coins,
  Users,
  Info,
  Terminal,
  Zap,
  Lock,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Eye,
  ZoomIn,
  ZoomOut,
  ShoppingBag,
  Tag,
  X,
  ExternalLink,
  Calendar,
  MapPin,
  FileText,
  User,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { QUICK_RECEIPTS, ReceiptData, ReceiptLineItem } from './data/receipts';

interface Expense {
  id: number;
  payer: string;
  amount: number;
  description: string;
  timestamp?: string;
  subtotal?: number;
  tax?: number;
  tip?: number;
  items?: ReceiptLineItem[];
  imageUrl?: string;
  paymentMethod?: string;
  merchant?: string;
  authCode?: string;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  sender?: string;
  isSystemNote?: boolean;
  content: string;
  detailedInfo?: string;
  showDetails?: boolean;
  imageUrl?: string;
  receiptData?: ReceiptData;
  parsedExpense?: Expense;
  timestamp: string;
  reaction?: {
    symbol: string;
    label: string;
    expenseId?: number;
    amount?: number;
  };
  ignored?: boolean;
  ignoredReason?: string;
}

interface SettlementTransfer {
  from_person: string;
  to_person: string;
  amount: number;
  authCode: string;
  cardFrom: string;
  cardTo: string;
}

interface SettlementResult {
  total: number;
  fair_share: number;
  balances: Record<string, number>;
  settlements: SettlementTransfer[];
}

// Words, interjections, and conversational filler that must NEVER be treated as person names
const NON_PERSON_WORDS = new Set([
  'done', 'just', 'also', 'then', 'so', 'okay', 'ok', 'hey', 'hi', 'hello',
  'cool', 'great', 'nice', 'sure', 'yes', 'yeah', 'yep', 'no', 'nope', 'well',
  'actually', 'already', 'finally', 'today', 'yesterday', 'tonight', 'now',
  'later', 'please', 'thanks', 'thank', 'thx', 'got', 'bought', 'paid',
  'added', 'logged', 'finished', 'checked', 'booked', 'ordered', 'spent',
  'covered', 'here', 'there', 'this', 'that', 'total', 'subtotal', 'amount',
  'bill', 'receipt', 'order', 'check', 'tip', 'tax', 'fee', 'cost', 'card',
  'visa', 'cash', 'money', 'dollar', 'dollars', 'bucks', 'trip', 'group',
  'team', 'everyone', 'someone', 'anyone', 'nobody', 'who', 'what', 'when',
  'where', 'why', 'how', 'which', 'can', 'could', 'will', 'would', 'should',
  'may', 'might', 'must', 'let', 'lets', "let's", 'my', 'our', 'your',
  'their', 'his', 'her', 'its', 'we', 'they', 'he', 'she', 'it', 'us',
  'me', 'myself', 'i', 'the', 'a', 'an', 'and', 'but', 'or', 'if',
  'because', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off',
  'on', 'onto', 'out', 'over', 'to', 'up', 'with', 'item', 'items', 'dinner',
  'lunch', 'breakfast', 'brunch', 'food', 'coffee', 'drinks', 'pizza', 'uber',
  'lyft', 'taxi', 'hotel', 'airbnb', 'flight', 'gas', 'groceries', 'snack',
  'snacks', 'water', 'beer', 'wine', 'bar', 'cafe', 'restaurant', 'all',
  'set', 'ready', 'sent', 'settled', 'split', 'splitting', 'alright', 'fine',
  'both', 'each', 'either', 'neither', 'same', 'such', 'good'
]);

function isInvalidPersonName(name: string | undefined | null): boolean {
  if (!name) return true;
  const clean = name.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!clean || clean.length < 2) return true;
  return NON_PERSON_WORDS.has(clean);
}

// Helper: Directly extract the full sentence containing the expense from user text
function extractExpenseSentence(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const sentences = trimmed.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return trimmed;

  const withNumber = sentences.find((s) => /\$?\s*\d+(?:\.\d{1,2})?/.test(s));
  if (withNumber) return withNumber;

  const withKeyword = sentences.find((s) =>
    /\b(?:paid|spent|bought|covered|charged|cost|total|order|bill|receipt|dinner|lunch|breakfast|food|coffee|uber|lyft|tea|drinks)\b/i.test(s)
  );
  if (withKeyword) return withKeyword;

  return trimmed;
}

// Completely cleans any unnecessary asterisks and formats bullets cleanly
function cleanAsterisks(text: string): string {
  if (!text) return '';
  let s = text;
  // Convert markdown bullet stars "* item" or "** item" to clean unicode bullets "• item"
  s = s.replace(/^(\s*)\*+\s+/gm, '$1• ');
  // Strip markdown bold **text** -> text
  s = s.replace(/\*\*+([^*]+)\*\*+/g, '$1');
  // Strip markdown italic *text* -> text
  s = s.replace(/\*+([^*]+)\*+/g, '$1');
  // Professional terminology: replace any game-like "player" or "players" terms with proper case
  s = s
    .replace(/\bPlayers\b/g, 'Participants')
    .replace(/\bPlayer\b/g, 'Participant')
    .replace(/\bplayers\b/g, 'participants')
    .replace(/\bplayer\b/g, 'participant');
  // Strip any remaining lone or repeated asterisks so zero * characters leak through
  s = s.replace(/\*+/g, '');
  return s.trim();
}

// Cleanly renders message content, eliminating raw asterisks and formatting bullets/code cleanly
function parseInlineFormatting(text: string): React.ReactNode[] {
  // First, completely strip any remaining asterisks so no '*' is ever rendered
  const cleanedText = text.replace(/\*/g, '');
  const tokens: React.ReactNode[] = [];
  
  // Split on inline code (`...`)
  const regex = /(`[^`]+`)/g;
  const parts = cleanedText.split(regex);

  parts.forEach((part, idx) => {
    if (!part) return;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      // Inline code
      const inner = part.slice(1, -1);
      tokens.push(
        <code key={idx} className="px-1.5 py-0.2 bg-slate-900/90 text-blue-300 font-mono text-[11px] rounded border border-slate-700/60 mx-0.5 font-medium">
          {inner}
        </code>
      );
    } else {
      tokens.push(<span key={idx}>{part}</span>);
    }
  });

  return tokens;
}

function FormattedMessageText({ content }: { content: string }) {
  if (!content) return null;

  // Clean all asterisks across the entire message content upfront
  const sanitizedContent = cleanAsterisks(content);
  const lines = sanitizedContent.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIdx} className="h-1" />;
        }

        // Check if line is a bullet item (starting with -, •, etc.)
        const isBullet = /^(-|•)\s+/.test(trimmed);
        const isNumbered = /^\d+\.\s+/.test(trimmed);

        let contentToParse = trimmed;
        let prefix: React.ReactNode = null;

        if (isBullet) {
          contentToParse = trimmed.replace(/^(-|•)\s+/, '');
          prefix = <span className="text-blue-400 font-bold shrink-0 select-none leading-normal">•</span>;
        } else if (isNumbered) {
          const numMatch = trimmed.match(/^(\d+\.)\s+/);
          contentToParse = trimmed.replace(/^\d+\.\s+/, '');
          prefix = <span className="text-blue-400 font-semibold font-mono shrink-0 select-none text-xs">{numMatch?.[1]}</span>;
        }

        const formattedTokens = parseInlineFormatting(contentToParse);

        if (prefix) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 text-xs sm:text-sm pl-1">
              {prefix}
              <div className="flex-1">{formattedTokens}</div>
            </div>
          );
        }

        return (
          <div key={lineIdx} className="text-xs sm:text-sm">
            {formattedTokens}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'sandbox' | 'code' | 'curriculum' | 'visadirect'>('sandbox');

  // Ledger state (simulating SQLite ledger.db) with rich itemized data
  const [expenses, setExpenses] = useState<Expense[]>([
    {
      id: 1,
      payer: 'Alice',
      amount: 90.0,
      description: 'Hackathon Airbnb & Wi-Fi',
      timestamp: '10:15 AM',
      subtotal: 78.5,
      tax: 11.5,
      tip: 0.0,
      items: [
        { name: 'Airbnb 2-Night Stay (Team Share)', quantity: 1, unitPrice: 70.0, totalPrice: 70.0 },
        { name: 'High-Speed Wi-Fi Booster Pass', quantity: 1, unitPrice: 8.5, totalPrice: 8.5 },
      ],
      paymentMethod: 'Visa •••• 4821',
      authCode: 'VD-AUTH-882190',
    },
    {
      id: 2,
      payer: 'Bob',
      amount: 30.0,
      description: 'Team Pizza & Energy Drinks',
      timestamp: '12:30 PM',
      subtotal: 24.0,
      tax: 2.2,
      tip: 3.8,
      items: [
        { name: 'Medium Cheese Pizza', quantity: 1, unitPrice: 16.0, totalPrice: 16.0 },
        { name: 'Monster Energy Drinks (4pk)', quantity: 1, unitPrice: 8.0, totalPrice: 8.0 },
      ],
      paymentMethod: 'Visa •••• 9104',
      authCode: 'VD-AUTH-419012',
    },
    {
      id: 3,
      payer: 'Charlie',
      amount: 15.0,
      description: 'Boba Tea & Snacks',
      timestamp: '03:45 PM',
      subtotal: 12.0,
      tax: 1.1,
      tip: 1.9,
      items: [
        { name: 'Brown Sugar Boba Milk (Large)', quantity: 2, unitPrice: 6.0, totalPrice: 12.0 },
      ],
      paymentMethod: 'Visa •••• 3356',
      authCode: 'VD-AUTH-650119',
    },
  ]);

  // Initial chat thread simulating genuine team communication
  const INITIAL_THREAD: ChatMessage[] = [
    {
      id: 'msg-alice-1',
      role: 'user',
      sender: 'Alice',
      content: "Hey team! Booked our Airbnb and Wi-Fi pass for the weekend ($90.00). Ready for the hackathon! 🏡",
      timestamp: '10:15 AM',
      parsedExpense: {
        id: 1,
        payer: 'Alice',
        amount: 90.0,
        description: 'Hackathon Airbnb & Wi-Fi',
        merchant: 'Airbnb',
        subtotal: 78.5,
        tax: 11.5,
        tip: 0.0,
        paymentMethod: 'Visa •••• 4821',
        authCode: 'VD-AUTH-882190',
      },
      reaction: {
        symbol: '✓',
        label: 'Recorded in ledger • $90.00',
        expenseId: 1,
        amount: 90.0,
      },
    },
    {
      id: 'msg-bob-1',
      role: 'user',
      sender: 'Bob',
      content: "Ordered medium pizza and a 4-pack of energy drinks for lunch ($30.00) 🍕",
      timestamp: '12:30 PM',
      parsedExpense: {
        id: 2,
        payer: 'Bob',
        amount: 30.0,
        description: 'Team Pizza & Energy Drinks',
        merchant: "Mario's Pizza",
        subtotal: 24.0,
        tax: 2.2,
        tip: 3.8,
        paymentMethod: 'Visa •••• 9104',
        authCode: 'VD-AUTH-419012',
      },
      reaction: {
        symbol: '✓',
        label: 'Recorded in ledger • $30.00',
        expenseId: 2,
        amount: 30.0,
      },
    },
    {
      id: 'msg-charlie-1',
      role: 'user',
      sender: 'Charlie',
      content: "Picked up brown sugar boba tea and snacks on the way over ($15.00).",
      timestamp: '03:45 PM',
      parsedExpense: {
        id: 3,
        payer: 'Charlie',
        amount: 15.0,
        description: 'Boba Tea & Snacks',
        merchant: 'Boba Cafe',
        subtotal: 12.0,
        tax: 1.1,
        tip: 1.9,
        paymentMethod: 'Visa •••• 3356',
        authCode: 'VD-AUTH-650119',
      },
      reaction: {
        symbol: '✓',
        label: 'Recorded in ledger • $15.00',
        expenseId: 3,
        amount: 15.0,
      },
    },
    {
      id: 'msg-system-divider',
      role: 'assistant',
      isSystemNote: true,
      content: "Trip expenses active • 4 participants • Mention @SplitBot anytime for bill splitting & balance settlement.",
      timestamp: '04:00 PM',
    },
  ];

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_THREAD);
  const [currentSender, setCurrentSender] = useState<'You' | 'Alice' | 'Bob' | 'Charlie'>('You');

  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [stagedReceipt, setStagedReceipt] = useState<ReceiptData | null>(null);
  const [selectedReceiptModal, setSelectedReceiptModal] = useState<ReceiptData | null>(null);
  const [zoomReceiptImage, setZoomReceiptImage] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pythonSource, setPythonSource] = useState<string>('');
  
  // Toggle more information breakdown on any chat message
  const toggleMessageDetails = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, showDetails: !m.showDetails } : m
      )
    );
  };
  
  // Settlement result state
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [showVisaSuccess, setShowVisaSuccess] = useState(false);

  // Settlement export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Manual entry modal (defaulting to the person currently messaging)
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualPayer, setManualPayer] = useState<string>(currentSender);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  // Helper to open record payment modal with currently messaging person defaulted
  const openRecordPaymentModal = () => {
    setManualPayer(currentSender);
    setManualAmount('');
    setManualDesc('');
    setShowAddModal(true);
  };

  useEffect(() => {
    setManualPayer(currentSender);
  }, [currentSender]);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load app.py source code for the code tab
  useEffect(() => {
    fetch('/api/code/app-py')
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (text) {
          setPythonSource(text);
        } else {
          setPythonSource(FALLBACK_APP_PY);
        }
      })
      .catch(() => {
        setPythonSource(FALLBACK_APP_PY);
      });
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Handle image upload from user or sample
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setUploadedImagePreview(base64);
        setUploadedImageBase64(base64);
        setStagedReceipt(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Quick receipt selection: stages the receipt image and opens inspector with numbers & items bought
  const handleSelectQuickReceipt = (receipt: ReceiptData, openInspector = true) => {
    setUploadedImagePreview(receipt.imageUrl);
    setUploadedImageBase64(receipt.imageUrl);
    setStagedReceipt(receipt);
    setInputPrompt(`${receipt.payer} paid $${receipt.total.toFixed(2)} for ${receipt.name} at ${receipt.merchant}`);
    if (openInspector) {
      setSelectedReceiptModal(receipt);
      setZoomReceiptImage(false);
    }
  };

  // Direct commit from inspector modal to ledger (Reacts with 👍 like, replies only when asked)
  const handleCommitReceiptFromModal = (receipt: ReceiptData) => {
    const newExpenseId = expenses.length > 0 ? Math.max(...expenses.map((e) => e.id)) + 1 : 1;
    const newExpenseItem: Expense = {
      id: newExpenseId,
      payer: receipt.payer,
      amount: receipt.total,
      description: receipt.name,
      merchant: receipt.merchant,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      subtotal: receipt.subtotal,
      tax: receipt.tax,
      tip: receipt.tip,
      items: receipt.items,
      imageUrl: receipt.imageUrl,
      paymentMethod: `Visa ${receipt.cardMask}`,
      authCode: receipt.authCode,
    };

    setExpenses((prev) => [...prev, newExpenseItem]);
    setSettlementResult(null);
    setShowVisaSuccess(false);

    // User message with clean checkmark tag (no unsolicited assistant reply)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      sender: receipt.payer === 'You' ? 'You' : receipt.payer,
      content: `${receipt.payer} paid $${receipt.total.toFixed(2)} at ${receipt.merchant} (${receipt.items.length} items purchased)`,
      imageUrl: receipt.imageUrl,
      receiptData: receipt,
      parsedExpense: newExpenseItem,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reaction: {
        symbol: '✓',
        label: `Recorded in ledger • $${receipt.total.toFixed(2)} (${receipt.payer})`,
        expenseId: newExpenseId,
        amount: receipt.total,
      },
    };

    setMessages((prev) => [...prev, userMsg]);
    setSelectedReceiptModal(null);
    setStagedReceipt(null);
    setUploadedImagePreview(null);
    setUploadedImageBase64(null);
    setInputPrompt('');
  };

  // Open inspector modal for any existing expense in ledger
  const openReceiptFromExpense = (expense: Expense) => {
    const qrMatch = QUICK_RECEIPTS.find(
      (q) => q.name === expense.description || q.merchant === expense.description || Math.abs(q.total - expense.amount) < 0.01
    );

    const items = expense.items && expense.items.length > 0 ? expense.items : [
      {
        name: expense.description,
        quantity: 1,
        unitPrice: expense.subtotal || expense.amount,
        totalPrice: expense.subtotal || expense.amount,
      }
    ];

    const subtotal = expense.subtotal ?? Math.round(expense.amount * 0.85 * 100) / 100;
    const tax = expense.tax ?? Math.round(expense.amount * 0.08 * 100) / 100;
    const tip = expense.tip ?? Math.round(expense.amount * 0.07 * 100) / 100;

    setSelectedReceiptModal({
      id: `exp-${expense.id}`,
      name: expense.description,
      merchant: expense.merchant || expense.description,
      category: 'Ledger Expense',
      address: qrMatch ? qrMatch.address : 'San Francisco, CA',
      date: 'OCT 12, 2026',
      time: expense.timestamp || '12:00 PM',
      payer: expense.payer,
      cardMask: expense.paymentMethod?.replace('Visa ', '') || (qrMatch ? qrMatch.cardMask : '•••• 9402'),
      authCode: expense.authCode || (qrMatch ? qrMatch.authCode : `VD-AUTH-${100000 + expense.id * 1421}`),
      subtotal,
      tax,
      taxRate: qrMatch ? qrMatch.taxRate : '8.75%',
      tip,
      tipRate: qrMatch ? qrMatch.tipRate : (tip > 0 ? '15.0%' : 'None'),
      total: expense.amount,
      items,
      imageUrl: expense.imageUrl || (qrMatch ? qrMatch.imageUrl : ''),
      notes: `SQLite Ledger Record #${expense.id} • Authorized for ${expense.payer}`,
    });
    setZoomReceiptImage(false);
  };

  // Helper: Extract payer from natural language text
  const extractPayerFromText = (text: string, defaultPayer: string = 'You'): string => {
    let clean = text.trim();
    if (!clean) return defaultPayer;

    // Strip conversational prefixes at the start of the message (e.g. "Done,", "Done! ", "Done - ", "Okay,", "Hey,")
    clean = clean.replace(/^(?:done|ok|okay|hey|hi|hello|cool|great|nice|sure|yes|yeah|yep|no|well|alright|thanks|thank you)[!.,\s-]+/i, '').trim();
    if (!clean) return defaultPayer;

    // 1. Explicit user declaration: "I paid", "I spent", "I bought", "I covered", "paid by me"
    if (
      /\b(?:i|me|myself)\s+(?:paid|spent|bought|covered|charged)\b/i.test(clean) ||
      /\b(?:paid|covered)\s+by\s+(?:me|myself)\b/i.test(clean) ||
      /^i\b/i.test(clean)
    ) {
      return defaultPayer;
    }

    // 2. Explicit "paid by [Name]", "covered by [Name]", "from [Name]"
    const byMatch = clean.match(/\b(?:paid|covered|bought)\s+by\s+([A-Za-z]+)\b/i);
    if (byMatch) {
      const candidate = byMatch[1];
      if (!isInvalidPersonName(candidate)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
      }
    }

    // 3. "[Name] paid", "[Name] spent", "[Name] bought", "[Name] covered"
    const verbMatch = clean.match(/\b([A-Za-z]+)\s+(?:paid|spent|bought|covered|charged)\b/i);
    if (verbMatch) {
      const candidate = verbMatch[1];
      if (!isInvalidPersonName(candidate)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
      }
    }

    // 4. Starting with explicit Name prefix before colon or dash: e.g. "Alice: $45 for lunch" or "Bob - $30"
    const prefixMatch = clean.match(/^([A-Za-z]+)\s*[:\-–]\s*/);
    if (prefixMatch) {
      const candidate = prefixMatch[1];
      if (!isInvalidPersonName(candidate)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
      }
    }

    return defaultPayer;
  };

  // Helper: Detect if user message is asking a question, discussing bill splitting, or inquiring about what people paid
  const isQuestionOrAsk = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    if (!t) return false;
    if (t.includes('?')) return true;
    if (isCalledByName(t)) return true;

    // Talking about bill splitting
    const splitKeywords = [
      'split', 'splitting', 'bill split', 'fair share', 'settle', 'settlement',
      'balances', 'balance', 'who owes', 'pool', 'equal share', 'how much do i owe',
      'how much does everyone owe', 'how much do we owe', 'share the bill'
    ];
    if (splitKeywords.some((k) => t.includes(k))) {
      // If it doesn't declare a specific expense payment, it's a split discussion!
      const hasSpecificExpenseNumbers = /\$?\d+(?:\.\d{1,2})?|\b(?:dollars|bucks)\b/i.test(t);
      const isDeclaringExpense = /\b(?:i|alice|bob|sarah|david|elena|marcus|charlie|[a-z]+)\s+(?:paid|spent|bought|covered)\s+\$?\d+/i.test(t);
      if (!isDeclaringExpense || !hasSpecificExpenseNumbers) {
        return true;
      }
    }

    // Talking about what other people paid
    const paymentInquiryKeywords = [
      'who paid', 'who payed', 'what did', 'how much did', 'did anyone pay',
      'did someone pay', 'what other people paid', 'what did other people pay',
      'what others paid', 'what did others pay', 'what everyone paid',
      'what did everyone pay', 'who covered', 'who bought', 'who spent',
      'who has paid', 'did alice pay', 'did bob pay', 'did sarah pay',
      'did david pay', 'who paid for'
    ];
    if (paymentInquiryKeywords.some((k) => t.includes(k))) return true;

    const triggers = [
      'what', 'how', 'who', 'why', 'when', 'where',
      'can you', 'could you', 'tell me', 'show me', 'show', 'explain',
      'break down', 'breakdown', 'summarize', 'summary',
      'did you', 'did we', 'is it', 'is there', 'are there', 'do we',
      'list', 'check', 'which', 'help', 'details', 'who owes', 'status',
      'how much', 'who paid', 'who payed', 'let\'s', 'lets', 'can we', 'should we', 'we should', 'we need to'
    ];
    return triggers.some((tr) => t.startsWith(tr) || t.includes(` ${tr} `) || t.includes(` ${tr}?`));
  };

  // Helper: Detect if user specifically called the assistant by name (@SplitBot or SplitBot)
  const isCalledByName = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    return (
      t.includes('@splitbot') ||
      t.includes('splitbot') ||
      t.includes('@bot') ||
      t.includes('@ai') ||
      t.includes('split bot') ||
      t.includes('@split')
    );
  };

  // Helper: Detect if inquiry asks for overall bill splitting / group settlement
  const isOverallBillSplitting = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    const overallPatterns = [
      'who owes',
      'who owes what',
      'who owes who',
      'who owes whom',
      'fair share',
      'bill split',
      'split the bill',
      'split bill',
      'how to split',
      'how do we split',
      'how much do i owe',
      'how much does everyone owe',
      'how much do we each owe',
      'settle',
      'settlement',
      'balances',
      'group balance',
      'group pool',
      'total pool',
      'total spent',
      'total bill',
      'how much total',
      'what is the total',
      'overall total',
      'overall bill',
      'overall split',
      'equal share',
      'final balance',
      'split expenses',
      'summary of pool',
    ];
    return overallPatterns.some((p) => t.includes(p));
  };

  // Helper: Check if query or statement is genuinely about purchasing, spending money, or group ledger data
  const isFinancialOrLedgerInquiry = (text: string, currentExpenses: Expense[]): boolean => {
    const t = text.trim().toLowerCase();
    const financialTerms = [
      'spend', 'spent', 'pay', 'paid', 'payer', 'cost', 'owe', 'owes', 'balance', 'balances',
      'total', 'pool', 'share', 'fair share', 'split', 'settle', 'settlement', 'tax', 'tip',
      'receipt', 'item', 'items', 'bought', 'purchase', 'purchased', 'order', 'dollar', 'dollars',
      'bucks', 'money', 'visa', 'card', 'transaction', 'transactions', 'ledger', 'how much',
      'who paid', 'who owes', 'did we pay', 'what did', 'breakdown', 'summary', '$', 'fee', 'charge'
    ];
    const matchesKeyword = financialTerms.some((k) => t.includes(k));
    const matchesLedgerData = currentExpenses.some((e) =>
      (e.payer && t.includes(e.payer.toLowerCase())) ||
      (e.description && t.includes(e.description.toLowerCase())) ||
      (e.merchant && t.includes(e.merchant.toLowerCase()))
    );
    return matchesKeyword || matchesLedgerData;
  };

  // Helper: Check if input represents an expense declaration with specific monetary numbers
  const isPurchaseWithNumbers = (text: string, hasImageOrReceipt: boolean): boolean => {
    if (hasImageOrReceipt) return true;
    const t = text.trim().toLowerCase();
    if (!t) return false;

    // Must have numerical digits or written number/currency words
    const hasNumbers = /\$?\d+(?:\.\d+)?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)\b/i.test(t);
    // Must have purchasing/spending context
    const hasPurchaseKeywords = /(paid|spent|bought|cost|charge|charged|bill|receipt|dinner|lunch|breakfast|coffee|drinks|pizza|uber|lyft|ride|airbnb|hotel|tickets|split|owe|dollars|bucks|\$|fee|tip|tax|ordered|purchased)/i.test(t);

    return hasNumbers && hasPurchaseKeywords;
  };

  interface LocalAnswer {
    shortReply: string;
    detailedInfo: string;
  }

  // Local rule-based fallback answer generator returning short answer by default and rich detailedInfo
  const generateLocalFallbackAnswer = (query: string, expensesList: Expense[]): LocalAnswer => {
    const q = query.toLowerCase();
    const total = expensesList.reduce((sum, e) => sum + e.amount, 0);
    const payers = Array.from(new Set(expensesList.map((e) => e.payer)));
    const fairShare = payers.length > 0 ? total / payers.length : 0;

    // Specific query: who paid for car / ride
    const carTerms = ['car', 'ride', 'lyft', 'uber', 'taxi', 'drive'];
    if (carTerms.some((term) => q.includes(term))) {
      const carExp = expensesList.find((e) =>
        carTerms.some(
          (term) =>
            (e.description || '').toLowerCase().includes(term) ||
            (e.merchant || '').toLowerCase().includes(term)
        )
      );
      if (carExp) {
        return {
          shortReply: `🚗 ${carExp.payer} paid $${carExp.amount.toFixed(2)} for "${carExp.description}".`,
          detailedInfo: `• Transaction ID: #${carExp.id} in SQLite ledger.db\n• Merchant: ${carExp.merchant || carExp.description}\n• Amount: $${carExp.amount.toFixed(2)} (Subtotal: $${(carExp.subtotal || carExp.amount).toFixed(2)}, Tax: $${(carExp.tax || 0).toFixed(2)}, Tip: $${(carExp.tip || 0).toFixed(2)})\n• Payment Method: ${carExp.paymentMethod || 'Visa Direct'}\n• Timestamp: ${carExp.timestamp || 'Recorded in ledger'}`,
        };
      } else {
        return {
          shortReply: `🚗 No expense for a car or ride is recorded in ledger.db yet.`,
          detailedInfo: `• Total Expenses in Ledger: ${expensesList.length}\n• Current Transactions:\n` +
            expensesList.map((e) => `  • ID #${e.id}: ${e.payer} paid $${e.amount.toFixed(2)} for "${e.description}"`).join('\n') +
            `\n• You can attach a Lyft/Uber receipt or type "Dan paid $45 for ride" to log one.`,
        };
      }
    }

    // Check if query asks who paid for other specific items
    for (const exp of expensesList) {
      const desc = (exp.description || '').toLowerCase();
      const words = desc.split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => q.includes(w))) {
        return {
          shortReply: `🧾 ${exp.payer} paid $${exp.amount.toFixed(2)} for "${exp.description}".`,
          detailedInfo: `• Ledger Record: #${exp.id}\n• Subtotal: $${(exp.subtotal || exp.amount).toFixed(2)}, Tax: $${(exp.tax || 0).toFixed(2)}, Tip: $${(exp.tip || 0).toFixed(2)}\n• Items: ${(exp.items || []).map((i) => `${i.quantity}x ${i.name} ($${(i.totalPrice || (i.unitPrice * i.quantity)).toFixed(2)})`).join(', ') || 'N/A'}\n• Auth Code: ${exp.authCode || 'VD-AUTH-MOCK'}`,
        };
      }
    }

    // Check if query asks what other people paid or what everyone paid
    if (
      q.includes('what did other') ||
      q.includes('what other people paid') ||
      q.includes('what others paid') ||
      q.includes('what did others pay') ||
      q.includes('what everyone paid') ||
      q.includes('what did everyone pay') ||
      q.includes('who paid what') ||
      q.includes('what people paid')
    ) {
      const listSummary = payers.map((p) => {
        const pAmt = expensesList.filter((e) => e.payer.toLowerCase() === p.toLowerCase()).reduce((s, e) => s + e.amount, 0);
        return `${p} paid $${pAmt.toFixed(2)}`;
      });
      return {
        shortReply: `👥 Participant payments: ${listSummary.join(', ')} ($${total.toFixed(2)} total group pool).`,
        detailedInfo: `• Total Group Spending: $${total.toFixed(2)}\n• Equal Share: $${fairShare.toFixed(2)} per person\n• Breakdown by Participant:\n` +
          payers.map((p) => {
            const pExps = expensesList.filter((e) => e.payer.toLowerCase() === p.toLowerCase());
            const pAmt = pExps.reduce((s, e) => s + e.amount, 0);
            return `  • ${p}: Total $${pAmt.toFixed(2)} (${pExps.length} expense(s))\n` +
              pExps.map((e) => `    - #${e.id}: $${e.amount.toFixed(2)} for "${e.description}"`).join('\n');
          }).join('\n'),
      };
    }

    if (q.includes('who owes') || q.includes('fair share') || q.includes('split') || q.includes('balance') || q.includes('settle')) {
      const balances = payers.map(p => {
        const paid = expensesList.filter(e => e.payer === p).reduce((s, e) => s + e.amount, 0);
        const net = paid - fairShare;
        return { person: p, paid, net };
      });

      const netSummary = balances.map(b =>
        `• ${b.person}: paid $${b.paid.toFixed(2)} (${b.net >= 0 ? `+$${b.net.toFixed(2)} to receive` : `-$${Math.abs(b.net).toFixed(2)} to pay`})`
      ).join('\n');

      return {
        shortReply: `⚖️ Fair share is $${fairShare.toFixed(2)} per person across ${payers.length} participants ($${total.toFixed(2)} total pool).`,
        detailedInfo: `• Total Pool: $${total.toFixed(2)}\n• Teammates: ${payers.join(', ') || 'None'}\n• Fair Share Calculation: $${total.toFixed(2)} ÷ ${payers.length || 1} = $${fairShare.toFixed(2)}/person\n\nIndividual Balances:\n${netSummary}\n\nPush-to-card settlements can be processed in the Visa Direct Settlement panel on the right!`,
      };
    }

    if (q.includes('tax') || q.includes('tip')) {
      const relevant = expensesList.filter((e) => (e.tax && e.tax > 0) || (e.tip && e.tip > 0));
      const totalTax = expensesList.reduce((s, e) => s + (e.tax || 0), 0);
      const totalTip = expensesList.reduce((s, e) => s + (e.tip || 0), 0);
      return {
        shortReply: `🧾 Group total tax is $${totalTax.toFixed(2)} and tip is $${totalTip.toFixed(2)}.`,
        detailedInfo: `• Total Tax: $${totalTax.toFixed(2)}\n• Total Tip: $${totalTip.toFixed(2)}\n• Transactions with Tax/Tip:\n` +
          (relevant.length > 0 
            ? relevant.map((e) => `  • ${e.payer} at ${e.description}: Tax = $${(e.tax || 0).toFixed(2)}, Tip = $${(e.tip || 0).toFixed(2)} (Total: $${e.amount.toFixed(2)})`).join('\n')
            : '  • No itemized tax or tip recorded yet.'),
      };
    }

    if (q.includes('item') || q.includes('bought') || q.includes('receipt')) {
      const relevant = expensesList.filter((e) => e.items && e.items.length > 0);
      const count = relevant.reduce((s, e) => s + (e.items?.length || 0), 0);
      return {
        shortReply: `🛒 ${count} item(s) are recorded across ${relevant.length} receipt(s) in ledger.db.`,
        detailedInfo: `• Itemized Receipts Breakdown:\n` +
          relevant.map((e) => `  • ${e.description} (${e.payer}): ${e.items?.map((i) => `${i.quantity}x ${i.name} ($${(i.totalPrice || (i.unitPrice * i.quantity)).toFixed(2)})`).join(', ')}`).join('\n'),
      };
    }

    if (q.includes('total') || q.includes('how much') || q.includes('pool')) {
      return {
        shortReply: `💰 Total group pool is $${total.toFixed(2)} across ${expensesList.length} transaction(s).`,
        detailedInfo: `• Total Amount: $${total.toFixed(2)}\n• Total Entries: ${expensesList.length}\n• Individual Ledger Records:\n` +
          expensesList.map((e) => `  • ID #${e.id}: ${e.payer} paid $${e.amount.toFixed(2)} for "${e.description}"`).join('\n'),
      };
    }

    const mentionedPayer = payers.find((p) => q.includes(p.toLowerCase()));
    if (mentionedPayer) {
      const payerExpenses = expensesList.filter((e) => e.payer.toLowerCase() === mentionedPayer.toLowerCase());
      const payerTotal = payerExpenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        shortReply: `👤 ${mentionedPayer} has paid $${payerTotal.toFixed(2)} across ${payerExpenses.length} transaction(s).`,
        detailedInfo: `• Payer: ${mentionedPayer}\n• Total Amount Paid: $${payerTotal.toFixed(2)}\n• Transactions:\n` +
          payerExpenses.map((e) => `  • #${e.id}: $${e.amount.toFixed(2)} - ${e.description}`).join('\n'),
      };
    }

    return {
      shortReply: `📊 Total pool is $${total.toFixed(2)} across ${expensesList.length} transactions between ${payers.join(', ') || 'team'}.`,
      detailedInfo: `• Equal Fair Share: $${fairShare.toFixed(2)} per person\n• To check specific items or individual numbers, call @SplitBot by name!`,
    };
  };

  // Handle asking questions to the AI (Supports talking about splitting the bill and what other people paid)
  const handleAskQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q) return;

    const calledByName = isCalledByName(q);
    const overallBillSplitting = isOverallBillSplitting(q);
    const qLower = q.toLowerCase();

    // Check if query is about bill splitting, what other people paid, or group ledger data
    const isSplittingOrPaymentInquiry =
      calledByName ||
      overallBillSplitting ||
      qLower.includes('split') ||
      qLower.includes('splitting') ||
      qLower.includes('fair share') ||
      qLower.includes('who owes') ||
      qLower.includes('settle') ||
      qLower.includes('settlement') ||
      qLower.includes('balance') ||
      qLower.includes('who paid') ||
      qLower.includes('who payed') ||
      qLower.includes('what did') ||
      qLower.includes('how much did') ||
      qLower.includes('what other people paid') ||
      qLower.includes('what others paid') ||
      qLower.includes('what did others pay') ||
      qLower.includes('what everyone paid') ||
      qLower.includes('what did everyone pay') ||
      qLower.includes('who paid what') ||
      qLower.includes('what people paid') ||
      qLower.includes('who covered') ||
      qLower.includes('who bought') ||
      qLower.includes('who spent') ||
      qLower.includes('total') ||
      qLower.includes('pool') ||
      qLower.includes('tax') ||
      qLower.includes('tip') ||
      qLower.includes('car') ||
      qLower.includes('ride') ||
      qLower.includes('receipt') ||
      qLower.includes('ledger') ||
      qLower.includes('cost') ||
      qLower.includes('dollar') ||
      qLower.includes('$') ||
      expenses.some((e) =>
        (e.payer && qLower.includes(e.payer.toLowerCase())) ||
        (e.description && qLower.includes(e.description.toLowerCase())) ||
        (e.merchant && qLower.includes(e.merchant.toLowerCase()))
      );

    // If not calling SplitBot and not a financial or bill-splitting inquiry, post as clean peer communication!
    if (!isSplittingOrPaymentInquiry) {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        sender: currentSender,
        content: q,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userMsg]);
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      sender: currentSender,
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          expenses,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ignored) {
          // If called by name explicitly, give a brief helpful guide; otherwise keep AI quiet
          if (calledByName) {
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: "I specialize in bill splitting, expenses, and ledger settlements. Ask me 'Who owes what?', 'What did Alice pay?', or 'Let's split the bill'.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          return;
        }

        if (data.reply) {
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: cleanAsterisks(data.reply),
            detailedInfo: data.detailedInfo ? cleanAsterisks(data.detailedInfo) : undefined,
            showDetails: false,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          return;
        }
      }

      const local = generateLocalFallbackAnswer(q, expenses);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanAsterisks(local.shortReply),
        detailedInfo: cleanAsterisks(local.detailedInfo),
        showDetails: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const local = generateLocalFallbackAnswer(q, expenses);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanAsterisks(local.shortReply),
        detailedInfo: cleanAsterisks(local.detailedInfo),
        showDetails: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit expense via Gemini API (Only responds with 👍 like on process; responds with text ONLY if asked; ignores non-purchases)
  const handleSubmitExpense = async (directReceiptData?: ReceiptData) => {
    const receiptToProcess = directReceiptData || stagedReceipt;
    const userText = inputPrompt.trim();
    const hasAttachment = Boolean(uploadedImageBase64 || receiptToProcess);

    // If pure question without receipt or image attached, route to handleAskQuestion
    if (!hasAttachment && isQuestionOrAsk(userText)) {
      setInputPrompt('');
      await handleAskQuestion(userText);
      return;
    }

    if (!userText && !hasAttachment) return;

    const currentImg = uploadedImageBase64 || receiptToProcess?.imageUrl || null;
    const currentImgPreview = uploadedImagePreview || receiptToProcess?.imageUrl || null;
    const askedQuestion = isQuestionOrAsk(userText);

    // Check if input is about purchasing or spending money with specific numbers
    const isPurchase = isPurchaseWithNumbers(userText, hasAttachment);

    // If NOT a purchase with numbers (and not an attached receipt):
    if (!isPurchase) {
      setInputPrompt('');
      setUploadedImageBase64(null);
      setUploadedImagePreview(null);
      setStagedReceipt(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Post directly as a natural team conversation message!
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        sender: currentSender,
        content: userText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userMsg]);
      return;
    }

    // Reset inputs
    setInputPrompt('');
    setUploadedImageBase64(null);
    setUploadedImagePreview(null);
    setStagedReceipt(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Author of the message is always currentSender
    const authorSender = currentSender;

    // Detect if text explicitly names who paid the expense (e.g. "Bob paid $45" or "Alice: $30")
    const detectedPayer = extractPayerFromText(userText, currentSender);

    // Add user message with authorSender
    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      sender: authorSender,
      content: userText || (receiptToProcess ? `Uploaded ${receiptToProcess.merchant} receipt for analysis.` : 'Uploaded a receipt.'),
      imageUrl: currentImgPreview || undefined,
      receiptData: receiptToProcess || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Call backend route
      const response = await fetch('/api/gemini/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userText,
          imageBase64: currentImg,
          quickReceiptData: receiptToProcess || undefined,
          currentSender,
        }),
      });

      let parsedData: any;

      if (response.ok) {
        parsedData = await response.json();
      } else {
        parsedData = heuristicParse(userText, receiptToProcess);
      }

      if (parsedData.ignored || parsedData.isExpense === false) {
        // If not recognized as expense, keep as clean user chat message without error banners
        return;
      }

      // Add to expenses table
      const newExpenseId = expenses.length > 0 ? Math.max(...expenses.map((e) => e.id)) + 1 : 1;
      let rawPayer = parsedData.payer ? parsedData.payer.trim() : '';
      if (isInvalidPersonName(rawPayer)) {
        rawPayer = '';
      }
      if (!rawPayer || rawPayer.toLowerCase() === 'you') {
        if (detectedPayer && !isInvalidPersonName(detectedPayer) && detectedPayer.toLowerCase() !== 'you') {
          rawPayer = detectedPayer;
        } else {
          rawPayer = authorSender;
        }
      }
      const cleanPayer = rawPayer.charAt(0).toUpperCase() + rawPayer.slice(1);
      const cleanAmount = Number(parsedData.amount) || receiptToProcess?.total || 20.0;
      // Directly include the full sentence of the text message it was included in
      const cleanDesc = userText ? extractExpenseSentence(userText) : (parsedData.description || receiptToProcess?.name || 'Expense');

      const newExpenseItem: Expense = {
        id: newExpenseId,
        payer: cleanPayer,
        amount: Math.round(cleanAmount * 100) / 100,
        description: cleanDesc,
        merchant: parsedData.merchant && parsedData.merchant !== cleanDesc ? parsedData.merchant : (receiptToProcess?.merchant || cleanDesc),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        subtotal: parsedData.subtotal !== undefined ? parsedData.subtotal : receiptToProcess?.subtotal,
        tax: parsedData.tax !== undefined ? parsedData.tax : receiptToProcess?.tax,
        tip: parsedData.tip !== undefined ? parsedData.tip : receiptToProcess?.tip,
        items: parsedData.items && parsedData.items.length > 0 ? parsedData.items : [{ name: cleanDesc, quantity: 1, unitPrice: cleanAmount, totalPrice: cleanAmount }],
        imageUrl: currentImgPreview || receiptToProcess?.imageUrl,
        paymentMethod: parsedData.paymentMethod || (receiptToProcess ? `Visa ${receiptToProcess.cardMask}` : 'Visa •••• 9402'),
        authCode: receiptToProcess?.authCode,
      };

      setExpenses((prev) => [...prev, newExpenseItem]);
      // Invalidate existing settlement cache
      setSettlementResult(null);
      setShowVisaSuccess(false);

      // Subtle, clean ledger recording tag
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsgId
            ? {
                ...m,
                parsedExpense: newExpenseItem,
                reaction: {
                  symbol: '✓',
                  label: `Added to ledger • $${newExpenseItem.amount.toFixed(2)} (${newExpenseItem.payer})`,
                  expenseId: newExpenseId,
                  amount: newExpenseItem.amount,
                },
              }
            : m
        )
      );

      // Respond if user also asked a question in their message:
      if (askedQuestion) {
        const askRes = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            expenses: [...expenses, newExpenseItem],
            context: `User just added expense #${newExpenseId}: ${newExpenseItem.payer} paid $${newExpenseItem.amount} for ${newExpenseItem.description}.`,
          }),
        });

        let answer = `Logged #${newExpenseId} for ${newExpenseItem.payer} ($${newExpenseItem.amount.toFixed(2)}).`;
        let detailedInfo: string | undefined = undefined;
        if (askRes.ok) {
          const askData = await askRes.json();
          if (askData.reply) answer = cleanAsterisks(askData.reply);
          if (askData.detailedInfo) detailedInfo = cleanAsterisks(askData.detailedInfo);
        } else {
          const localAns = generateLocalFallbackAnswer(userText, [...expenses, newExpenseItem]);
          answer = cleanAsterisks(localAns.shortReply);
          detailedInfo = cleanAsterisks(localAns.detailedInfo);
        }

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: answer,
          detailedInfo,
          showDetails: false,
          receiptData: receiptToProcess || undefined,
          parsedExpense: newExpenseItem,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      // Graceful heuristic fallback
      const fallback = heuristicParse(userText, receiptToProcess);
      if (!fallback.isExpense) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsgId
              ? {
                  ...m,
                  ignored: true,
                  ignoredReason: 'Ignored: Not about purchasing or spending money, or missing specific numbers.',
                }
              : m
          )
        );
        return;
      }

      const newExpenseId = expenses.length > 0 ? Math.max(...expenses.map((e) => e.id)) + 1 : 1;
      let rawFallbackPayer = fallback.payer && !isInvalidPersonName(fallback.payer) ? fallback.payer : authorSender;
      if (rawFallbackPayer.toLowerCase() === 'you') rawFallbackPayer = authorSender;
      const cleanFallbackPayer = rawFallbackPayer.charAt(0).toUpperCase() + rawFallbackPayer.slice(1);

      const cleanFallbackDesc = userText ? extractExpenseSentence(userText) : (fallback.description || 'Expense');

      const newExpenseItem: Expense = {
        id: newExpenseId,
        payer: cleanFallbackPayer,
        amount: fallback.amount || 20.0,
        description: cleanFallbackDesc,
        merchant: fallback.merchant || cleanFallbackDesc,
        subtotal: fallback.subtotal,
        tax: fallback.tax,
        tip: fallback.tip,
        items: fallback.items && fallback.items.length > 0 ? fallback.items : [{ name: cleanFallbackDesc, quantity: 1, unitPrice: fallback.amount || 20.0, totalPrice: fallback.amount || 20.0 }],
        imageUrl: currentImgPreview || receiptToProcess?.imageUrl,
        paymentMethod: fallback.paymentMethod,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setExpenses((prev) => [...prev, newExpenseItem]);

      // Attach 👍 reaction to user message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsgId
            ? {
                ...m,
                parsedExpense: newExpenseItem,
                reaction: {
                  symbol: '👍',
                  label: `Processed #${newExpenseId} ($${newExpenseItem.amount.toFixed(2)}) into ledger.db`,
                  expenseId: newExpenseId,
                  amount: newExpenseItem.amount,
                },
              }
            : m
        )
      );

      // Only reply if asked and (called by name or asking overall bill splitting)!
      if (askedQuestion && (isCalledByName(userText) || isOverallBillSplitting(userText))) {
        const localAns = generateLocalFallbackAnswer(userText, [...expenses, newExpenseItem]);
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: cleanAsterisks(localAns.shortReply),
          detailedInfo: cleanAsterisks(localAns.detailedInfo),
          showDetails: false,
          parsedExpense: newExpenseItem,
          receiptData: receiptToProcess || undefined,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Heuristic parser for test resilience
  const heuristicParse = (text: string, fallbackReceipt?: ReceiptData | null) => {
    if (fallbackReceipt) {
      return {
        isExpense: true,
        ignored: false,
        payer: fallbackReceipt.payer,
        amount: fallbackReceipt.total,
        description: fallbackReceipt.name,
        merchant: fallbackReceipt.merchant,
        subtotal: fallbackReceipt.subtotal,
        tax: fallbackReceipt.tax,
        tip: fallbackReceipt.tip,
        items: fallbackReceipt.items,
        paymentMethod: `Visa ${fallbackReceipt.cardMask}`,
      };
    }

    if (!isPurchaseWithNumbers(text, false)) {
      return {
        isExpense: false,
        ignored: true,
        reason: 'Not related to purchasing or spending money, or missing specific numbers.',
      };
    }

    const moneyMatch = text.match(/\$?(\d+(\.\d{1,2})?)/);
    const amount = moneyMatch ? parseFloat(moneyMatch[1]) : 24.50;

    const payerCandidate = extractPayerFromText(text, currentSender);
    const payer = (payerCandidate && !isInvalidPersonName(payerCandidate)) ? payerCandidate : currentSender;

    // Directly include the full sentence of the text message
    const description = text ? extractExpenseSentence(text) : `${payer}'s Expense`;

    return {
      isExpense: true,
      ignored: false,
      payer,
      amount,
      description,
      merchant: description,
      subtotal: Math.round(amount * 0.85 * 100) / 100,
      tax: Math.round(amount * 0.08 * 100) / 100,
      tip: Math.round(amount * 0.07 * 100) / 100,
      items: [{ name: description, quantity: 1, unitPrice: amount, totalPrice: amount }],
      paymentMethod: 'Visa •••• 9402',
    };
  };

  // Helper: Core settlement calculation using Greedy Bipartite Matching
  const calculateSettlement = (expensesList: Expense[]): SettlementResult => {
    const paidByPerson: Record<string, number> = {};
    expensesList.forEach((e) => {
      paidByPerson[e.payer] = (paidByPerson[e.payer] || 0) + e.amount;
    });

    const participants = Object.keys(paidByPerson);
    const total = Object.values(paidByPerson).reduce((a, b) => a + b, 0);
    const fair_share = participants.length > 0 ? total / participants.length : 0;

    const balances: Record<string, number> = {};
    participants.forEach((p) => {
      balances[p] = Math.round((paidByPerson[p] - fair_share) * 100) / 100;
    });

    const creditors: [string, number][] = [];
    const debtors: [string, number][] = [];

    Object.entries(balances).forEach(([person, bal]) => {
      if (bal > 0.01) creditors.push([person, bal]);
      else if (bal < -0.01) debtors.push([person, Math.abs(bal)]);
    });

    creditors.sort((a, b) => b[1] - a[1]);
    debtors.sort((a, b) => b[1] - a[1]);

    const settlements: SettlementTransfer[] = [];
    let i = 0;
    let j = 0;

    const cardMasks = ['•••• 4821', '•••• 9104', '•••• 3356', '•••• 7729', '•••• 1205'];

    while (i < debtors.length && j < creditors.length) {
      const [debtorName, debtorAmt] = debtors[i];
      const [creditorName, creditorAmt] = creditors[j];

      const transfer = Math.min(debtorAmt, creditorAmt);
      if (transfer > 0.005) {
        const authNum = Math.floor(100000 + Math.random() * 900000);
        settlements.push({
          from_person: debtorName,
          to_person: creditorName,
          amount: Math.round(transfer * 100) / 100,
          authCode: `VD-AUTH-${authNum}`,
          cardFrom: `Visa ${cardMasks[i % cardMasks.length]}`,
          cardTo: `Visa ${cardMasks[(j + 2) % cardMasks.length]}`,
        });
      }

      debtors[i][1] -= transfer;
      creditors[j][1] -= transfer;

      if (debtors[i][1] < 0.01) i++;
      if (creditors[j][1] < 0.01) j++;
    }

    return {
      total: Math.round(total * 100) / 100,
      fair_share: Math.round(fair_share * 100) / 100,
      balances,
      settlements,
    };
  };

  // Run Visa Direct Settlement Algorithm
  const handleRunSettlement = () => {
    if (expenses.length === 0) return;

    setIsSettling(true);
    setShowVisaSuccess(false);

    setTimeout(() => {
      const result = calculateSettlement(expenses);
      setSettlementResult(result);
      setIsSettling(false);
      setShowVisaSuccess(true);
    }, 600);
  };

  // Helper: Trigger file download in browser without window.open
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Helper: Get existing or newly calculated settlement result
  const getOrComputeSettlement = (): SettlementResult | null => {
    if (settlementResult) return settlementResult;
    if (expenses.length === 0) return null;
    const computed = calculateSettlement(expenses);
    setSettlementResult(computed);
    return computed;
  };

  // Export generated settlement transfers as CSV
  const handleExportSettlementCSV = () => {
    const current = getOrComputeSettlement();
    if (!current) {
      setExportFeedback('No expenses to settle');
      setTimeout(() => setExportFeedback(null), 2500);
      setShowExportMenu(false);
      return;
    }

    const escapeCSV = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Transfer_Index',
      'From_Person',
      'To_Person',
      'Amount_USD',
      'Card_From',
      'Card_To',
      'Authorization_Code',
      'Settlement_Type',
      'Status',
      'Timestamp'
    ];

    const now = new Date().toISOString();
    const rows = current.settlements.map((tx, idx) => [
      idx + 1,
      escapeCSV(tx.from_person),
      escapeCSV(tx.to_person),
      tx.amount.toFixed(2),
      escapeCSV(tx.cardFrom),
      escapeCSV(tx.cardTo),
      escapeCSV(tx.authCode),
      escapeCSV('Visa Direct Push-to-Card'),
      escapeCSV('AUTHORIZED'),
      escapeCSV(now),
    ]);

    if (rows.length === 0) {
      rows.push([
        0,
        escapeCSV('None'),
        escapeCSV('None'),
        '0.00',
        escapeCSV('N/A'),
        escapeCSV('N/A'),
        escapeCSV('VD-SETTLED'),
        escapeCSV('Fully Balanced'),
        escapeCSV('COMPLETED'),
        escapeCSV(now),
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadFile(csvContent, `visa_direct_settlement_transfers_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    setExportFeedback('Exported CSV!');
    setTimeout(() => setExportFeedback(null), 2500);
    setShowExportMenu(false);
  };

  // Export generated settlement transfers as JSON
  const handleExportSettlementJSON = () => {
    const current = getOrComputeSettlement();
    if (!current) {
      setExportFeedback('No expenses to settle');
      setTimeout(() => setExportFeedback(null), 2500);
      setShowExportMenu(false);
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      currency: 'USD',
      settlementEngine: 'Visa Direct Push-to-Card',
      algorithm: 'Bipartite Minimum Cash Flow Graph',
      networkStatus: 'VD-STATUS-SUCCESS',
      summary: {
        totalPool: current.total,
        fairSharePerPerson: current.fair_share,
        participantsCount: Object.keys(current.balances).length,
        transfersCount: current.settlements.length,
      },
      participantBalances: current.balances,
      settlementTransfers: current.settlements.map((tx, idx) => ({
        index: idx + 1,
        from: tx.from_person,
        to: tx.to_person,
        amount: tx.amount,
        currency: 'USD',
        cardFrom: tx.cardFrom,
        cardTo: tx.cardTo,
        authCode: tx.authCode,
        fastFundsIndicator: 'Y',
        actionCode: '00',
        approvalCode: tx.authCode,
        settlementServiceIndicator: '0',
        status: 'AUTHORIZED',
      })),
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    downloadFile(jsonString, `visa_direct_settlement_transfers_${Date.now()}.json`, 'application/json');
    setExportFeedback('Exported JSON!');
    setTimeout(() => setExportFeedback(null), 2500);
    setShowExportMenu(false);
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePayer = manualPayer.trim() || currentSender;
    if (!effectivePayer || !manualAmount) return;

    const newExpenseId = expenses.length > 0 ? Math.max(...expenses.map((e) => e.id)) + 1 : 1;
    const formattedPayer = effectivePayer.toLowerCase() === 'you' ? 'You' : (effectivePayer.charAt(0).toUpperCase() + effectivePayer.slice(1));
    const newExpenseItem: Expense = {
      id: newExpenseId,
      payer: formattedPayer,
      amount: parseFloat(manualAmount),
      description: manualDesc.trim() || `Payment by ${formattedPayer}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setExpenses((prev) => [...prev, newExpenseItem]);
    setManualPayer(currentSender);
    setManualAmount('');
    setManualDesc('');
    setShowAddModal(false);
    setSettlementResult(null);
    setShowVisaSuccess(false);
  };

  const handleDeleteExpense = (id: number) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setSettlementResult(null);
    setShowVisaSuccess(false);
  };

  const handleSeedDemo = () => {
    setExpenses([
      {
        id: 1,
        payer: 'Alice',
        amount: 90.0,
        description: 'Hackathon Airbnb & Wi-Fi',
        timestamp: '10:15 AM',
        subtotal: 78.5,
        tax: 11.5,
        tip: 0.0,
        items: [
          { name: 'Airbnb 2-Night Stay (Team Share)', quantity: 1, unitPrice: 70.0, totalPrice: 70.0 },
          { name: 'High-Speed Wi-Fi Booster Pass', quantity: 1, unitPrice: 8.5, totalPrice: 8.5 },
        ],
        paymentMethod: 'Visa •••• 4821',
        authCode: 'VD-AUTH-882190',
      },
      {
        id: 2,
        payer: 'Bob',
        amount: 30.0,
        description: 'Team Pizza & Energy Drinks',
        timestamp: '12:30 PM',
        subtotal: 24.0,
        tax: 2.2,
        tip: 3.8,
        items: [
          { name: 'Medium Cheese Pizza', quantity: 1, unitPrice: 16.0, totalPrice: 16.0 },
          { name: 'Monster Energy Drinks (4pk)', quantity: 1, unitPrice: 8.0, totalPrice: 8.0 },
        ],
        paymentMethod: 'Visa •••• 9104',
        authCode: 'VD-AUTH-419012',
      },
      {
        id: 3,
        payer: 'Charlie',
        amount: 15.0,
        description: 'Boba Tea & Snacks',
        timestamp: '03:45 PM',
        subtotal: 12.0,
        tax: 1.1,
        tip: 1.9,
        items: [
          { name: 'Brown Sugar Boba Milk (Large)', quantity: 2, unitPrice: 6.0, totalPrice: 12.0 },
        ],
        paymentMethod: 'Visa •••• 3356',
        authCode: 'VD-AUTH-650119',
      },
    ]);
    setSettlementResult(null);
    setShowVisaSuccess(false);
  };

  const handleClearAll = () => {
    setExpenses([]);
    setSettlementResult(null);
    setShowVisaSuccess(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pythonSource || FALLBACK_APP_PY);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const downloadAppPy = () => {
    const element = document.createElement('a');
    const file = new Blob([pythonSource || FALLBACK_APP_PY], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'app.py';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Calculations for stats
  const totalPool = expenses.reduce((sum, item) => sum + item.amount, 0);
  const uniquePayers = Array.from(new Set(expenses.map((e) => e.payer))).filter((p) => !isInvalidPersonName(p));
  const fairShare = uniquePayers.length > 0 ? totalPool / uniquePayers.length : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-700 to-indigo-900 text-white font-black text-xl tracking-wider px-3 py-1 rounded shadow-md border border-blue-500/30 flex items-center gap-1.5">
              <span>VISA</span>
              <span className="text-amber-400 text-xs px-1.5 py-0.5 rounded bg-amber-400/10 font-mono font-medium">HACK</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Split & Settle GenAI
                <span className="text-xs font-normal text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sandbox Live
                </span>
              </h1>
              <p className="text-xs text-slate-400">Agentic Commerce • Gemini Multimodal OCR • Visa Direct Rails</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-800/70 p-1 rounded-lg border border-slate-700/60 text-sm">
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'sandbox'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Live Sandbox</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'code'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>app.py (Streamlit)</span>
            </button>
            <button
              onClick={() => setActiveTab('curriculum')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'curriculum'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Architect Guide</span>
            </button>
            <button
              onClick={() => setActiveTab('visadirect')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'visadirect'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Visa Direct Rails</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {/* TAB 1: LIVE SANDBOX (Streamlit Mirror) */}
        {activeTab === 'sandbox' && (
          <div className="flex-1 flex flex-col gap-6">
            {/* Context Header */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">
                    Group Expenses & Visa Direct Settlement
                  </h2>
                  <p className="text-xs text-slate-400">
                    Collaborative team expense transcript with minimal cash-flow push-to-card settlements.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  onClick={handleSeedDemo}
                  className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-750 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Load initial expenses into ledger"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Seed Demo
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 bg-slate-800/80 hover:bg-red-950/60 text-slate-400 hover:text-red-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Clear SQLite ledger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className="px-3 py-1.5 bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  app.py
                </button>
              </div>
            </div>

            {/* REQUIREMENT 1: TWO-COLUMN STREAMLIT LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-start">
              {/* LEFT COLUMN: Private Chat */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col h-[740px] shadow-xl overflow-hidden">
                {/* Column Header */}
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <div>
                      <h3 className="font-semibold text-slate-200 text-sm">Team Chat & Expenses</h3>
                      <p className="text-[11px] text-slate-400">You, Alice, Bob, Charlie</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded font-mono">
                      @SplitBot ready
                    </span>
                  </div>
                </div>

                {/* Sample Receipts Bar */}
                <div className="px-4 py-2 bg-slate-950/50 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
                  <span className="text-slate-400 text-[11px] whitespace-nowrap">Receipts:</span>
                  {QUICK_RECEIPTS.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => handleSelectQuickReceipt(qr, true)}
                      className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white rounded-md border border-slate-750 whitespace-nowrap transition text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span className="font-medium text-slate-200">{qr.merchant}</span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        ${qr.total.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Message Scroll Container */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
                  {messages.map((msg) => {
                    // System notice (e.g. divider, trip status)
                    if (msg.isSystemNote) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <span className="text-[11px] text-slate-400 bg-slate-900/80 border border-slate-800 px-3.5 py-1 rounded-full flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>{msg.content}</span>
                          </span>
                        </div>
                      );
                    }

                    // Bot message (when specifically called)
                    if (msg.role === 'assistant') {
                      return (
                        <div key={msg.id} className="flex gap-2.5 justify-start items-start">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0 text-xs shadow-sm" title="SplitBot">
                            🤖
                          </div>
                          <div className="max-w-[85%] rounded-2xl rounded-tl-xs p-3.5 text-sm bg-slate-900 text-slate-200 border border-slate-800 shadow-sm">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 font-mono">
                              <span className="font-medium text-slate-300">SplitBot</span>
                              <span>•</span>
                              <span>{msg.timestamp}</span>
                            </div>
                            <FormattedMessageText content={msg.content} />

                            {msg.detailedInfo && (
                              <div className="mt-2.5 pt-2 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => toggleMessageDetails(msg.id)}
                                  className="text-[11px] text-slate-400 hover:text-slate-200 transition flex items-center gap-1 cursor-pointer font-medium"
                                >
                                  <span>{msg.showDetails ? "Hide breakdown" : "View breakdown"}</span>
                                  <ChevronDown className={`w-3 h-3 transition-transform ${msg.showDetails ? "rotate-180" : ""}`} />
                                </button>
                                {msg.showDetails && (
                                  <div className="mt-2 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                                    <FormattedMessageText content={msg.detailedInfo} />
                                  </div>
                                )}
                              </div>
                            )}

                            {msg.parsedExpense && msg.parsedExpense.items && msg.parsedExpense.items.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-800 text-xs">
                                <button
                                  type="button"
                                  onClick={() => openReceiptFromExpense(msg.parsedExpense!)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                                >
                                  Inspect itemized numbers ({msg.parsedExpense.items.length} items)
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Human user message (You or team member)
                    const isMe = !msg.sender || msg.sender.toLowerCase() === 'you';
                    const senderInitial = (msg.sender || 'Y').charAt(0).toUpperCase();
                    const avatarBg =
                      msg.sender === 'Alice'
                        ? 'bg-purple-900/60 text-purple-200 border-purple-700/60'
                        : msg.sender === 'Bob'
                        ? 'bg-blue-900/60 text-blue-200 border-blue-700/60'
                        : msg.sender === 'Charlie'
                        ? 'bg-amber-900/60 text-amber-200 border-amber-700/60'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800/80';

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2.5 items-start ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMe && (
                          <div
                            className={`w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${avatarBg}`}
                            title={msg.sender}
                          >
                            {senderInitial}
                          </div>
                        )}
                        <div
                          className={`max-w-[82%] rounded-2xl p-3.5 text-sm shadow-sm ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-tr-xs'
                              : 'bg-slate-850 text-slate-100 border border-slate-750 rounded-tl-xs'
                          }`}
                        >
                          <div className={`text-[10px] mb-1 font-mono flex items-center gap-1.5 ${isMe ? 'text-blue-200 justify-end' : 'text-slate-400'}`}>
                            <span className="font-semibold">{isMe ? 'You' : msg.sender}</span>
                            <span>•</span>
                            <span>{msg.timestamp}</span>
                          </div>

                          {msg.imageUrl && (
                            <div className="mb-2 overflow-hidden rounded-lg border border-slate-700 bg-white/5 relative group">
                              <img
                                src={msg.imageUrl}
                                alt="Receipt"
                                className="max-h-48 w-auto object-contain mx-auto"
                              />
                              <div className="absolute top-2 right-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (msg.receiptData) setSelectedReceiptModal(msg.receiptData);
                                    else if (msg.parsedExpense) openReceiptFromExpense(msg.parsedExpense);
                                  }}
                                  className="px-2 py-0.5 bg-slate-900/90 text-slate-200 text-[10px] rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Eye className="w-3 h-3 text-blue-400" />
                                  <span>Inspect</span>
                                </button>
                              </div>
                            </div>
                          )}

                          <FormattedMessageText content={msg.content} />

                          {/* Subtle ledger recorded tag */}
                          {msg.reaction && (
                            <div className={`mt-2 pt-1.5 border-t flex items-center justify-between gap-2 text-xs ${isMe ? 'border-blue-500/40' : 'border-slate-700/60'}`}>
                              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-300">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Logged ${(msg.reaction.amount ?? msg.parsedExpense?.amount)?.toFixed(2)} to ledger</span>
                              </div>
                              {msg.parsedExpense && (
                                <button
                                  type="button"
                                  onClick={() => openReceiptFromExpense(msg.parsedExpense!)}
                                  className={`text-[10.5px] underline hover:no-underline cursor-pointer ${isMe ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                  Details
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {isMe && (
                          <div
                            className={`w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 ${avatarBg}`}
                            title="You"
                          >
                            Y
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isProcessing && (
                    <div className="flex gap-2.5 justify-start items-center">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 animate-pulse">
                        🤖
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl rounded-tl-xs px-3.5 py-2 text-xs text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                        <span>SplitBot checking ledger...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Minimal Quick Actions */}
                <div className="px-4 py-2 bg-slate-950/70 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px] scrollbar-none">
                  <button
                    type="button"
                    onClick={openRecordPaymentModal}
                    className="px-2.5 py-1 rounded-md bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 transition whitespace-nowrap cursor-pointer font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    <span>+ Record Payment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAskQuestion("Let's split the bill: what is the fair share and who owes what?")}
                    className="px-2.5 py-1 rounded-md bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-750 transition whitespace-nowrap cursor-pointer"
                  >
                    Split the bill
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAskQuestion("Who owes what right now, and what is the fair share split?")}
                    className="px-2.5 py-1 rounded-md bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-750 transition whitespace-nowrap cursor-pointer"
                  >
                    Who owes what?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAskQuestion("What did other people pay across all recorded expenses?")}
                    className="px-2.5 py-1 rounded-md bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-750 transition whitespace-nowrap cursor-pointer"
                  >
                    What others paid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputPrompt((prev) => (prev ? `@SplitBot ${prev}` : '@SplitBot '));
                    }}
                    className="px-2 py-1 rounded-md bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-750 transition whitespace-nowrap cursor-pointer font-mono text-[10.5px]"
                  >
                    @SplitBot
                  </button>
                </div>

                {/* File Upload & Staged Receipt Preview Bar */}
                {uploadedImagePreview && (
                  <div className="px-4 py-2.5 bg-slate-850 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="relative group cursor-pointer shrink-0"
                        onClick={() => stagedReceipt && setSelectedReceiptModal(stagedReceipt)}
                        title="Click to view full receipt numbers and image"
                      >
                        <img
                          src={uploadedImagePreview}
                          alt="Receipt Preview"
                          className="w-12 h-12 object-cover rounded-lg border border-slate-700 bg-white shadow-sm"
                        />
                        <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-200 text-xs truncate">
                            {stagedReceipt ? stagedReceipt.merchant : 'Receipt Image Attached'}
                          </p>
                          <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.2 rounded font-mono font-bold">
                            {stagedReceipt ? `$${stagedReceipt.total.toFixed(2)}` : 'Attached'}
                          </span>
                        </div>
                        {stagedReceipt ? (
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                            <span className="text-slate-300 font-medium">🛒 {stagedReceipt.items.length} items</span>
                            <span>•</span>
                            <span>Tax: <strong className="text-amber-400">${stagedReceipt.tax.toFixed(2)}</strong></span>
                            <span>•</span>
                            <span>Tip: <strong className="text-blue-400">${stagedReceipt.tip.toFixed(2)}</strong></span>
                          </div>
                        ) : (
                          <p className="text-slate-400 text-[11px]">Ready for automated receipt extraction</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {stagedReceipt && (
                        <button
                          type="button"
                          onClick={() => setSelectedReceiptModal(stagedReceipt)}
                          className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs rounded-lg border border-blue-500/30 flex items-center gap-1.5 transition font-medium cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedImagePreview(null);
                          setUploadedImageBase64(null);
                          setStagedReceipt(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-950/30 rounded-lg border border-red-900/40 transition cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {/* Input Area */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {/* Participant selector */}
                    <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-2 shrink-0">
                      <span className="text-[11px] text-slate-400">From:</span>
                      <select
                        value={currentSender}
                        onChange={(e) => setCurrentSender(e.target.value as any)}
                        className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="You" className="bg-slate-900 text-white">You</option>
                        <option value="Alice" className="bg-slate-900 text-white">Alice</option>
                        <option value="Bob" className="bg-slate-900 text-white">Bob</option>
                        <option value="Charlie" className="bg-slate-900 text-white">Charlie</option>
                      </select>
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="receipt-file-input"
                    />
                    <label
                      htmlFor="receipt-file-input"
                      className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 cursor-pointer transition flex items-center gap-1 text-xs shrink-0"
                      title="Attach receipt photo"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      <span className="hidden sm:inline text-[11px]">Receipt</span>
                    </label>

                    {/* Text Input */}
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={inputPrompt}
                        onChange={(e) => setInputPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitExpense();
                          }
                        }}
                        placeholder="Message team or log expense (e.g., 'Paid $20 for coffee' or '@SplitBot split bill')..."
                        className="w-full bg-slate-950 text-slate-100 placeholder-slate-500 text-xs sm:text-sm px-3.5 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Send Button */}
                    <button
                      onClick={() => handleSubmitExpense()}
                      disabled={isProcessing || (!inputPrompt.trim() && !uploadedImageBase64 && !stagedReceipt)}
                      className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition shrink-0 cursor-pointer"
                      title="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span>
                      Chat with team. Tag @SplitBot or ask to split the bill anytime.
                    </span>
                    <span className="font-mono text-[10px]">SQLite: ledger.db</span>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Group Ledger & Visa Settlement */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col h-[740px] shadow-xl overflow-hidden">
                {/* Column Header */}
                <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200 text-sm">Group Ledger (`ledger.db`)</h3>
                      <p className="text-xs text-slate-400">Current SQLite database table state: `Expenses`</p>
                    </div>
                  </div>
                  <button
                    onClick={openRecordPaymentModal}
                    className="px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 hover:text-emerald-100 text-xs rounded-lg border border-emerald-800/80 flex items-center gap-1.5 transition font-semibold shadow-sm cursor-pointer"
                    title={`Record an expense paid by ${currentSender} or a teammate`}
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Add Expense ({currentSender} / Others)</span>
                  </button>
                </div>

                {/* Metrics Bar */}
                <div className="grid grid-cols-3 gap-3 p-4 border-b border-slate-800 bg-slate-950/40">
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
                    <span className="text-slate-400 text-xs flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      Total Pool
                    </span>
                    <p className="text-lg font-bold text-white mt-1">${totalPool.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
                    <span className="text-slate-400 text-xs flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      Participants
                    </span>
                    <p className="text-lg font-bold text-white mt-1">{uniquePayers.length}</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
                    <span className="text-slate-400 text-xs flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      Split / Person
                    </span>
                    <p className="text-lg font-bold text-emerald-400 mt-1">${fairShare.toFixed(2)}</p>
                  </div>
                </div>

                {/* SQLite Table Display */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {expenses.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                      <Receipt className="w-10 h-10 mb-2 opacity-40 text-blue-400" />
                      <p className="text-sm font-medium text-slate-400">Database table `Expenses` is empty</p>
                      <p className="text-xs mt-1">Upload a receipt or seed demo expenses on the left!</p>
                      <button
                        onClick={handleSeedDemo}
                        className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition"
                      >
                        Seed Demo Expenses
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-800/70 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                            <th className="py-2.5 px-3">ID</th>
                            <th className="py-2.5 px-3">Paid By</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-2">Numbers / Receipt</th>
                            <th className="py-2.5 px-3 text-right">Amount</th>
                            <th className="py-2.5 px-2 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {expenses.map((item) => {
                            const isPaidByMe = item.payer.toLowerCase() === 'you';
                            return (
                              <tr key={item.id} className="hover:bg-slate-800/40 transition">
                                <td className="py-2.5 px-3 font-mono text-slate-500">#{item.id}</td>
                                <td className="py-2.5 px-3 font-medium text-slate-200">
                                  {isPaidByMe ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/80 font-bold text-[11px] shadow-sm" title="This expense was paid by you!">
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>You (Paid by Me)</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold text-[11px]">
                                      <Users className="w-3 h-3 text-blue-400" />
                                      <span>{item.payer}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-300 truncate max-w-[180px] lg:max-w-[240px]" title={item.description}>
                                  {item.description}
                                </td>
                                <td className="py-2.5 px-2">
                                  <button
                                    type="button"
                                    onClick={() => openReceiptFromExpense(item)}
                                    className="group/btn px-2 py-1 bg-slate-850 hover:bg-blue-600/20 hover:border-blue-500/50 text-slate-300 hover:text-blue-300 rounded border border-slate-700/80 transition flex items-center gap-1.5 text-[11px] cursor-pointer"
                                    title="Inspect receipt image, tip, tax, and bought items"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-blue-400 group-hover/btn:scale-110 transition" />
                                    <span className="font-mono text-[10px]">
                                      {item.items && item.items.length > 0
                                        ? `${item.items.length} items`
                                        : 'Details'}
                                      {item.tax !== undefined && ` • Tax`}
                                      {item.tip !== undefined && item.tip > 0 && ` • Tip`}
                                    </span>
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100">
                                  ${item.amount.toFixed(2)}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <button
                                    onClick={() => handleDeleteExpense(item.id)}
                                    className="text-slate-500 hover:text-red-400 p-1 transition cursor-pointer"
                                    title="Delete record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* SETTLEMENT ENGINE AREA */}
                  <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/90 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-amber-400" />
                          Visa Direct Settlement Engine
                        </h4>
                        <p className="text-xs text-slate-400">
                          Bipartite greedy algorithm pairs net debtors with net creditors.
                        </p>
                      </div>

                      {/* Export Settlement Transfers Button & Dropdown */}
                      <div className="relative shrink-0" ref={exportMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowExportMenu((prev) => !prev)}
                          disabled={expenses.length === 0}
                          className="px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                          title="Export generated settlement transfers as CSV or JSON"
                        >
                          {exportFeedback ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300 font-bold">{exportFeedback}</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5 text-blue-400" />
                              <span>Export Transfers</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                            </>
                          )}
                        </button>

                        {/* Dropdown Menu */}
                        {showExportMenu && (
                          <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-750 shadow-2xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800 mb-1">
                              Export Settlement Transfers
                            </div>

                            <button
                              type="button"
                              onClick={handleExportSettlementCSV}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/90 text-xs text-slate-200 hover:text-white transition flex items-center gap-2.5 cursor-pointer group"
                            >
                              <div className="p-1.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 group-hover:bg-emerald-900 shrink-0">
                                <FileSpreadsheet className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-200 group-hover:text-white flex items-center gap-1.5">
                                  <span>Export as CSV</span>
                                  <span className="text-[9.5px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono">.csv</span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">Spreadsheet for Excel & Sheets</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={handleExportSettlementJSON}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/90 text-xs text-slate-200 hover:text-white transition flex items-center gap-2.5 cursor-pointer group mt-0.5"
                            >
                              <div className="p-1.5 rounded-md bg-blue-950/80 text-blue-400 border border-blue-800/60 group-hover:bg-blue-900 shrink-0">
                                <FileCode className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-200 group-hover:text-white flex items-center gap-1.5">
                                  <span>Export as JSON</span>
                                  <span className="text-[9.5px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono">.json</span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">JSON for Visa Direct APIs & scripts</div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RUN SETTLEMENT BUTTON */}
                    <button
                      onClick={handleRunSettlement}
                      disabled={isSettling || expenses.length === 0}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 hover:from-blue-600 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSettling ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                          <span>Computing Minimal Settlement Graph...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 text-white" />
                          <span>Authorize Visa Direct Settlement</span>
                        </>
                      )}
                    </button>

                    {/* SETTLEMENT RESULTS */}
                    {settlementResult && (
                      <div className="mt-4 space-y-3.5 pt-3.5 border-t border-slate-800">
                        {/* REQUIREMENT 5: Mock Success Message */}
                        {showVisaSuccess && (
                          <div className="p-3 bg-emerald-950/70 border border-emerald-600/70 rounded-lg flex items-center gap-2.5 text-emerald-300 text-sm font-semibold shadow-md shadow-emerald-950/50">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                            <span>✅ Visa Direct Push-to-Card Authorized</span>
                          </div>
                        )}

                        {/* Net Balances Overview */}
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
                            Participant Net Balances ({uniquePayers.length} Members • Fair Share: ${fairShare.toFixed(2)})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(settlementResult.balances).map(([person, bal]) => {
                              const isMe = person.toLowerCase() === 'you';
                              return (
                                <div
                                  key={person}
                                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                                    isMe
                                      ? bal > 0.01
                                        ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/50 shadow-sm'
                                        : bal < -0.01
                                        ? 'bg-rose-950/70 border-rose-500 text-rose-200 ring-1 ring-rose-500/50 shadow-sm'
                                        : 'bg-slate-800/80 border-slate-600 text-slate-200'
                                      : bal > 0.01
                                      ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                                      : bal < -0.01
                                      ? 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {isMe && <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                    <span className="font-semibold">
                                      {isMe ? 'You (Me)' : person}
                                    </span>
                                    {isMe && (
                                      <span className="text-[9px] bg-slate-900/90 text-slate-300 px-1 py-0.2 rounded font-mono">
                                        Your account
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono font-bold">
                                    {bal > 0 ? `+$${bal.toFixed(2)}` : bal < 0 ? `-$${Math.abs(bal).toFixed(2)}` : '$0.00'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Calculated Push-to-Card Transfers */}
                        <div>
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                              Minimal Settlement Transfers ({settlementResult.settlements.length})
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-400 font-mono text-[11px] hidden sm:inline">Real-Time &lt; 30s</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleExportSettlementCSV}
                                  className="px-2 py-0.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 border border-slate-750 hover:border-emerald-600/60 rounded text-[10.5px] font-mono transition flex items-center gap-1 cursor-pointer"
                                  title="Export settlement transfers as CSV spreadsheet"
                                >
                                  <Download className="w-3 h-3 text-emerald-400" />
                                  <span>CSV</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExportSettlementJSON}
                                  className="px-2 py-0.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-blue-300 border border-slate-750 hover:border-blue-500/60 rounded text-[10.5px] font-mono transition flex items-center gap-1 cursor-pointer"
                                  title="Export settlement transfers as JSON payload"
                                >
                                  <Download className="w-3 h-3 text-blue-400" />
                                  <span>JSON</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {settlementResult.settlements.length === 0 ? (
                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 text-center">
                              Everyone is already settled! No transactions required.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {settlementResult.settlements.map((tx, idx) => {
                                const fromMe = tx.from_person.toLowerCase() === 'you';
                                const toMe = tx.to_person.toLowerCase() === 'you';
                                return (
                                  <div
                                    key={idx}
                                    className={`p-3 rounded-lg border text-xs space-y-1.5 transition ${
                                      fromMe
                                        ? 'bg-rose-950/20 border-l-4 border-l-rose-500 border-rose-900/50'
                                        : toMe
                                        ? 'bg-emerald-950/20 border-l-4 border-l-emerald-500 border-emerald-900/50'
                                        : 'bg-slate-900 border-l-4 border-l-blue-600 border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${fromMe ? 'bg-rose-900/70 text-rose-200 border border-rose-700/80' : 'bg-slate-800 text-white'}`}>
                                          {fromMe ? 'You (Me)' : tx.from_person}
                                        </span>
                                        <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${toMe ? 'bg-emerald-900/70 text-emerald-200 border border-emerald-700/80' : 'bg-slate-800 text-white'}`}>
                                          {toMe ? 'You (Me)' : tx.to_person}
                                        </span>
                                        {fromMe && (
                                          <span className="text-[10px] text-rose-300 bg-rose-950/80 border border-rose-800 px-1.5 py-0.2 rounded font-bold">
                                            You Pay
                                          </span>
                                        )}
                                        {toMe && (
                                          <span className="text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                            You Receive
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-sm font-mono font-bold text-blue-400">
                                        ${tx.amount.toFixed(2)} USD
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                                      <span className="flex items-center gap-1">
                                        <CreditCard className="w-3 h-3 text-slate-500" />
                                        {tx.cardFrom} ➔ {tx.cardTo}
                                      </span>
                                      <span className="font-mono text-slate-400">
                                        Auth: <code className="text-emerald-400">{tx.authCode}</code>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: app.py CODE VIEWER & QUICK START */}
        {activeTab === 'code' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-blue-400" />
                  Single-File Streamlit Application (`app.py`)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Complete, self-contained Python script with multimodal Gemini integration, SQLite schema, and minimum cash flow settlement.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-2"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy app.py Code'}</span>
                </button>
                <button
                  onClick={downloadAppPy}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download app.py</span>
                </button>
              </div>
            </div>

            {/* Quick Terminal Guide for Students */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400 mb-2 font-sans font-semibold">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>How to run this in your local terminal:</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1">
                <p><span className="text-slate-500"># 1. Install dependencies</span></p>
                <p className="text-emerald-400">pip install streamlit google-generativeai pillow typing-extensions</p>
                <p><span className="text-slate-500"># 2. Set your Gemini API key (from Google AI Studio)</span></p>
                <p className="text-emerald-400">export GEMINI_API_KEY="AIzaSy..."</p>
                <p><span className="text-slate-500"># 3. Launch Streamlit</span></p>
                <p className="text-blue-400 font-bold">streamlit run app.py</p>
              </div>
            </div>

            {/* Code Block */}
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  app.py (Single File Testing Sandbox)
                </span>
                <span>Python 3.10+ • Streamlit Wide Layout</span>
              </div>
              <div className="flex-1 p-4 overflow-x-auto overflow-y-auto max-h-[620px] font-mono text-xs text-slate-300 leading-relaxed bg-slate-950">
                <pre>
                  <code>{pythonSource || FALLBACK_APP_PY}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ARCHITECTURAL GUIDE & CURRICULUM */}
        {activeTab === 'curriculum' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                Principal Software Engineer's Guide for Beginner CS Students
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Key architectural patterns, trade-offs, and algorithms powering Split & Settle GenAI.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Module 1 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <h3 className="text-base font-bold text-white">
                  Gemini Structured Outputs & `response_schema`
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Traditional LLM prompts often return conversational filler like <i>"Sure! Here is the JSON..."</i> or markdown backticks (```json). In a production fintech pipeline, this crashes your backend JSON parser.
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-300">
                  <p className="text-slate-500"># Typed schema enforcement:</p>
                  <p>class ExpenseSchema(TypedDict):</p>
                  <p>&nbsp;&nbsp;payer: str</p>
                  <p>&nbsp;&nbsp;amount: float</p>
                  <p>&nbsp;&nbsp;description: str</p>
                </div>
                <p className="text-xs text-slate-400">
                  By passing this schema directly to the model compiler, the API guarantees deterministic, valid JSON parsing on the very first token.
                </p>
              </div>

              {/* Module 2 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <h3 className="text-base font-bold text-white">
                  Streamlit Execution Model & SQLite State
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Streamlit reruns the entire Python script from line 1 on every single user interaction (button click, text change). If you only store expenses in standard Python variables, they disappear!
                </p>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
                  <li><b className="text-slate-200">Session State (`st.session_state`):</b> Keeps ephemeral UI state like chat messages.</li>
                  <li><b className="text-slate-200">SQLite (`ledger.db`):</b> Provides ACID-compliant persistence so your team can restart the app or query via SQL without losing hackathon data.</li>
                  <li><b className="text-slate-200">Thread Safety:</b> We use <code>check_same_thread=False</code> for Streamlit's concurrency model.</li>
                </ul>
              </div>

              {/* Module 3 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <h3 className="text-base font-bold text-white">
                  The Minimum Cash Flow Algorithm
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  If 5 people split a vacation, naive settlement requires up to 20 individual peer payments. We collapse this using a greedy bipartite matching algorithm:
                </p>
                <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
                  <li>Sum total expenses and divide by participants: <code className="text-amber-400">fair_share = total / N</code></li>
                  <li>Calculate net balances: <code className="text-blue-400">balance = paid - fair_share</code></li>
                  <li>Pair the largest debtor with the largest creditor.</li>
                  <li>Transfer <code className="text-emerald-400">min(|debt|, credit)</code> and adjust balances.</li>
                </ol>
                <p className="text-xs text-slate-400">
                  This guarantees at most <b>N - 1 transactions</b>, saving network transaction fees on Visa Direct!
                </p>
              </div>

              {/* Module 4 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <h3 className="text-base font-bold text-white">
                  What is Visa Direct & Push-to-Card?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Traditional bank transfers (ACH, SEPA) take 2-3 business days because they rely on batch clearinghouse cycles. Visa Direct bypasses this using <b>Original Credit Transactions (OCT)</b>.
                </p>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Pull Funds (Debit Card):</span>
                    <span className="font-mono text-blue-400">Sender Account Debited</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Visa Direct Rails:</span>
                    <span className="font-mono text-amber-400">FastFunds Real-Time Network</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Push Funds (Credit/Debit):</span>
                    <span className="font-mono text-emerald-400">Recipient Card Credited &lt; 30s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VISA DIRECT ARCHITECTURE & API RAILS */}
        {activeTab === 'visadirect' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  Visa Direct Developer Integration Blueprint
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  How this agentic app translates Gemini extractions into real-time payment network calls.
                </p>
              </div>
              <div className="px-3 py-1 bg-blue-950 text-blue-400 border border-blue-800 rounded-lg text-xs font-mono">
                API Standard: REST / JSON
              </div>
            </div>

            {/* Visual Payment Flow Diagram */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                End-to-End Agentic Commerce Transaction Lifecycle
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 relative">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs mb-2">
                    1
                  </div>
                  <h4 className="font-semibold text-white text-xs">Receipt / Chat Ingestion</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Student uploads receipt photo or types expense prompt in Streamlit.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 relative">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs mb-2">
                    2
                  </div>
                  <h4 className="font-semibold text-white text-xs">Gemini Structured Parse</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Vision model evaluates image and outputs strict <code>ExpenseSchema</code> JSON.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 relative">
                  <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs mb-2">
                    3
                  </div>
                  <h4 className="font-semibold text-white text-xs">SQLite Ledger & Math</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Rows appended to <code>Expenses</code>; minimal settlement algorithm pairs balances.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 relative">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs mb-2">
                    4
                  </div>
                  <h4 className="font-semibold text-white text-xs">Visa Direct Push-to-Card</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    API pushes funds directly to peer Visa cards with sub-minute settlement.
                  </p>
                </div>
              </div>
            </div>

            {/* Visa Direct API Request/Response Sample */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col font-mono text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
                  <span>POST /visadirect/fundstransfer/v1/pushfundstransfer</span>
                  <span className="text-emerald-400">REQUEST</span>
                </div>
                <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-900 rounded">
{`{
  "systemsTraceAuditNumber": "982014",
  "retrievalReferenceNumber": "261010049281",
  "localTransactionDateTime": "2026-10-10T16:00:00",
  "acquiringBin": "408999",
  "amount": 25.50,
  "currencyCode": "840",
  "recipientPrimaryAccountNumber": "4000123456789104",
  "senderName": "Alice Henderson",
  "businessApplicationId": "PP",
  "merchantCategoryCode": "6012"
}`}
                </pre>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col font-mono text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
                  <span>HTTP 200 OK (0.38s)</span>
                  <span className="text-blue-400">RESPONSE</span>
                </div>
                <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-900 rounded">
{`{
  "statusIdentifier": "VD-STATUS-SUCCESS",
  "actionCode": "00",
  "approvalCode": "VD-AUTH-99142",
  "transactionIdentifier": "284719302847",
  "responseCode": "00",
  "fastFundsIndicator": "Y",
  "settlementServiceIndicator": "0",
  "transmissionDateTime": "2026-10-10T16:00:01Z"
}`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Manual Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/90 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  Record Expense in Ledger
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Directly appends to SQLite <code>Expenses</code> table and updates fair share balances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-4">
              {/* Question: Who made this payment? */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                    Who Made This Payment?
                  </label>
                  <span className="text-[11px] text-emerald-400 font-medium">
                    Default: {currentSender} (messaging)
                  </span>
                </div>

                {/* Candidate payer chips */}
                <div className="flex flex-wrap gap-2">
                  {/* Current messaging sender option */}
                  <button
                    type="button"
                    onClick={() => setManualPayer(currentSender)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      manualPayer === currentSender
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-950/50 font-bold'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{currentSender}</span>
                    <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-normal">
                      Messaging
                    </span>
                  </button>

                  {/* Other members */}
                  {Array.from(new Set(['You', 'Alice', 'Bob', 'Charlie', ...uniquePayers]))
                    .filter((p) => p !== currentSender && !isInvalidPersonName(p))
                    .map((person) => (
                      <button
                        key={person}
                        type="button"
                        onClick={() => setManualPayer(person)}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                          manualPayer === person
                            ? 'bg-blue-950/80 border-blue-500 text-blue-200 ring-1 ring-blue-500/50 shadow-md shadow-blue-950/50 font-bold'
                            : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{person}</span>
                      </button>
                    ))}
                </div>

                {/* Selected Payer Display & Custom input */}
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Payer credited in ledger:</span>
                    <span className="font-semibold text-emerald-300 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      {manualPayer.trim() || currentSender}
                      {manualPayer === currentSender && ' (Currently messaging)'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={manualPayer}
                    onChange={(e) => setManualPayer(e.target.value)}
                    placeholder={`e.g. ${currentSender}, Maya, or Marcus`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1">
                  Amount ($ USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="45.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1">
                  Description / Note
                </label>
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="e.g. Team dinner at Olive Garden, grocery run, Uber"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Record Payment by {manualPayer.trim() || currentSender} ({manualAmount ? `$${parseFloat(manualAmount || '0').toFixed(2)}` : '$0.00'})
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIPT NUMBERS & BREAKDOWN INSPECTOR MODAL */}
      {selectedReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/90 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base sm:text-lg">
                      {selectedReceiptModal.merchant}
                    </h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold">
                      ${selectedReceiptModal.total.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>{selectedReceiptModal.category}</span>
                    <span>•</span>
                    <span>{selectedReceiptModal.date}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">Payer: {selectedReceiptModal.payer}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedReceiptModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Left: Receipt Photo/SVG, Right: Financial Numbers & Items Bought */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-900/60">
              {/* Left Column: Visual Receipt Graphic */}
              <div className="md:col-span-5 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Receipt Image Attached
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setZoomReceiptImage(!zoomReceiptImage)}
                      className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700 transition"
                      title="Toggle image scale"
                    >
                      {zoomReceiptImage ? <ZoomOut className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
                      <span>{zoomReceiptImage ? 'Standard' : 'Zoom'}</span>
                    </button>
                  </div>
                </div>

                <div
                  className={`w-full bg-slate-950 rounded-xl p-3 border border-slate-800 flex items-center justify-center overflow-auto shadow-inner ${
                    zoomReceiptImage ? 'max-h-[500px]' : 'max-h-[420px]'
                  }`}
                >
                  {selectedReceiptModal.imageUrl ? (
                    <img
                      src={selectedReceiptModal.imageUrl}
                      alt={`${selectedReceiptModal.merchant} receipt`}
                      className={`transition-all duration-200 rounded drop-shadow-md ${
                        zoomReceiptImage ? 'scale-125 my-8 max-w-none w-auto' : 'max-h-[380px] w-auto object-contain'
                      }`}
                    />
                  ) : (
                    <div className="py-16 text-center text-slate-500">
                      <Receipt className="w-12 h-12 mx-auto mb-2 opacity-40 text-blue-400" />
                      <p className="text-xs">Receipt Image Preview</p>
                    </div>
                  )}
                </div>

                <div className="mt-2.5 w-full bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Status:</span>
                    <strong className="text-slate-200">Image Staged & Uploaded</strong>
                  </span>
                  <span className="font-mono text-slate-500">Vector SVG OCR</span>
                </div>
              </div>

              {/* Right Column: Numbers, Tip, Tax, Items Bought */}
              <div className="md:col-span-7 flex flex-col gap-4">
                {/* THE FINANCIAL NUMBERS CARD */}
                <div className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 shadow-md">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      Receipt Numbers Breakdown
                    </h4>
                    <span className="text-[10px] font-mono text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-900/60 font-semibold">
                      USD ($)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* Subtotal */}
                    <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Subtotal</span>
                      <p className="text-sm sm:text-base font-bold text-slate-200 mt-0.5 font-mono">
                        ${selectedReceiptModal.subtotal.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">Pre-tax items</span>
                    </div>

                    {/* Tax */}
                    <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase font-medium">Tax</span>
                        <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded font-mono">
                          {selectedReceiptModal.taxRate}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-amber-400 mt-0.5 font-mono">
                        ${selectedReceiptModal.tax.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">Sales tax / tolls</span>
                    </div>

                    {/* Tip */}
                    <div className="bg-slate-900/90 rounded-lg p-2.5 border border-blue-900/40 bg-blue-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-blue-300 uppercase font-medium">Tip</span>
                        <span className="text-[9px] bg-blue-900/50 text-blue-200 px-1 rounded font-mono">
                          {selectedReceiptModal.tipRate}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-blue-400 mt-0.5 font-mono">
                        ${selectedReceiptModal.tip.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500">Gratuity / tip</span>
                    </div>

                    {/* Total */}
                    <div className="bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-800/60">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold">Total Due</span>
                      <p className="text-sm sm:text-base font-black text-emerald-300 mt-0.5 font-mono">
                        ${selectedReceiptModal.total.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-emerald-500 font-medium">Settlement sum</span>
                    </div>
                  </div>

                  {/* Fair share preview for team */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Equal 4-person team split:</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">
                      ${(selectedReceiptModal.total / 4).toFixed(2)} / person
                    </span>
                  </div>
                </div>

                {/* WHAT ITEMS WERE BOUGHT */}
                <div className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 shadow-md flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
                      Items Bought ({selectedReceiptModal.items.length})
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Itemized Line Breakdown
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-800/80 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-800/60 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-mono">
                          <th className="py-2 px-3">Item Name</th>
                          <th className="py-2 px-2 text-center w-12">Qty</th>
                          <th className="py-2 px-3 text-right">Unit Price</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedReceiptModal.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                            <td className="py-2 px-3 text-slate-200 font-medium">
                              {item.name}
                            </td>
                            <td className="py-2 px-2 text-center font-mono">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                                {item.quantity}x
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400 font-mono">
                              ${item.unitPrice.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-100 font-mono font-semibold">
                              ${item.totalPrice.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Merchant & Payment metadata */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5 truncate">
                      <CreditCard className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>Card: <strong>Visa {selectedReceiptModal.cardMask}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Auth: <code className="text-slate-300 font-mono text-[10px]">{selectedReceiptModal.authCode}</code></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    const exportJson = JSON.stringify(selectedReceiptModal, null, 2);
                    navigator.clipboard.writeText(exportJson);
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied JSON!' : 'Copy Numbers JSON'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    // Keep staged in chat input so user can inspect or type
                    setSelectedReceiptModal(null);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
                >
                  Keep Staged in Chat
                </button>
                
                <button
                  type="button"
                  onClick={() => handleCommitReceiptFromModal(selectedReceiptModal)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span>Commit to SQLite Ledger</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">Split & Settle GenAI</span>
            <span>•</span>
            <span>Visa Hackathon Prototype Sandbox</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Streamlit Layout: Wide (2-Col)</span>
            <span>•</span>
            <span>Database: SQLite (ledger.db)</span>
            <span>•</span>
            <span>Schema: TypedDict response_schema</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FALLBACK_APP_PY = `"""
================================================================================
SPLIT & SETTLE GENAI - VISA HACKATHON TESTING SANDBOX
================================================================================
Target Audience: Beginner CS Students @ Visa Hackathon
Tech Stack: Python 3.10+, Streamlit, SQLite3, Google Generative AI (Gemini)
================================================================================
"""

import os
import json
import sqlite3
from typing import TypedDict, List, Dict, Tuple, Optional
import streamlit as st
from PIL import Image

try:
    import google.generativeai as genai
except ImportError:
    genai = None

# 1. STRICT RESPONSE SCHEMA DEFINITION
class ExpenseSchema(TypedDict):
    payer: str
    amount: float
    description: str

def extract_expense_with_gemini(text_prompt=None, image_file=None, api_key=None):
    if not genai:
        raise RuntimeError("google-generativeai is required.")
    key = api_key or os.getenv("GEMINI_API_KEY")
    genai.configure(api_key=key)

    generation_config = {
        "temperature": 0.1,
        "response_mime_type": "application/json",
        "response_schema": ExpenseSchema,
    }

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        generation_config=generation_config
    )

    contents = []
    if image_file:
        contents.append(image_file)
    if text_prompt:
        contents.append(text_prompt)

    response = model.generate_content(contents)
    return json.loads(response.text)

# 2. SQLITE DATABASE
def init_db():
    conn = sqlite3.connect("ledger.db", check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS Expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payer TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

# 3. SETTLEMENT MATH
def calculate_settlements(expenses):
    paid_by_person = {}
    for _, payer, amount, _ in expenses:
        paid_by_person[payer] = paid_by_person.get(payer, 0.0) + amount

    participants = list(paid_by_person.keys())
    total = sum(paid_by_person.values())
    fair_share = total / len(participants) if participants else 0

    balances = {p: round(amt - fair_share, 2) for p, amt in paid_by_person.items()}
    creditors = [[p, bal] for p, bal in balances.items() if bal > 0.01]
    debtors = [[p, abs(bal)] for p, bal in balances.items() if bal < -0.01]

    settlements = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        transfer = min(debtors[i][1], creditors[j][1])
        settlements.append({
            "from_person": debtors[i][0],
            "to_person": creditors[j][0],
            "amount": round(transfer, 2)
        })
        debtors[i][1] -= transfer
        creditors[j][1] -= transfer
        if debtors[i][1] < 0.01: i += 1
        if creditors[j][1] < 0.01: j += 1

    return {"total": total, "fair_share": fair_share, "settlements": settlements, "balances": balances}

def main():
    st.set_page_config(page_title="Split & Settle GenAI", page_icon="💳", layout="wide")
    init_db()

    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.subheader("Private Chat")
        # Chat messages, file uploader, chat input...

    with col_right:
        st.subheader("Group Ledger")
        if st.button("Run Visa Direct Settlement"):
            st.success("✅ Visa Direct Push-to-Card Authorized")

if __name__ == "__main__":
    main()
`;
