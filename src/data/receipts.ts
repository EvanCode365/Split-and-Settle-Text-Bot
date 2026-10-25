export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptData {
  id: string;
  name: string;
  merchant: string;
  category: string;
  address: string;
  date: string;
  time: string;
  payer: string;
  cardMask: string;
  authCode: string;
  subtotal: number;
  tax: number;
  taxRate: string;
  tip: number;
  tipRate: string;
  total: number;
  items: ReceiptLineItem[];
  imageUrl: string;
  notes?: string;
}

// Generate realistic crisp SVG receipts
function generateReceiptSvg(options: {
  merchant: string;
  subtitle: string;
  address: string;
  date: string;
  time: string;
  payer: string;
  cardMask: string;
  authCode: string;
  items: ReceiptLineItem[];
  subtotal: number;
  tax: number;
  taxRate: string;
  tip: number;
  tipRate: string;
  total: number;
  primaryColor?: string;
}): string {
  const {
    merchant,
    subtitle,
    address,
    date,
    time,
    payer,
    cardMask,
    authCode,
    items,
    subtotal,
    tax,
    taxRate,
    tip,
    tipRate,
    total,
    primaryColor = '#1e293b',
  } = options;

  let y = 110;
  const itemsSvg = items
    .map((item) => {
      const currentY = y;
      y += 24;
      return `
        <text x="24" y="${currentY}" font-family="Courier, monospace" font-size="12" fill="#1e293b" font-weight="600">${item.quantity}x ${item.name}</text>
        <text x="296" y="${currentY}" font-family="Courier, monospace" font-size="12" fill="#0f172a" font-weight="700" text-anchor="end">$${item.totalPrice.toFixed(2)}</text>
        <text x="44" y="${currentY + 12}" font-family="Courier, monospace" font-size="10" fill="#64748b">@ $${item.unitPrice.toFixed(2)} ea</text>
      `;
    })
    .join('');

  y += 10;
  const subtotalY = y;
  const taxY = subtotalY + 20;
  const tipY = taxY + 20;
  const dividerY = tipY + 14;
  const totalY = dividerY + 24;
  const footerY = totalY + 36;
  const totalHeight = footerY + 80;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${totalHeight}" viewBox="0 0 320 ${totalHeight}">
  <defs>
    <filter id="paper-shadow" x="-5%" y="-2%" width="110%" height="106%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.15" />
    </filter>
    <pattern id="sawtooth" x="0" y="0" width="16" height="8" patternUnits="userSpaceOnUse">
      <polygon points="0,0 8,8 16,0" fill="#f8fafc"/>
    </pattern>
  </defs>

  <!-- Receipt Paper Background -->
  <rect x="8" y="8" width="304" height="${totalHeight - 16}" rx="4" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" filter="url(#paper-shadow)" />
  
  <!-- Subtle top header banner -->
  <rect x="8" y="8" width="304" height="6" fill="${primaryColor}" />

  <!-- Merchant Branding Header -->
  <text x="160" y="38" font-family="'Courier New', Courier, monospace" font-size="16" font-weight="800" text-anchor="middle" fill="${primaryColor}" letter-spacing="1">${merchant.toUpperCase()}</text>
  <text x="160" y="54" font-family="'Courier New', Courier, monospace" font-size="10" text-anchor="middle" fill="#64748b">${subtitle}</text>
  <text x="160" y="68" font-family="'Courier New', Courier, monospace" font-size="9" text-anchor="middle" fill="#94a3b8">${address}</text>

  <!-- Date & Time & Auth -->
  <line x1="24" y1="78" x2="296" y2="78" stroke="#cbd5e1" stroke-dasharray="3 3" />
  <text x="24" y="92" font-family="Courier, monospace" font-size="10" fill="#64748b">${date} • ${time}</text>
  <text x="296" y="92" font-family="Courier, monospace" font-size="10" fill="#64748b" text-anchor="end">TX: #${authCode.slice(-6)}</text>
  <line x1="24" y1="99" x2="296" y2="99" stroke="#cbd5e1" stroke-dasharray="3 3" />

  <!-- Items list -->
  ${itemsSvg}

  <!-- Calculation numbers -->
  <line x1="24" y1="${subtotalY - 10}" x2="296" y2="${subtotalY - 10}" stroke="#94a3b8" stroke-dasharray="2 2" />
  
  <text x="24" y="${subtotalY}" font-family="Courier, monospace" font-size="11" fill="#475569">SUBTOTAL</text>
  <text x="296" y="${subtotalY}" font-family="Courier, monospace" font-size="11" fill="#334155" font-weight="600" text-anchor="end">$${subtotal.toFixed(2)}</text>

  <text x="24" y="${taxY}" font-family="Courier, monospace" font-size="11" fill="#475569">TAX (${taxRate})</text>
  <text x="296" y="${taxY}" font-family="Courier, monospace" font-size="11" fill="#334155" font-weight="600" text-anchor="end">$${tax.toFixed(2)}</text>

  <text x="24" y="${tipY}" font-family="Courier, monospace" font-size="11" fill="#2563eb" font-weight="600">TIP / GRATUITY (${tipRate})</text>
  <text x="296" y="${tipY}" font-family="Courier, monospace" font-size="11" fill="#2563eb" font-weight="700" text-anchor="end">$${tip.toFixed(2)}</text>

  <line x1="24" y1="${dividerY}" x2="296" y2="${dividerY}" stroke="#0f172a" stroke-width="1.5" />

  <!-- Grand Total -->
  <text x="24" y="${totalY}" font-family="Courier, monospace" font-size="16" font-weight="800" fill="#0f172a">TOTAL DUE</text>
  <text x="296" y="${totalY}" font-family="Courier, monospace" font-size="17" font-weight="900" fill="#0f172a" text-anchor="end">$${total.toFixed(2)}</text>

  <!-- Payment & Visa Info -->
  <line x1="24" y1="${totalY + 12}" x2="296" y2="${totalY + 12}" stroke="#cbd5e1" stroke-dasharray="2 2" />
  
  <text x="24" y="${footerY}" font-family="Courier, monospace" font-size="10" font-weight="700" fill="#1e40af">PAID VIA: VISA ${cardMask}</text>
  <text x="296" y="${footerY}" font-family="Courier, monospace" font-size="10" fill="#15803d" font-weight="600" text-anchor="end">APPROVED</text>
  
  <text x="24" y="${footerY + 16}" font-family="Courier, monospace" font-size="10" fill="#475569">CARDHOLDER: ${payer.toUpperCase()}</text>
  <text x="296" y="${footerY + 16}" font-family="Courier, monospace" font-size="9" fill="#94a3b8" text-anchor="end">AUTH: ${authCode}</text>

  <!-- Barcode Simulation -->
  <g transform="translate(48, ${footerY + 28})">
    <rect x="0" y="0" width="3" height="22" fill="#334155" />
    <rect x="5" y="0" width="2" height="22" fill="#334155" />
    <rect x="9" y="0" width="4" height="22" fill="#334155" />
    <rect x="16" y="0" width="1" height="22" fill="#334155" />
    <rect x="20" y="0" width="5" height="22" fill="#334155" />
    <rect x="28" y="0" width="2" height="22" fill="#334155" />
    <rect x="33" y="0" width="4" height="22" fill="#334155" />
    <rect x="40" y="0" width="2" height="22" fill="#334155" />
    <rect x="45" y="0" width="3" height="22" fill="#334155" />
    <rect x="52" y="0" width="5" height="22" fill="#334155" />
    <rect x="60" y="0" width="1" height="22" fill="#334155" />
    <rect x="64" y="0" width="4" height="22" fill="#334155" />
    <rect x="71" y="0" width="2" height="22" fill="#334155" />
    <rect x="76" y="0" width="3" height="22" fill="#334155" />
    <rect x="82" y="0" width="5" height="22" fill="#334155" />
    <rect x="90" y="0" width="2" height="22" fill="#334155" />
    <rect x="95" y="0" width="3" height="22" fill="#334155" />
    <rect x="101" y="0" width="1" height="22" fill="#334155" />
    <rect x="105" y="0" width="4" height="22" fill="#334155" />
    <rect x="112" y="0" width="3" height="22" fill="#334155" />
    <rect x="118" y="0" width="5" height="22" fill="#334155" />
    <rect x="126" y="0" width="2" height="22" fill="#334155" />
    <rect x="131" y="0" width="4" height="22" fill="#334155" />
    <rect x="138" y="0" width="2" height="22" fill="#334155" />
    <rect x="143" y="0" width="5" height="22" fill="#334155" />
    <rect x="151" y="0" width="1" height="22" fill="#334155" />
    <rect x="155" y="0" width="3" height="22" fill="#334155" />
    <rect x="161" y="0" width="4" height="22" fill="#334155" />
    <rect x="168" y="0" width="2" height="22" fill="#334155" />
    <rect x="173" y="0" width="5" height="22" fill="#334155" />
    <rect x="181" y="0" width="2" height="22" fill="#334155" />
    <rect x="186" y="0" width="4" height="22" fill="#334155" />
    <rect x="193" y="0" width="3" height="22" fill="#334155" />
    <rect x="199" y="0" width="2" height="22" fill="#334155" />
    <rect x="204" y="0" width="4" height="22" fill="#334155" />
    <rect x="211" y="0" width="3" height="22" fill="#334155" />
    <rect x="217" y="0" width="5" height="22" fill="#334155" />
  </g>

  <text x="160" y="${footerY + 58}" font-family="Courier, monospace" font-size="9" text-anchor="middle" fill="#64748b">*** THANK YOU FOR VISITING ***</text>
</svg>
`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 5 Curated Sample Quick Receipts with complete itemized breakdown numbers
export const QUICK_RECEIPTS: ReceiptData[] = [
  {
    id: 'blue-bottle-coffee',
    name: 'Artisan Coffee & Pastries',
    merchant: 'Blue Bottle Coffee',
    category: 'Coffee & Breakfast',
    address: '66 Mint St, San Francisco, CA 94103',
    date: 'OCT 12, 2026',
    time: '08:42 AM',
    payer: 'Elena',
    cardMask: '•••• 9402',
    authCode: 'VD-AUTH-884129',
    subtotal: 26.5,
    tax: 2.32,
    taxRate: '8.75%',
    tip: 4.5,
    tipRate: '17.0%',
    total: 33.32,
    items: [
      { name: 'Single Origin Cappuccino', quantity: 2, unitPrice: 7.0, totalPrice: 14.0 },
      { name: 'New Orleans Iced Cold Brew', quantity: 1, unitPrice: 5.5, totalPrice: 5.5 },
      { name: 'Warm Oat Croissant', quantity: 1, unitPrice: 4.25, totalPrice: 4.25 },
      { name: 'Brown Sugar Almond Cookie', quantity: 1, unitPrice: 2.75, totalPrice: 2.75 },
    ],
    imageUrl: '', // Will populate below
    notes: 'Morning hackathon kick-off coffee run for the team.',
  },
  {
    id: 'marios-pizza',
    name: 'Team Pizza & Sodas Feast',
    merchant: "Mario's Artisan Pizzeria",
    category: 'Lunch & Dinner',
    address: '450 Mission Blvd, San Francisco, CA',
    date: 'OCT 12, 2026',
    time: '01:15 PM',
    payer: 'Marcus',
    cardMask: '•••• 3110',
    authCode: 'VD-AUTH-741902',
    subtotal: 72.0,
    tax: 6.48,
    taxRate: '9.0%',
    tip: 13.5,
    tipRate: '18.75%',
    total: 91.98,
    items: [
      { name: 'XL Truffle Mushroom Pizza', quantity: 1, unitPrice: 34.0, totalPrice: 34.0 },
      { name: 'Large Pepperoni & Basil Pie', quantity: 1, unitPrice: 24.0, totalPrice: 24.0 },
      { name: 'Garlic Knots with Marinara (6pk)', quantity: 1, unitPrice: 6.0, totalPrice: 6.0 },
      { name: 'Italian San Pellegrino Sodas', quantity: 4, unitPrice: 2.0, totalPrice: 8.0 },
    ],
    imageUrl: '',
    notes: 'Fueling the team during model fine-tuning sprint.',
  },
  {
    id: 'lyft-airport',
    name: 'Team Airport XL Ride',
    merchant: 'Lyft XL Transportation',
    category: 'Rideshare & Transit',
    address: 'SFO Terminal 2 to Hackathon Venue',
    date: 'OCT 12, 2026',
    time: '09:30 AM',
    payer: 'Sophia',
    cardMask: '•••• 8820',
    authCode: 'VD-AUTH-903112',
    subtotal: 42.5,
    tax: 2.8,
    taxRate: 'Surcharge & Toll',
    tip: 8.0,
    tipRate: '18.8%',
    total: 53.3,
    items: [
      { name: 'Lyft XL Fare (6 Passenger)', quantity: 1, unitPrice: 35.0, totalPrice: 35.0 },
      { name: 'SFO Airport Access Fee', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
      { name: 'Bay Bridge Fastrak Toll', quantity: 1, unitPrice: 3.0, totalPrice: 3.0 },
    ],
    imageUrl: '',
    notes: 'Group ride with luggage from airport to hackathon headquarters.',
  },
  {
    id: 'trader-joes',
    name: 'Hackathon Grocery & Snacks',
    merchant: "Trader Joe's Market #219",
    category: 'Groceries & Supplies',
    address: '555 9th St, San Francisco, CA',
    date: 'OCT 12, 2026',
    time: '04:10 PM',
    payer: 'David',
    cardMask: '•••• 4519',
    authCode: 'VD-AUTH-618492',
    subtotal: 38.25,
    tax: 3.44,
    taxRate: '9.0%',
    tip: 0.0,
    tipRate: 'None (Retail)',
    total: 41.69,
    items: [
      { name: 'Organic Cold Brew Coffee (32oz)', quantity: 2, unitPrice: 6.49, totalPrice: 12.98 },
      { name: 'Organic Fair-Trade Bananas (bunch)', quantity: 2, unitPrice: 1.89, totalPrice: 3.78 },
      { name: 'Dark Chocolate Covered Almonds', quantity: 2, unitPrice: 5.99, totalPrice: 11.98 },
      { name: 'Spindrift Sparkling Waters (8pk)', quantity: 1, unitPrice: 6.49, totalPrice: 6.49 },
      { name: 'Honey Greek Yogurt Cups', quantity: 3, unitPrice: 1.01, totalPrice: 3.02 },
    ],
    imageUrl: '',
    notes: 'Re-stocking desk snacks, fruit, and cold beverages for the late night push.',
  },
  {
    id: 'sweetgreen',
    name: 'Healthy Team Harvest Bowls',
    merchant: 'Sweetgreen SoMa',
    category: 'Dinner & Salads',
    address: '171 2nd St, San Francisco, CA',
    date: 'OCT 12, 2026',
    time: '07:25 PM',
    payer: 'Alice',
    cardMask: '•••• 6012',
    authCode: 'VD-AUTH-447831',
    subtotal: 52.5,
    tax: 4.75,
    taxRate: '9.05%',
    tip: 7.0,
    tipRate: '13.3%',
    total: 64.25,
    items: [
      { name: 'Harvest Bowl with Warm Chicken', quantity: 2, unitPrice: 16.25, totalPrice: 32.5 },
      { name: 'Crispy Rice Bowl with Tofu', quantity: 1, unitPrice: 14.5, totalPrice: 14.5 },
      { name: 'Rosemary Focaccia Bread', quantity: 2, unitPrice: 2.75, totalPrice: 5.5 },
    ],
    imageUrl: '',
    notes: 'Nutritious dinner bowls to avoid sugar crashes before the midnight demo.',
  },
];

// Initialize SVG images
QUICK_RECEIPTS.forEach((receipt) => {
  receipt.imageUrl = generateReceiptSvg({
    merchant: receipt.merchant,
    subtitle: receipt.category,
    address: receipt.address,
    date: receipt.date,
    time: receipt.time,
    payer: receipt.payer,
    cardMask: receipt.cardMask,
    authCode: receipt.authCode,
    items: receipt.items,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    taxRate: receipt.taxRate,
    tip: receipt.tip,
    tipRate: receipt.tipRate,
    total: receipt.total,
    primaryColor:
      receipt.id === 'blue-bottle-coffee'
        ? '#0284c7'
        : receipt.id === 'marios-pizza'
        ? '#b91c1c'
        : receipt.id === 'lyft-airport'
        ? '#ec4899'
        : receipt.id === 'trader-joes'
        ? '#059669'
        : '#15803d',
  });
});
