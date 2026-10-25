import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const p = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(p) && p !== 8080) return p;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const p = parseInt(process.env.DEFAULT_APP_PORT, 10);
    if (!isNaN(p) && p !== 8080) return p;
  }
  if (process.env.PORT && process.env.PORT !== '8080') {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p)) return p;
  }
  return 3000;
}

const PORT = resolvePort();
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '20mb' }));

// Shared server-side Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Blacklist of conversational interjections, adverbs, and verbs that are NEVER person names
const NON_PERSON_WORDS = new Set([
  'done', 'just', 'also', 'then', 'so', 'okay', 'ok', 'hey', 'hi', 'hello',
  'cool', 'great', 'nice', 'sure', 'yes', 'yeah', 'no', 'nope', 'well',
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
  'snacks', 'water', 'beer', 'wine', 'bar', 'cafe', 'restaurant'
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

// Helper: Extract payer from natural language text
function extractPayerFromText(text: string, defaultPayer: string = 'You'): string {
  let clean = text.trim();
  if (!clean) return defaultPayer;

  // Strip conversational prefixes like "Done,", "Okay,", "Hey,", "Sure," at the beginning
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
    const cand = byMatch[1];
    if (!isInvalidPersonName(cand)) {
      return cand.charAt(0).toUpperCase() + cand.slice(1).toLowerCase();
    }
  }

  // 3. "[Name] paid", "[Name] spent", "[Name] bought", "[Name] covered"
  const verbMatch = clean.match(/\b([A-Za-z]+)\s+(?:paid|spent|bought|covered|charged)\b/i);
  if (verbMatch) {
    const cand = verbMatch[1];
    if (!isInvalidPersonName(cand)) {
      return cand.charAt(0).toUpperCase() + cand.slice(1).toLowerCase();
    }
  }

  // 4. Starting with explicit Name prefix before colon or dash: e.g. "Alice: $45 for lunch"
  const prefixMatch = clean.match(/^([A-Za-z]+)\s*[:\-–]\s*/);
  if (prefixMatch) {
    const cand = prefixMatch[1];
    if (!isInvalidPersonName(cand)) {
      return cand.charAt(0).toUpperCase() + cand.slice(1).toLowerCase();
    }
  }

  return defaultPayer;
}

// Endpoint: Parse expense from natural language text or base64 receipt image
app.post('/api/gemini/parse-expense', async (req: Request, res: Response) => {
  try {
    const { text, imageBase64, mimeType, quickReceiptData, currentSender } = req.body;
    const authorSender = currentSender || 'You';

    if (!text && !imageBase64 && !quickReceiptData) {
      return res.status(400).json({ error: 'Please provide either text or a receipt image.' });
    }

    // If quickReceiptData is provided directly, return high-fidelity data immediately
    if (quickReceiptData) {
      return res.status(200).json({
        payer: quickReceiptData.payer || 'You',
        amount: Number(quickReceiptData.total || quickReceiptData.amount) || 0.0,
        description: quickReceiptData.name || quickReceiptData.merchant || 'Quick Receipt',
        merchant: quickReceiptData.merchant || 'Merchant',
        subtotal: Number(quickReceiptData.subtotal) || Number(quickReceiptData.total),
        tax: Number(quickReceiptData.tax) || 0,
        tip: Number(quickReceiptData.tip) || 0,
        items: quickReceiptData.items || [],
        paymentMethod: quickReceiptData.cardMask ? `Visa ${quickReceiptData.cardMask}` : 'Visa Direct',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      // Deterministic fallback if GEMINI_API_KEY is not configured yet
      const hasImage = Boolean(imageBase64);
      const textStr = String(text || '').trim();
      const hasNumbers = /\$?\d+(?:\.\d+)?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)\b/i.test(textStr);
      const hasPurchaseKeywords = /(paid|spent|bought|cost|charge|charged|bill|receipt|dinner|lunch|breakfast|coffee|drinks|pizza|uber|lyft|ride|airbnb|hotel|tickets|split|owe|dollars|bucks|\$|fee|tip|tax)/i.test(textStr);

      if (!hasImage && (!hasNumbers || !hasPurchaseKeywords)) {
        return res.status(200).json({
          isExpense: false,
          ignored: true,
          reason: 'Ignored: Input is not about purchasing or spending money, or does not contain specific monetary numbers.',
        });
      }

      // If text mentions numbers and purchase keywords, extract values
      const dollarMatch = textStr.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
      const amountVal = dollarMatch ? parseFloat(dollarMatch[1]) : 25.50;
      const payerName = extractPayerFromText(textStr, authorSender);
      const desc = textStr ? extractExpenseSentence(textStr) : `${payerName}'s Expense`;

      return res.status(200).json({
        isExpense: true,
        ignored: false,
        payer: payerName,
        amount: amountVal,
        description: desc,
        merchant: desc,
        subtotal: Math.round(amountVal * 0.85 * 100) / 100,
        tax: Math.round(amountVal * 0.08 * 100) / 100,
        tip: Math.round(amountVal * 0.07 * 100) / 100,
        items: [
          { name: desc, quantity: 1, price: Math.round(amountVal * 0.85 * 100) / 100 },
        ],
        paymentMethod: 'Visa •••• 9402',
      });
    }

    const parts: any[] = [];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: cleanBase64,
        },
      });
      parts.push({
        text: 'Analyze this receipt image and extract the payer, line items bought, subtotal, tax, tip, total amount, merchant, and payment method.'
      });
    }

    if (text) {
      parts.push({
        text: `Analyze this user message: "${text}". Determine if this is about purchasing or spending money with specific monetary amounts.`
      });
    }

    const systemInstruction = 
      "You are an expert financial expense parsing agent for Visa Hackathon's Split & Settle GenAI app. " +
      "CRITICAL INSTRUCTIONS: " +
      "1. You MUST first determine if the input is genuinely about purchasing or spending money AND provides specific money and numbers (or is an uploaded receipt image with prices). " +
      "2. If the input is NOT about purchasing/spending money, or lacks specific monetary numbers (e.g. general conversation, greetings like 'hello', casual comments, non-financial chatter, or statements without amounts), you MUST return 'isExpense': false, 'ignored': true, and explain why in 'reason'. Set 'amount' to 0 and 'payer' to ''. " +
      "3. Only if it IS genuinely about purchasing/spending money with specific numbers, set 'isExpense': true, 'ignored': false, and extract: " +
      "- 'payer': First name or person who paid. If the user text indicates another person paid (e.g. 'Alice paid $45', 'Bob spent $30', 'Lunch paid by Sarah $50'), extract that person's name as 'payer' (e.g. 'Alice', 'Bob', 'Sarah'). ONLY set 'payer' to 'You' if the user explicitly writes 'I paid', 'I spent', 'I covered', or if no other person is mentioned. " +
      "IMPORTANT: Conversational words like 'Done', 'Okay', 'Thanks', 'Yes', 'Sure', 'Hey', 'Hi', 'Sent' are NOT person names. NEVER extract 'Done' or conversational words as the payer. " +
      "- 'amount': Final total dollar amount as a float (e.g. 42.50). " +
      "- 'description': Directly include the full sentence of the user text message describing what was paid. Do not shorten, truncate, or abbreviate it. " +
      "- 'merchant': Official merchant name if visible. " +
      "- 'subtotal': Pre-tax subtotal if visible or calculated from items. " +
      "- 'tax': Tax amount as a float (0 if none). " +
      "- 'tip': Tip or gratuity amount as a float (0 if none). " +
      "- 'items': List of items purchased with name, unit/total price, and quantity. " +
      "- 'paymentMethod': Mention of card type or mask (e.g. 'Visa 9402'). " +
      "Return strictly adhering to the schema.";

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isExpense: {
              type: Type.BOOLEAN,
              description: 'True ONLY if the message or image is about purchasing or spending money with specific monetary numbers',
            },
            ignored: {
              type: Type.BOOLEAN,
              description: 'True if ignored because it is not about purchasing/spending money with specific numbers',
            },
            reason: {
              type: Type.STRING,
              description: 'Reason for ignoring if not an expense',
            },
            payer: {
              type: Type.STRING,
              description: 'The name of the person who paid',
            },
            amount: {
              type: Type.NUMBER,
              description: 'The total expense amount',
            },
            description: {
              type: Type.STRING,
              description: 'Short description or vendor name',
            },
            merchant: {
              type: Type.STRING,
              description: 'Vendor or merchant name',
            },
            subtotal: {
              type: Type.NUMBER,
              description: 'Pre-tax and pre-tip subtotal amount',
            },
            tax: {
              type: Type.NUMBER,
              description: 'Tax amount in dollars',
            },
            tip: {
              type: Type.NUMBER,
              description: 'Tip or gratuity in dollars',
            },
            items: {
              type: Type.ARRAY,
              description: 'List of bought items',
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  quantity: { type: Type.NUMBER },
                },
                required: ['name', 'price'],
              },
            },
            paymentMethod: {
              type: Type.STRING,
              description: 'Payment card or method',
            },
          },
          required: ['isExpense', 'ignored'],
        },
      },
    });

    const parsedText = response.text?.trim() || '{}';
    const jsonResult = JSON.parse(parsedText);

    if (jsonResult.isExpense === false || jsonResult.ignored === true) {
      return res.json({
        isExpense: false,
        ignored: true,
        reason: jsonResult.reason || 'Input is not about purchasing or spending money, or missing specific numbers.',
      });
    }

    let finalPayer = jsonResult.payer ? jsonResult.payer.trim() : authorSender;
    if (isInvalidPersonName(finalPayer)) {
      finalPayer = authorSender;
    } else if (finalPayer.toLowerCase() === 'you' && authorSender && authorSender !== 'You') {
      finalPayer = authorSender;
    }

    const sentenceDescription = text ? extractExpenseSentence(String(text)) : (jsonResult.description || jsonResult.merchant || 'Receipt Expense');

    return res.json({
      isExpense: true,
      ignored: false,
      payer: finalPayer,
      amount: Number(jsonResult.amount) || 0.0,
      description: sentenceDescription,
      merchant: jsonResult.merchant || sentenceDescription,
      subtotal: Number(jsonResult.subtotal) || Number(jsonResult.amount) || 0.0,
      tax: Number(jsonResult.tax) || 0.0,
      tip: Number(jsonResult.tip) || 0.0,
      items: Array.isArray(jsonResult.items) && jsonResult.items.length > 0 ? jsonResult.items : [{ name: sentenceDescription, price: Number(jsonResult.amount) || 0.0, quantity: 1 }],
      paymentMethod: jsonResult.paymentMethod || 'Visa Direct',
    });
  } catch (error: any) {
    console.error('Error parsing expense with Gemini, using resilient fallback:', error);
    const authorSender = req.body.currentSender || 'You';
    const textStr = String(req.body.text || '').trim();
    const dollarMatch = textStr.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    const amountVal = dollarMatch ? parseFloat(dollarMatch[1]) : 25.50;
    const payerName = extractPayerFromText(textStr, authorSender);
    const desc = textStr ? extractExpenseSentence(textStr) : `${payerName}'s Expense`;

    return res.status(200).json({
      isExpense: true,
      ignored: false,
      payer: payerName,
      amount: amountVal,
      description: desc,
      merchant: desc,
      subtotal: Math.round(amountVal * 0.85 * 100) / 100,
      tax: Math.round(amountVal * 0.08 * 100) / 100,
      tip: Math.round(amountVal * 0.07 * 100) / 100,
      items: [
        { name: desc, quantity: 1, price: Math.round(amountVal * 0.85 * 100) / 100 },
      ],
      paymentMethod: 'Visa •••• 9402',
    });
  }
});

// Endpoint: Answering user questions about the ledger, receipts, balances, or settlement when asked
app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  try {
    const { message, expenses, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const expensesList = Array.isArray(expenses) ? expenses : [];
    const messageStr = String(message || '').trim().toLowerCase();

    // Check if user specifically called the assistant by name
    const isCalledByName = 
      messageStr.includes('@splitbot') ||
      messageStr.includes('splitbot') ||
      messageStr.includes('@bot') ||
      messageStr.includes('@ai') ||
      messageStr.includes('split bot') ||
      messageStr.includes('@split');

    // Check if query is about bill splitting, what other people paid, expenses, or financial ledger data
    const isSplittingOrPaymentInquiry =
      isCalledByName ||
      messageStr.includes('split') ||
      messageStr.includes('splitting') ||
      messageStr.includes('fair share') ||
      messageStr.includes('who owes') ||
      messageStr.includes('settle') ||
      messageStr.includes('settlement') ||
      messageStr.includes('balance') ||
      messageStr.includes('who paid') ||
      messageStr.includes('who payed') ||
      messageStr.includes('what did') ||
      messageStr.includes('how much did') ||
      messageStr.includes('what other people paid') ||
      messageStr.includes('what others paid') ||
      messageStr.includes('what everyone paid') ||
      messageStr.includes('did anyone pay') ||
      messageStr.includes('who covered') ||
      messageStr.includes('who bought') ||
      messageStr.includes('who spent') ||
      messageStr.includes('total') ||
      messageStr.includes('pool') ||
      messageStr.includes('tax') ||
      messageStr.includes('tip') ||
      messageStr.includes('car') ||
      messageStr.includes('ride') ||
      messageStr.includes('receipt') ||
      messageStr.includes('ledger') ||
      messageStr.includes('cost') ||
      messageStr.includes('dollar') ||
      messageStr.includes('$') ||
      expensesList.some((e: any) =>
        (e.payer && messageStr.includes(String(e.payer).toLowerCase())) ||
        (e.description && messageStr.includes(String(e.description).toLowerCase())) ||
        (e.merchant && messageStr.includes(String(e.merchant).toLowerCase()))
      );

    // Only ignore if message is completely non-financial chatter
    if (!isSplittingOrPaymentInquiry) {
      return res.status(200).json({
        reply: null,
        ignored: true,
        reason: 'Ignored: SplitBot specializes in bill splitting, participant expenses, and ledger settlements.',
      });
    }

    const expensesSummary = expensesList.map((e: any) =>
      `ID #${e.id}: ${e.payer} paid $${Number(e.amount).toFixed(2)} for "${e.description}" (Subtotal: $${Number(e.subtotal || e.amount).toFixed(2)}, Tax: $${Number(e.tax || 0).toFixed(2)}, Tip: $${Number(e.tip || 0).toFixed(2)}, Items: ${(e.items || []).map((i: any) => `${i.quantity || 1}x ${i.name} ($${Number(i.totalPrice || (i.price * (i.quantity || 1)) || 0).toFixed(2)})`).join(', ') || 'N/A'})`
    ).join('\n');

    if (!process.env.GEMINI_API_KEY) {
      const local = generateLocalChatReply(message, expensesList);
      return res.status(200).json({
        reply: sanitizeAsterisks(local.shortReply),
        detailedInfo: sanitizeAsterisks(local.detailedInfo),
        ignored: false,
      });
    }

    const prompt = 
      `User question: "${message}"\n\n` +
      `Current SQLite ledger.db state:\n` +
      `${expensesSummary || 'Ledger is currently empty.'}\n\n` +
      `${context ? `Context: ${context}\n` : ''}` +
      `Provide a short, direct answer for 'shortReply' (1-2 sentences maximum, professional financial tone, no asterisks). Provide the deep breakdown, math, and transactions in 'detailedInfo' for when the user requests more information.`;

    const systemInstruction =
      "You are SplitBot, the professional financial assistant for the Split & Settle GenAI application powered by Visa Direct. " +
      "DEFAULT REQUIREMENT: Keep your primary answer ('shortReply') very brief, punchy, and professional (1 to 2 sentences max). " +
      "Put the full step-by-step breakdown, itemized transactions, math calculations, and participants in 'detailedInfo' for users who request more information. " +
      "CRITICAL PROFESSIONAL TERMINOLOGY RULE: This is an enterprise-grade commercial expense tracking and payment settlement app, NOT a game. " +
      "NEVER call or refer to people as 'player' or 'players'. Always use professional business terminology: 'Participant', 'Team Member', 'Payer', 'Cardholder', 'Account Holder', or their actual names (e.g. Alice, Bob, Charlie). " +
      "Never use game terminology like 'player', 'round', 'play', or 'game'. " +
      "CRITICAL FORMATTING INSTRUCTION: Do NOT use asterisks (*) anywhere in either field. " +
      "Never use bold markdown asterisks (like **text**). Never use italic markdown asterisks (like *text*). " +
      "Never use asterisk bullet characters (like * item). If you need bullet points in detailedInfo, use '• '.";

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shortReply: {
              type: Type.STRING,
              description: 'A brief, concise direct answer in 1 or 2 sentences max containing only the core answer and essential numbers.',
            },
            detailedInfo: {
              type: Type.STRING,
              description: 'Detailed breakdown, itemized line items, calculations, math, and ledger records when the user asks for more information.',
            },
          },
          required: ['shortReply', 'detailedInfo'],
        },
      },
    });

    let shortReply = '';
    let detailedInfo = '';

    try {
      const parsed = JSON.parse(response.text?.trim() || '{}');
      shortReply = parsed.shortReply || '';
      detailedInfo = parsed.detailedInfo || '';
    } catch {
      shortReply = response.text?.trim() || '';
    }

    if (!shortReply) {
      const local = generateLocalChatReply(message, expensesList);
      shortReply = local.shortReply;
      detailedInfo = local.detailedInfo;
    }

    const cleanedShortReply = sanitizeAsterisks(shortReply);
    const cleanedDetailedInfo = sanitizeAsterisks(detailedInfo);

    return res.json({
      reply: cleanedShortReply,
      detailedInfo: cleanedDetailedInfo,
      ignored: false,
    });
  } catch (error: any) {
    console.error('Error answering question with Gemini:', error);
    const local = generateLocalChatReply(req.body.message || '', req.body.expenses || []);
    return res.status(200).json({
      reply: sanitizeAsterisks(local.shortReply),
      detailedInfo: sanitizeAsterisks(local.detailedInfo),
      ignored: false,
    });
  }
});

function sanitizeAsterisks(text: string): string {
  if (!text) return '';
  let cleaned = text;
  // Convert markdown bullet stars "* item" or "** item" to clean "• item"
  cleaned = cleaned.replace(/^(\s*)\*+\s+/gm, '$1• ');
  // Convert **bold text** to plain text (strip the asterisks)
  cleaned = cleaned.replace(/\*\*+([^*]+)\*\*+/g, '$1');
  // Convert *italic text* to plain text (strip the asterisks)
  cleaned = cleaned.replace(/\*+([^*]+)\*+/g, '$1');
  // Strip any remaining lone or repeated asterisks
  cleaned = cleaned.replace(/\*+/g, '');
  // Professional terminology enforcement: replace any game-like "player" or "players" terms
  cleaned = cleaned
    .replace(/\bPlayers\b/g, 'Participants')
    .replace(/\bPlayer\b/g, 'Participant')
    .replace(/\bplayers\b/g, 'participants')
    .replace(/\bplayer\b/g, 'participant');
  return cleaned.trim();
}

interface LocalReply {
  shortReply: string;
  detailedInfo: string;
}

function generateLocalChatReply(query: string, expenses: any[]): LocalReply {
  const q = (query || '').toLowerCase();
  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const payers = Array.from(new Set(expenses.map(e => e.payer)));
  const fairShare = payers.length > 0 ? total / payers.length : 0;

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
      const pAmt = expenses.filter((e) => e.payer.toLowerCase() === p.toLowerCase()).reduce((s, e) => s + Number(e.amount), 0);
      return `${p} paid $${pAmt.toFixed(2)}`;
    });
    return {
      shortReply: `👥 Participant payments: ${listSummary.join(', ')} ($${total.toFixed(2)} total group pool).`,
      detailedInfo: `• Total Group Spending: $${total.toFixed(2)}\n• Equal Share: $${fairShare.toFixed(2)} per person\n• Breakdown by Participant:\n` +
        payers.map((p) => {
          const pExps = expenses.filter((e) => e.payer.toLowerCase() === p.toLowerCase());
          const pAmt = pExps.reduce((s, e) => s + Number(e.amount), 0);
          return `  • ${p}: Total $${pAmt.toFixed(2)} (${pExps.length} expense(s))\n` +
            pExps.map((e) => `    - #${e.id}: $${Number(e.amount).toFixed(2)} for "${e.description}"`).join('\n');
        }).join('\n'),
    };
  }

  // Check if query mentions a specific person (e.g. "What did Alice pay?", "Did Bob pay?")
  const mentionedPayer = payers.find((p) => q.includes(p.toLowerCase()));
  if (mentionedPayer && !q.includes('who owes') && !q.includes('split') && !q.includes('fair share')) {
    const payerExpenses = expenses.filter((e) => e.payer.toLowerCase() === mentionedPayer.toLowerCase());
    const payerTotal = payerExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return {
      shortReply: `👤 ${mentionedPayer} has paid $${payerTotal.toFixed(2)} across ${payerExpenses.length} transaction(s).`,
      detailedInfo: `• Payer: ${mentionedPayer}\n• Total Amount Paid: $${payerTotal.toFixed(2)}\n• Transactions:\n` +
        payerExpenses.map((e) => `  • #${e.id}: $${Number(e.amount).toFixed(2)} for "${e.description}"`).join('\n'),
    };
  }

  // If asking who paid for car / ride
  const carTerms = ['car', 'ride', 'lyft', 'uber', 'taxi', 'drive'];
  if (carTerms.some(term => q.includes(term))) {
    const carExp = expenses.find(e => 
      carTerms.some(term => (e.description || '').toLowerCase().includes(term) || (e.merchant || '').toLowerCase().includes(term))
    );
    if (carExp) {
      return {
        shortReply: `🚗 ${carExp.payer} paid $${Number(carExp.amount).toFixed(2)} for "${carExp.description}".`,
        detailedInfo: `• Transaction ID: #${carExp.id} in SQLite ledger.db\n• Merchant: ${carExp.merchant || carExp.description}\n• Amount: $${Number(carExp.amount).toFixed(2)} (Subtotal: $${Number(carExp.subtotal || carExp.amount).toFixed(2)}, Tax: $${Number(carExp.tax || 0).toFixed(2)}, Tip: $${Number(carExp.tip || 0).toFixed(2)})\n• Payment Method: ${carExp.paymentMethod || 'Visa Direct'}\n• Timestamp: ${carExp.timestamp || 'Recorded in ledger'}`,
      };
    } else {
      return {
        shortReply: `🚗 No expense for a car or ride is recorded in ledger.db yet.`,
        detailedInfo: `• Total Recorded Expenses: ${expenses.length}\n• Current Ledger Entries:\n` +
          expenses.map(e => `  • #${e.id}: ${e.payer} paid $${Number(e.amount).toFixed(2)} for "${e.description}"`).join('\n') +
          `\n• You can attach a Lyft/Uber receipt or type "Dan paid $45 for ride" to log one.`,
      };
    }
  }

  // Check if query asks who paid for other specific items
  for (const exp of expenses) {
    const desc = (exp.description || '').toLowerCase();
    const words = desc.split(/\s+/).filter((w: string) => w.length > 3);
    if (words.some((w: string) => q.includes(w))) {
      return {
        shortReply: `🧾 ${exp.payer} paid $${Number(exp.amount).toFixed(2)} for "${exp.description}".`,
        detailedInfo: `• Ledger Record: #${exp.id}\n• Subtotal: $${Number(exp.subtotal || exp.amount).toFixed(2)}, Tax: $${Number(exp.tax || 0).toFixed(2)}, Tip: $${Number(exp.tip || 0).toFixed(2)}\n• Line Items: ${(exp.items || []).map((i: any) => `${i.quantity || 1}x ${i.name} ($${Number(i.totalPrice || (i.price * (i.quantity || 1)) || 0).toFixed(2)})`).join(', ') || 'Item details in modal'}\n• Auth Code: ${exp.authCode || 'VD-AUTH-DEFAULT'}`,
      };
    }
  }

  if (q.includes('total') || q.includes('how much spent') || q.includes('pool')) {
    return {
      shortReply: `💰 Total group spending is $${total.toFixed(2)} across ${expenses.length} transaction(s).`,
      detailedInfo: `• Total Pool: $${total.toFixed(2)}\n• Participants (${payers.length}): ${payers.join(', ') || 'None'}\n• Equal Share: $${fairShare.toFixed(2)} per person\n• All Transactions:\n` +
        expenses.map(e => `  • ID #${e.id}: ${e.payer} paid $${Number(e.amount).toFixed(2)} for "${e.description}"`).join('\n'),
    };
  }

  if (q.includes('who owes') || q.includes('fair share') || q.includes('split') || q.includes('settle')) {
    const balances = payers.map(p => {
      const paid = expenses.filter(e => e.payer === p).reduce((s, e) => s + Number(e.amount), 0);
      const net = paid - fairShare;
      return { person: p, paid, net };
    });

    const netSummary = balances.map(b =>
      `• ${b.person}: paid $${b.paid.toFixed(2)} (${b.net >= 0 ? `+$${b.net.toFixed(2)} to receive` : `-$${Math.abs(b.net).toFixed(2)} to pay`})`
    ).join('\n');

    return {
      shortReply: `⚖️ Fair share is $${fairShare.toFixed(2)} per person across ${payers.length} team members ($${total.toFixed(2)} total pool).`,
      detailedInfo: `• Total Pool: $${total.toFixed(2)}\n• Participants: ${payers.join(', ') || 'None'}\n• Fair Share Calculation: $${total.toFixed(2)} ÷ ${payers.length || 1} = $${fairShare.toFixed(2)}/person\n\nNet Balances:\n${netSummary}\n\nPush-to-card settlements can be executed directly using the Visa Direct engine on the right!`,
    };
  }

  if (q.includes('tax') || q.includes('tip')) {
    const withTaxOrTip = expenses.filter(e => (e.tax && e.tax > 0) || (e.tip && e.tip > 0));
    const totalTax = expenses.reduce((s, e) => s + Number(e.tax || 0), 0);
    const totalTip = expenses.reduce((s, e) => s + Number(e.tip || 0), 0);
    return {
      shortReply: `🧾 Group total tax is $${totalTax.toFixed(2)} and tip is $${totalTip.toFixed(2)}.`,
      detailedInfo: `• Total Tax: $${totalTax.toFixed(2)}\n• Total Tip: $${totalTip.toFixed(2)}\n• Breakdown by Transaction:\n` +
        (withTaxOrTip.length > 0 
          ? withTaxOrTip.map(e => `  • ${e.payer} at ${e.description}: Tax = $${Number(e.tax || 0).toFixed(2)}, Tip = $${Number(e.tip || 0).toFixed(2)} (Total: $${Number(e.amount).toFixed(2)})`).join('\n')
          : '  • No itemized tax/tip recorded on transactions yet.'),
    };
  }

  if (q.includes('item') || q.includes('bought') || q.includes('receipt')) {
    const withItems = expenses.filter(e => e.items && e.items.length > 0);
    const totalItemCount = withItems.reduce((s, e) => s + (e.items?.length || 0), 0);
    return {
      shortReply: `🛒 ${totalItemCount} item(s) are recorded across ${withItems.length} receipt(s) in ledger.db.`,
      detailedInfo: `• Detailed Item Breakdown:\n` +
        withItems.map(e => `  • ${e.description} (${e.payer}): ${e.items.map((i: any) => `${i.quantity || 1}x ${i.name} ($${Number(i.totalPrice || (i.price * (i.quantity || 1)) || 0).toFixed(2)})`).join(', ')}`).join('\n'),
    };
  }

  return {
    shortReply: `📊 Ledger status: $${total.toFixed(2)} total pool with ${payers.length} participants and ${expenses.length} transaction(s).`,
    detailedInfo: `• Participants: ${payers.join(', ') || 'None'}\n• Equal Share: $${fairShare.toFixed(2)} per person\n• To inquire about specific expenses, ask SplitBot anytime!`,
  };
}

// Endpoint: Return app.py raw content for the code viewer & download
app.get('/api/code/app-py', async (_req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const appPyPath = path.resolve(__dirname, 'app.py');
    const content = await fs.readFile(appPyPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Could not read app.py');
  }
});

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    console.log('Serving production build from dist directory');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    console.log('Mounting Vite dev middleware');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is already in use by another instance.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
