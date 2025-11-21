# Create With Invoices Worker

Cloudflare Worker that renders Create With invoices as PDFs using the Browser Rendering API (@cloudflare/puppeteer) and a simple `/invoice` POST endpoint.

## Quick start
1) Install deps: `npm install`
2) Configure Cloudflare credentials (API token with Workers + Browser Rendering) and ensure a Browser binding named `BROWSER` exists on account `1cec23b3da967c4a89800769b5cfa94a`.
3) Deploy: `npx wrangler deploy --config wrangler.toml`

Live endpoint (current deployment): `https://cw-invoices.userloop.workers.dev/invoice`

## Request format
Send a POST with JSON; required fields are the line items and an invoice number. Company data defaults to Create With Ltd and is already embedded.

```json
{
  "invoiceNumber": "INV-2024-012",
  "issueDate": "2024-11-22",
  "dueDate": "2024-12-06",
  "currency": "GBP",
  "billTo": {
    "name": "Client Name",
    "company": "Client Co",
    "address": "123 Client St, London",
    "email": "billing@client.com"
  },
  "items": [
    { "description": "Design sprint", "qty": 2, "unitPrice": 2250 },
    { "description": "Hosting (Oct 2024)", "qty": 1, "unitPrice": 180 }
  ],
  "totals": { "tax": 936, "paid": 0 },
  "notes": "Please pay within 14 days. Thank you.",
  "showBankDetails": true
}
```

### Optional fields
- `payment`: override bank details or supply `qrImage`
- `showBankDetails`: set to `false` to hide the bank block
- `company.logoUrl`, `company.brandColor`: override branding if ever needed

## Example curl
```bash
curl -X POST https://cw-invoices.userloop.workers.dev/invoice \
  -H "content-type: application/json" \
  -o invoice.pdf \
  -d '{
    "invoiceNumber": "INV-2024-012",
    "issueDate": "2024-11-22",
    "dueDate": "2024-12-06",
    "currency": "GBP",
    "billTo": {
      "name": "Client Name",
      "company": "Client Co",
      "address": "123 Client St, London",
      "email": "billing@client.com"
    },
    "items": [
      { "description": "Design sprint", "qty": 2, "unitPrice": 2250 },
      { "description": "Hosting (Oct 2024)", "qty": 1, "unitPrice": 180 }
    ],
    "totals": { "tax": 936, "paid": 0 },
    "notes": "Please pay within 14 days. Thank you.",
    "showBankDetails": true
  }'
```

The response is a PDF with `Content-Disposition: attachment; filename="invoice-<number>.pdf"`.
