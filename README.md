# Create With Invoices Worker

Cloudflare Worker that renders Create With invoices as PDFs using the Browser Rendering API (@cloudflare/puppeteer) and a simple `/invoice` POST endpoint.

## Quick start
1) Install deps: `npm install`
2) Configure Cloudflare credentials (API token with Workers + Browser Rendering) and ensure a Browser binding named `BROWSER` exists on account `1cec23b3da967c4a89800769b5cfa94a`.
3) Deploy: `npx wrangler deploy --config wrangler.toml`

Live endpoint (current deployment): `https://cw-invoices.userloop.workers.dev/invoice`

## Request format
Send a POST with JSON (snake_case). Required fields are the line items and an invoice number. Company data defaults to Create With Ltd and is already embedded.

```json
{
  "invoice_number": "INV-2024-012",
  "issue_date": "2024-11-22",
  "due_date": "2024-12-06",
  "currency": "GBP",
  "bill_to": {
    "name": "Client Name",
    "company": "Client Co",
    "address": "123 Client St, London",
    "email": "billing@client.com"
  },
  "items": [
    { "description": "Design sprint", "qty": 2, "unit_price": 2250 },
    { "description": "Hosting (Oct 2024)", "qty": 1, "unit_price": 180 }
  ],
  "totals": { "tax": 936, "paid": 0 },
  "notes": "Please pay within 14 days. Thank you.",
  "show_bank_details": true
}
```

### Optional fields
- `payment`: override bank details or supply `qr_image` (keys: `bank`, `account_name`, `sort_code`, `account_number`, `iban`, `swift`)
- `show_bank_details`: set to `false` to hide the bank block
- `company.logo_url`, `company.brand_color`: override branding if ever needed

## Example curl
```bash
curl -X POST https://cw-invoices.userloop.workers.dev/invoice \
  -H "content-type: application/json" \
  -o invoice.pdf \
  -d '{
    "invoice_number": "INV-2024-012",
    "issue_date": "2024-11-22",
    "due_date": "2024-12-06",
    "currency": "GBP",
    "bill_to": {
      "name": "Client Name",
      "company": "Client Co",
      "address": "123 Client St, London",
      "email": "billing@client.com"
    },
    "items": [
      { "description": "Design sprint", "qty": 2, "unit_price": 2250 },
      { "description": "Hosting (Oct 2024)", "qty": 1, "unit_price": 180 }
    ],
    "totals": { "tax": 936, "paid": 0 },
    "notes": "Please pay within 14 days. Thank you.",
    "show_bank_details": true
  }'
```

The response is a PDF with `Content-Disposition: attachment; filename="invoice-<number>.pdf"`.
