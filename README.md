# Duplicate Contact Check API

This API checks duplicate contacts in GoHighLevel (GHL) by phone and/or email, then returns status values:
- `duplicate`
- `unique`
- `null`

`POST /api/check-duplicate` supports field-level status and a combined top-level status.

## Project Structure

```text
├── index.js
├── api/
│   └── check-duplicate.js
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

## API Reference

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
| `400` | Missing required field: phone or email |
| `400` | Missing x-location-id header |
| `401` | Unauthorized: invalid x-api-key |
| `401` | Missing x-ghl-api-key header |
| `405` | Method not allowed |
| `502` | Failed to fetch contacts from GHL |
| `502` | Network error while contacting GHL API |

## Notes on GHL API Usage

Duplicate checks are performed using GHL duplicate-search endpoint:
- `GET https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=...&number=...`
- `GET https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=...&email=...`

`GET /contacts/:contactId` returns a specific contact and is not sufficient for duplicate discovery by phone/email.
