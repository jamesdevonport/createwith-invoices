import puppeteer from '@cloudflare/puppeteer';

const BRAND = {
  color: '#3C296D',
  fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
  logo: 'https://228b0d41a70826a298630413a3775f84.cdn.bubble.io/cdn-cgi/image/w=96,h=52,f=auto,dpr=2,fit=contain/f1740613307556x552233112811189500/Create%20With_%E2%80%A8%20%285%29.png',
};

const COMPANY = {
  name: 'CREATE WITH LTD',
  companyNumber: '15934640',
  vatNumber: '499197417',
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
      const fileName = `invoice-${sanitizeFilename(data.invoiceNumber || 'draft')}.pdf`;
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
    const unit = Number(item.unitPrice) || 0;
    return sum + qty * unit;
  }, 0);

  const totals = {
    subtotal,
    tax: payload.totals?.tax ?? payload.tax ?? 0,
    discount: payload.totals?.discount ?? 0,
    paid: payload.totals?.paid ?? 0,
  };
  const balanceDue = payload.totals?.balanceDue ?? (totals.subtotal + totals.tax - totals.discount - totals.paid);
  totals.balanceDue = balanceDue;

  const company = {
    ...COMPANY,
    logoUrl: sanitizeUrl(payload.company?.logoUrl) || BRAND.logo,
    brandColor: payload.company?.brandColor || BRAND.color,
    email: payload.company?.email || `accounts@${COMPANY.domain}`,
    website: payload.company?.website || `https://${COMPANY.domain}`,
  };

  const showBankDetails = payload.showBankDetails !== undefined ? !!payload.showBankDetails : true;
  const payment = {
    ...BANK,
    ...(payload.payment || {}),
  };

  return {
    invoiceNumber: payload.invoiceNumber || 'DRAFT',
    issueDate: payload.issueDate || '',
    dueDate: payload.dueDate || '',
    currency,
    company,
    billTo: payload.billTo || {},
    items,
    totals,
    notes: payload.notes || '',
    payment,
    showBankDetails,
    qrImage: sanitizeUrl(payload.payment?.qrImage),
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
    invoiceNumber,
    issueDate,
    dueDate,
    currency,
    company,
    billTo,
    items,
    totals,
    notes,
    payment,
    showBankDetails,
    qrImage,
  } = data;

  const fmt = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(v || 0);

  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8" />
  <title>Invoice ${invoiceNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --brand: ${company.brandColor};
      --ink-900: #0f172a; --ink-800: #0f172a; --ink-700: #1e293b; --ink-500: #475569; --border: #e2e8f0; --muted: #f8fafc;
      --pill: #ede9fe; --shadow: 0 16px 40px rgba(17, 24, 39, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at 20% 20%, rgba(60,41,109,0.08), transparent 40%), var(--muted); font-family: ${BRAND.fontFamily}; color: var(--ink-800); }
    @page { size: A4 portrait; margin: 18mm 16mm 20mm 16mm; }
    .sheet { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 32px; box-shadow: var(--shadow); }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .logo-block { display: flex; flex-direction: column; gap: 8px; }
    .logo { height: 52px; }
    .meta { text-align: right; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--pill); color: var(--brand); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
    h1 { margin: 12px 0 4px; font-size: 26px; color: var(--ink-900); }
    .meta table { font-size: 13px; color: var(--ink-500); width: 100%; }
    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 20px; margin: 28px 0 12px; padding: 18px; background: linear-gradient(135deg, rgba(60,41,109,0.06), rgba(60,41,109,0.01)); border: 1px solid var(--border); border-radius: 14px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-500); margin-bottom: 6px; }
    .value { font-size: 14px; color: var(--ink-800); line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; color: var(--ink-500); padding-bottom: 10px; border-bottom: 2px solid var(--brand); }
    tbody td { padding: 12px 0; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--ink-700); }
    tbody tr:last-child td { border-bottom: none; }
    .qty, .price, .total { text-align: right; }
    .totals { margin-top: 26px; margin-left: auto; max-width: 320px; border-top: 2px solid var(--brand); padding-top: 14px; }
    .total-row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }
    .grand { font-weight: 700; font-size: 16px; color: var(--ink-900); }
    .notes { margin-top: 18px; padding: 14px 16px; background: var(--muted); border: 1px dashed var(--border); border-radius: 12px; color: var(--ink-700); }
    .pay { margin-top: 12px; font-size: 13px; color: var(--ink-700); line-height: 1.4; }
    .qr { margin-top: 8px; height: 86px; }
    @media (max-width: 720px) { header { flex-direction: column; align-items: flex-start; } .meta { text-align: left; } }
  </style>
</head><body>
  <main class="sheet">
    <header>
      <div class="logo-block">
        <img class="logo" src="${company.logoUrl}" alt="Create With logo" />
        <div class="pill">Invoice</div>
      </div>
      <div class="meta">
        <h1>Invoice ${invoiceNumber}</h1>
        <table>
          <tr><td>Issue date:</td><td>${issueDate}</td></tr>
          <tr><td>Due date:</td><td>${dueDate}</td></tr>
          <tr><td>Company No:</td><td>${company.companyNumber}</td></tr>
          <tr><td>VAT:</td><td>${company.vatNumber}</td></tr>
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
        <div class="value">${billTo?.name || ''}<br/>${billTo?.company || ''}<br/>${billTo?.address || ''}<br/>${billTo?.email || ''}</div>
      </div>
    </section>

    <table>
      <thead><tr><th>Description</th><th class="qty">Qty</th><th class="price">Unit</th><th class="total">Line Total</th></tr></thead>
      <tbody>
        ${items.map(item => `
          <tr style="page-break-inside: avoid;">
            <td>${item.description || ''}</td>
            <td class="qty">${item.qty ?? ''}</td>
            <td class="price">${fmt(item.unitPrice)}</td>
            <td class="total">${fmt((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>${fmt(totals.subtotal)}</span></div>
      ${totals.tax ? `<div class="total-row"><span>Tax</span><span>${fmt(totals.tax)}</span></div>` : ''}
      ${totals.discount ? `<div class="total-row"><span>Discount</span><span>-${fmt(totals.discount)}</span></div>` : ''}
      ${totals.paid ? `<div class="total-row"><span>Paid</span><span>${fmt(totals.paid)}</span></div>` : ''}
      <div class="total-row grand"><span>Balance Due</span><span>${fmt(totals.balanceDue)}</span></div>
    </div>

    ${notes ? `<div class="notes">${notes}</div>` : ''}
    ${(showBankDetails && payment) ? `<div class="pay">
      <strong>Payment details</strong><br/>
      Bank: ${payment.bank || ''}<br/>
      Account: ${payment.accountName || ''} · ${payment.sortCode || ''} · ${payment.accountNumber || ''}<br/>
      IBAN: ${payment.iban || ''} · SWIFT: ${payment.swift || ''}
      ${qrImage ? `<div><img class="qr" src="${qrImage}" alt="Payment QR"/></div>` : ''}
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
