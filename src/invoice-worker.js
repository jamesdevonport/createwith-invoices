import puppeteer from '@cloudflare/puppeteer';

const BRAND = {
  color: '#3C296D',
  fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
  logo: 'https://228b0d41a70826a298630413a3775f84.cdn.bubble.io/cdn-cgi/image/w=96,h=52,f=auto,dpr=2,fit=contain/f1740613307556x552233112811189500/Create%20With_%E2%80%A8%20%285%29.png',
};

const COMPANY = {
  name: 'CREATE WITH LTD',
  company_number: '15934640',
  vat_number: '499197417',
  address: '71-75 Shelton Street, London, England, WC2H 9JQ',
  domain: 'createwith.com',
};

const BANK = {
  bank: 'Monzo',
  accountName: 'CREATE WITH LTD',
  sortCode: '04-00-03',
  accountNumber: '94728077',
  iban: 'GB93 MONZ 0400 0394 7280 77',
  swift: 'MONZGB2L',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return handleOptions();
    if (request.method !== 'POST') return withCors(new Response('Method not allowed', { status: 405 }));

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return withCors(new Response('Invalid JSON body', { status: 400 }));
    }

    const data = normalizePayload(payload);

    try {
      const html = invoiceTemplate(data);
      const pdf = await renderPdf(html, env);
      const fileName = `invoice-${sanitizeFilename(data.invoice_number || 'draft')}.pdf`;
      return withCors(new Response(pdf, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${fileName}"`,
        },
      }));
    } catch (err) {
      console.error('invoice_render_error', err);
      return withCors(new Response('Failed to generate invoice', { status: 500 }));
    }
  },
};

function withCors(response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

function handleOptions() {
  return withCors(new Response(null, { status: 204 }));
}

function normalizePayload(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const currency = payload.currency || 'GBP';
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.qty) || 0;
    const unit = Number(item.unit_price ?? item.unitPrice) || 0;
    return sum + qty * unit;
  }, 0);

  const totals = {
    subtotal,
    tax: payload.totals?.tax ?? payload.tax ?? 0,
    discount: payload.totals?.discount ?? 0,
    paid: payload.totals?.paid ?? 0,
  };
  const balance_due = payload.totals?.balance_due ?? payload.totals?.balanceDue ?? (totals.subtotal + totals.tax - totals.discount - totals.paid);
  totals.balance_due = balance_due;

  const company = {
    ...COMPANY,
    logo_url: sanitizeUrl(payload.company?.logo_url || payload.company?.logoUrl) || BRAND.logo,
    brand_color: payload.company?.brand_color || payload.company?.brandColor || BRAND.color,
    email: payload.company?.email || `accounts@${COMPANY.domain}`,
    website: payload.company?.website || `https://${COMPANY.domain}`,
  };

  const show_bank_details = payload.show_bank_details !== undefined ? !!payload.show_bank_details
    : payload.showBankDetails !== undefined ? !!payload.showBankDetails
    : true;

  const payment = {
    ...BANK,
    ...snakeifyPayment(payload.payment),
  };

  return {
    invoice_number: payload.invoice_number || payload.invoiceNumber || 'DRAFT',
    issue_date: payload.issue_date || payload.issueDate || '',
    due_date: payload.due_date || payload.dueDate || '',
    currency,
    company,
    bill_to: payload.bill_to || payload.billTo || {},
    items: items.map(toSnakeItem),
    totals,
    notes: payload.notes || '',
    payment,
    show_bank_details,
    qr_image: sanitizeUrl(payload.payment?.qr_image || payload.payment?.qrImage),
  };
}

function toSnakeItem(item) {
  return {
    description: item.description,
    qty: item.qty,
    unit_price: item.unit_price ?? item.unitPrice,
  };
}

function snakeifyPayment(payment = {}) {
  if (!payment) return {};
  return {
    bank: payment.bank,
    account_name: payment.account_name ?? payment.accountName,
    sort_code: payment.sort_code ?? payment.sortCode,
    account_number: payment.account_number ?? payment.accountNumber,
    iban: payment.iban,
    swift: payment.swift,
    qr_image: sanitizeUrl(payment.qr_image || payment.qrImage),
  };
}

function sanitizeUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (err) {
    return '';
  }
}

function sanitizeFilename(value) {
  return value.replace(/[^a-z0-9_\-\.]/gi, '_');
}

function invoiceTemplate(data) {
  const {
    invoice_number,
    issue_date,
    due_date,
    currency,
    company,
    bill_to,
    items,
    totals,
    notes,
    payment,
    show_bank_details,
    qr_image,
  } = data;

  const fmt = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(v || 0);

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8" />
  <title>Invoice ${invoice_number}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --brand: ${company.brand_color};
      --ink-900: #0f172a; --ink-800: #0f172a; --ink-700: #1e293b; --ink-500: #475569; --border: #e2e8f0; --muted: #f8fafc;
      --pill: #ede9fe; --shadow: 0 16px 40px rgba(17, 24, 39, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--muted); font-family: ${BRAND.fontFamily}; color: var(--ink-800); }
    @page { size: A4 portrait; margin: 18mm 16mm 20mm 16mm; }
    .sheet { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 26px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
    .top-bar { height: 6px; width: 100%; background: linear-gradient(90deg, var(--brand), #5d4aa0, #b6acd9); border-radius: 10px; margin-bottom: 18px; }
    header { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 18px; }
    .logo-block { display: flex; flex-direction: column; gap: 10px; }
    .logo { height: 52px; width: auto; max-width: 200px; object-fit: contain; object-position: left center; }
    .meta { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(60,41,109,0.1); color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; border: 1px solid rgba(60,41,109,0.22); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4); }
    h1 { margin: 8px 0 0; font-size: 22px; color: var(--ink-900); }
    .meta table { font-size: 13px; color: var(--ink-600); width: 100%; border-collapse: collapse; }
    .meta td { padding: 3px 0 2px 12px; }
    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin: 22px 0 10px; padding: 16px; background: #f9fafb; border: 1px solid var(--border); border-radius: 12px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-500); margin-bottom: 4px; }
    .value { font-size: 13px; color: var(--ink-800); line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; color: var(--ink-500); padding: 10px 0 8px; border-bottom: 2px solid var(--brand); background: rgba(60,41,109,0.04); }
    tbody td { padding: 10px 0; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--ink-700); }
    tbody tr:last-child td { border-bottom: none; }
    .qty, .price, .total { text-align: right; }
    .totals { margin-top: 18px; margin-left: auto; max-width: 320px; border-top: 2px solid var(--brand); padding-top: 12px; }
    .total-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
    .grand { font-weight: 700; font-size: 15px; color: var(--brand); }
    .notes { margin-top: 14px; padding: 12px 14px; background: rgba(60,41,109,0.06); border: 1px solid rgba(60,41,109,0.15); border-radius: 12px; color: var(--ink-700); font-size: 13px; }
    .pay { margin-top: 10px; font-size: 13px; color: var(--ink-700); line-height: 1.4; }
    .qr { margin-top: 8px; height: 86px; }
    @media (max-width: 720px) { header { grid-template-columns: 1fr; } .meta { text-align: left; align-items: flex-start; } }
  </style>
</head><body>
  <main class="sheet">
    <div class="top-bar"></div>
    <header>
      <div class="logo-block">
        <img class="logo" src="${company.logo_url}" alt="Create With logo" />
        <h1>Invoice ${invoice_number}</h1>
      </div>
      <div class="meta">
        <div class="pill">Invoice</div>
        <table>
          <tr><td>Issue date:</td><td>${issue_date}</td></tr>
          <tr><td>Due date:</td><td>${due_date}</td></tr>
          <tr><td>Company:</td><td>${company.name}</td></tr>
          <tr><td>Company No:</td><td>${company.company_number}</td></tr>
          <tr><td>VAT:</td><td>${company.vat_number}</td></tr>
        </table>
      </div>
    </header>

    <section class="columns">
      <div>
        <div class="label">From</div>
        <div class="value">${company.name}<br/>${company.address}<br/>${company.email}<br/>${company.website}</div>
      </div>
      <div>
        <div class="label">Bill To</div>
        <div class="value">${bill_to?.name || ''}<br/>${bill_to?.company || ''}<br/>${bill_to?.address || ''}<br/>${bill_to?.email || ''}</div>
      </div>
    </section>

    <table>
      <thead><tr><th>Description</th><th class="qty">Qty</th><th class="price">Unit</th><th class="total">Line Total</th></tr></thead>
      <tbody>
        ${items.map(item => `
          <tr style="page-break-inside: avoid;">
            <td>${item.description || ''}</td>
            <td class="qty">${item.qty ?? ''}</td>
            <td class="price">${fmt(item.unit_price)}</td>
            <td class="total">${fmt((Number(item.qty) || 0) * (Number(item.unit_price) || 0))}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>${fmt(totals.subtotal)}</span></div>
      ${totals.tax ? `<div class="total-row"><span>Tax</span><span>${fmt(totals.tax)}</span></div>` : ''}
      ${totals.discount ? `<div class="total-row"><span>Discount</span><span>-${fmt(totals.discount)}</span></div>` : ''}
      ${totals.paid ? `<div class="total-row"><span>Paid</span><span>${fmt(totals.paid)}</span></div>` : ''}
      <div class="total-row grand"><span>Balance Due</span><span>${fmt(totals.balance_due)}</span></div>
    </div>

    ${notes ? `<div class="notes">${notes}</div>` : ''}
    ${(show_bank_details && payment) ? `<div class="pay">
      <strong>Payment details</strong><br/>
      Bank: ${payment.bank || ''}<br/>
      Account: ${payment.account_name || ''} · ${payment.sort_code || ''} · ${payment.account_number || ''}<br/>
      IBAN: ${payment.iban || ''} · SWIFT: ${payment.swift || ''}
      ${qr_image ? `<div><img class="qr" src="${qr_image}" alt="Payment QR"/></div>` : ''}
    </div>` : ''}
  </main></body></html>`;
}

async function renderPdf(html, env) {
  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
  });
  await browser.close();
  return pdf;
}
