# Duplicate Contact Check API

This API checks duplicate contacts in GoHighLevel (GHL) by phone/email and business-address criteria, then returns status values:
- `duplicate`
- `unique`
- `null`

`POST /api/check-duplicate` remains as a legacy-compatible endpoint.

## Project Structure

```text
├── index.js
├── api/
│   ├── check-duplicate.js
│   └── get-all-contacts.js
├── routes/
│   └── contacts.routes.js
├── controllers/
│   └── contacts.controller.js
├── services/
│   └── ghl-contacts.service.js
├── validations/
│   └── contacts.validation.js
├── middleware/
│   └── auth.middleware.js
├── utils/
│   └── address.js
├── package.json
```

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Run locally

```bash
pnpm start
pnpm dev
```

Default local server: `http://localhost:8000`

## Environment Variables

At least one access key source is required for duplicate endpoint auth.

```bash
API_SECRET_KEY=your_default_access_key
# Optional fallback if API_SECRET_KEY is not set
ACCESS_KEY=your_default_access_key

# Optional multi-tenant mapping by locationId
# Example: {"loc_1":"tenant_key_1","loc_2":"tenant_key_2"}
ACCESS_KEY_MAP_JSON={"loc_1":"tenant_key_1"}

# Optional override for GHL base URL (default already set in code)
GHL_BASE_URL=https://services.leadconnectorhq.com
```

## API Reference

### Unified Header Contract (Recommended)

All duplicate-check flows now use this header contract:

| Header | Required | Description |
|---|---|---|
| `x-api-key` | Yes | Your app access key, validated server-side |
| `x-location-id` | Yes | GHL location/sub-account ID |
| `x-ghl-api-key` | Yes | GHL API token used for downstream GHL calls |
| `Content-Type` | Yes | `application/json` |

Legacy compatibility note:
- `/api/check-duplicate` still works with the same path and response style.
- `/api/v1/contacts/check-duplicate-business` and `/api/v1/contacts/check-duplicate-contact` use the same header contract above.

### Endpoint

`POST /api/check-duplicate`

### Headers

| Header | Required | Description |
|---|---|---|
| `x-api-key` | Yes | Your custom key, validated against `API_SECRET_KEY` in `.env` |
| `x-ghl-api-key` | Yes | GHL API token used for downstream GHL API calls |
| `x-location-id` | Yes | GHL location/sub-account ID |
| `Content-Type` | Yes | `application/json` |

### Request Body

```json
{
  "id": "contact_123",
  "phone": "+1234567890",
  "email": "john@example.com"
}
```

| Field | Required | Description |
|---|---|---|
| `id` | No | Current contact ID (used to detect self-match) |
| `phone` | Conditionally required | Phone to check for duplicate |
| `email` | Conditionally required | Email to check for duplicate |

Validation rule: at least one of `phone` or `email` must be provided.

### Success Response

If both `phone` and `email` are sent:

```json
{
  "status": "duplicate",
  "phoneStatus": "unique",
  "emailStatus": "duplicate"
}
```

If only one field is sent, only that field status is returned:

```json
{
  "status": "null",
  "phoneStatus": "null"
}
```

Field-level status rules (`phoneStatus`, `emailStatus`):
- `null`: no contact found for that field
- `unique`: found contact matches the same `id` (self)
- `duplicate`: found contact belongs to a different `id`

Top-level `status` rules:
- `duplicate`: any provided field is duplicate
- `unique`: no duplicates and at least one provided field is unique
- `null`: all provided fields are null

### Error Responses

| Status | Message |
|---|---|
| `400` | Missing required headers: x-location-id and x-ghl-api-key |
| `401` | Unauthorized: invalid x-api-key |
| `405` | Method not allowed |
| `502` | Failed to fetch contacts from GHL |
| `502` | Network error while contacting GHL API |

## Notes on GHL API Usage

Duplicate checks are performed using GHL duplicate-search endpoint:
- `GET https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=...&number=...`
- `GET https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=...&email=...`

`GET /contacts/:contactId` returns a specific contact and is not sufficient for duplicate discovery by phone/email.

---

## API v1: Duplicate Business Check

### Endpoint

`POST /api/v1/contacts/check-duplicate-business`

### Request Body

```json
{
  "businessName": "string",
  "address1": "string",
  "city": "string",
  "state": "string",
  "country": "string",
  "id": "string"
}
```

| Field | Required | Description |
|---|---|---|
| `businessName` | Conditionally required | Business company name (exact match) |
| `address1` | Conditionally required | Address line 1 (exact match) |
| `city` | Conditionally required | City (exact match) |
| `state` | Conditionally required | State (exact match) |
| `country` | Conditionally required | Country (exact match) |
| `id` | No | Current contact ID to exclude from duplicate matches |

Validation rule:
- if `businessName` or any address field (`address1`, `city`, `state`, `country`) is missing/empty, response is exactly:

```json
{
  "status": "null"
}
```

### Response Formats

Duplicate:

```json
{
  "status": "duplicate",
  "count": 2,
  "matches": [
    {
      "id": "contact_1",
      "companyName": "ABC LLC",
      "address1": "123 Main",
      "city": "Austin",
      "state": "TX",
      "country": "US"
    }
  ]
}
```

Unique:

```json
{
  "status": "unique",
  "count": 0,
  "matches": []
}
```

Null:

```json
{
  "status": "null"
}
```

### GHL Integration Details

The endpoint calls:
- `POST https://services.leadconnectorhq.com/contacts/search`

With headers:
- `Authorization: Bearer {apiKey}`
- `Version: 2021-07-28`

Exact-match filter fields:
- `companyName == businessName`
- `address1 == address1`
- `city == city`
- `state == state`
- `country == country`

If `id` is provided, that contact is excluded from result matching before final status calculation.

### Quick Test Commands

Null case:

```bash
curl -s -X POST http://localhost:8000/api/v1/contacts/check-duplicate-business \
  -H 'x-api-key: tenant_key_1' \
  -H 'x-location-id: loc_1' \
  -H 'x-ghl-api-key: ghl' \
  -H 'Content-Type: application/json' \
  -d '{"businessName":"","address1":"","city":"","state":"","country":""}'
```

Valid payload example:

```bash
curl -s -X POST http://localhost:8000/api/v1/contacts/check-duplicate-business \
  -H 'x-api-key: tenant_key_1' \
  -H 'x-location-id: loc_1' \
  -H 'x-ghl-api-key: ghl' \
  -H 'Content-Type: application/json' \
  -d '{"businessName":"ABC LLC","address1":"123 Main","city":"Austin","state":"TX","country":"US","id":"contact_123"}'
```

---

## API v1: Duplicate Phone/Email (Business-style Algorithm)

### Endpoint

`POST /api/v1/contacts/check-duplicate-contact`

### Request Body

```json
{
  "phone": "+1234567890",
  "email": "john@example.com",
  "id": "contact_123"
}
```

| Field | Required | Description |
|---|---|---|
| `phone` | Conditionally required | Phone number to check for duplicate |
| `email` | Conditionally required | Email to check for duplicate |
| `id` | No | Current contact ID to exclude self-match |

Validation rule:
- If both `phone` and `email` are missing/empty, response is:

```json
{
  "status": "null",
  "count": 0,
  "matches": []
}
```

### Algorithm (AND logic)

1. Field-level status is calculated separately:
- `phoneStatus`: `duplicate` or `unique` or `null`
- `emailStatus`: `duplicate` or `unique` or `null`
2. Top-level `status` follows AND rule:
- `duplicate` only when all provided fields are `duplicate`
- `null` when all provided fields are `null`
- otherwise `unique`

### Response Example

```json
{
  "status": "unique",
  "count": 0,
  "matches": [],
  "phoneStatus": "duplicate",
  "emailStatus": "null"
}
```

### Quick Test Command

```bash
curl -s -X POST http://localhost:8000/api/v1/contacts/check-duplicate-contact \
  -H 'x-api-key: tenant_key_1' \
  -H 'x-location-id: loc_1' \
  -H 'x-ghl-api-key: ghl' \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+1234567890","email":"john@example.com","id":"contact_123"}'
```
