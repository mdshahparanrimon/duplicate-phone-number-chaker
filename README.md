# Duplicate Contact Check API

A lightweight external API that sits between a **GoHighLevel (GHL) workflow** and GHL's Contacts API. It checks whether a phone number already exists in your CRM and returns a `unique` or `duplicate` result back to the workflow.

---

## How It Works

```
GHL Workflow
    │
    │  POST /api/check-duplicate
    │  Header: x-api-key: <your GHL API key>
    │  Body:   { phone, contactId, locationId }
    ▼
This API (Vercel / local)
    │
    │  Calls GHL Contacts Search API using the key from the header
    ▼
GHL Contacts API
    │
    │  Returns contacts matching that phone number
    ▼
This API
    │
    │  matchCount > 1  →  "duplicate"
    │  matchCount = 1  →  "unique"
    ▼
Response → GHL Workflow branches and tags the contact
```

---

## Project Structure

```
├── index.js                  # Express server entry point
├── api/
│   └── check-duplicate.js    # Route handler
├── package.json
```

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run locally

```bash
pnpm start        # runs on http://localhost:8000
pnpm dev          # auto-restarts on file changes (Node 18+)
```

---

## API Reference

### `POST /api/check-duplicate`

#### Headers

| Header      | Required | Description                        |
|-------------|----------|------------------------------------|
| `x-api-key` | Yes      | Your GHL API key                   |
| `Content-Type` | Yes   | `application/json`                 |

#### Request Body

```json
{
  "phone": "+1234567890",
  "contactId": "abc123",
  "locationId": "xyz456"
}
```

| Field        | Required | Description                          |
|--------------|----------|--------------------------------------|
| `phone`      | Yes      | Phone number to check                |
| `contactId`  | No       | GHL contact ID (echoed in response)  |
| `locationId` | No       | GHL location/sub-account ID          |

#### Response — Unique

```json
{
  "status": "unique",
  "contactId": "abc123",
  "phone": "+1234567890",
  "matchCount": 1
}
```

#### Response — Duplicate

```json
{
  "status": "duplicate",
  "contactId": "abc123",
  "phone": "+1234567890",
  "matchCount": 3
}
```

#### Error Responses

| Status | Message                              | Cause                          |
|--------|--------------------------------------|--------------------------------|
| `400`  | Missing required field: phone        | `phone` not in body            |
| `401`  | Missing x-api-key header             | No API key provided            |
| `405`  | Method not allowed                   | Request is not POST            |
| `502`  | Failed to fetch contacts from GHL    | GHL API returned an error      |
| `502`  | Network error while contacting GHL API | Connection failure            |

---

## GHL Workflow Setup

1. Add a **Webhook** action to your workflow (triggered on contact create / phone update).
2. Configure it:
   - **URL:** `https://your-vercel-app.vercel.app/api/check-duplicate`
   - **Method:** `POST`
   - **Headers:**
     ```
     x-api-key: your_ghl_api_key
     Content-Type: application/json
     ```
   - **Body:**
     ```json
     {
       "phone": "{{contact.phone}}",
       "contactId": "{{contact.id}}",
       "locationId": "{{location.id}}"
     }
     ```
3. Add an **If/Else** branch on `status == "duplicate"` to tag the contact accordingly.

---

## Deploy to Vercel

```bash
vercel deploy
```

No environment variables are required — the GHL API key is passed per-request via the `x-api-key` header.
