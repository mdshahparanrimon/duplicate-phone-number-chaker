# Duplicate Check API (GHL Webhook Ready)

This service checks duplicate contacts in GoHighLevel (GHL) by:
- phone/email
- business name + full address

Status values:
- `duplicate`
- `unique`
- `null`

`duplicate` responses include duplicate `count`.

## Project Structure

```text
├── index.js
├── api/
│   ├── check-duplicate.js
│   └── get-all-contacts.js
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
├── ghl-route-test-pack.json
├── package.json
```

## Run

```bash
pnpm install
pnpm start
```

Local URL: `http://localhost:8000`

## Environment Variables

```bash
API_SECRET_KEY=your_default_access_key
# Optional fallback if API_SECRET_KEY is not set
ACCESS_KEY=your_default_access_key

# Optional tenant-specific access keys by locationId
# Example: {"loc_1":"tenant_key_1","loc_2":"tenant_key_2"}
ACCESS_KEY_MAP_JSON={"loc_1":"tenant_key_1"}

# Optional override
GHL_BASE_URL=https://services.leadconnectorhq.com
```

## Required Headers For Every URL

| Header | Required | Description |
|---|---|---|
| `x-api-key` | Yes | Your app access key |
| `x-location-id` | Yes | GHL sub-account/location ID |
| `x-ghl-api-key` | Yes | GHL API token |
| `Content-Type` | Yes | `application/json` |

## Endpoints

### 1) Duplicate Contact (Primary)

`POST /api/check-duplicate`

Request body:

```json
{
  "phone": "+1234567890",
  "email": "john@example.com",
  "id": "contact_123"
}
```

Rules:
- At least one of `phone` or `email` is required
- If both missing: `status = null`
- If any provided field has duplicate: `status = duplicate`
- Otherwise: `status = unique`
- `id` is excluded (self-match filtering)

Response shape:

```json
{
  "status": "duplicate",
  "count": 1,
  "phoneStatus": "duplicate",
  "emailStatus": "unique"
}
```

### 2) Duplicate Contact (Secondary URL)

`POST /api/check-duplicate-contact`

Same behavior, headers, and body as `/api/check-duplicate`.

### 3) Duplicate Business

`POST /api/check-duplicate-business`

Request body:

```json
{
  "businessName": "ABC LLC",
  "full_address": "19671 Beach Blvd., Suite 103, Huntington Beach, CA, 92648, US",
  "streetaddress": "123 Main",
  "city": "Austin",
  "country": "US",
  "postalCode": "92648",
  "id": "contact_123"
}
```

Rules:
- `businessNameStatus` is checked only when `businessName` is provided.
- Address side checks run when any of these are present: `full_address`, `streetaddress`/`address`/`address1`, or `city`.
- `streetAddressStatus` is checked only when street address is available in the request.
- `cityStatus` is checked only when city is available in the request.
- If a field is not requested, its status returns `null`.
- `addressStatus` is derived from street + city statuses and is `duplicate` only when both `streetAddressStatus` and `cityStatus` are `duplicate`; otherwise `unique` (or `null` when address side is not requested).
- Top-level `status` rules:
  - If any checked side is duplicate: `status = duplicate`
  - If all provided checks are unique: `status = unique`
  - If no businessName and no address-side input are provided: `status = null`
- Exact match fields:
  - `companyName == businessName`
  - `streetaddress == address` (normalized)
  - `city == city` (normalized)
- `id` is excluded (self-match filtering)
- `count` is the merged unique duplicate contacts from businessName and/or address checks.
- Address duplicate check scans full contact list and computes street/city duplicate counts separately.
- `address` is returned as an array after `addressStatus`, including `full_address` and `Postal Code` when available.

Response shape:

```json
{
  "status": "duplicate",
  "count": 2,
  "businessNameStatus": "duplicate",
  "addressStatus": "duplicate",
  "streetAddressStatus": "duplicate",
  "cityStatus": "duplicate",
  "streetAddressCount": 2,
  "cityCount": 2,
  "address": [
    {
      "streetaddress": "19671 Beach Blvd., Suite 103",
      "city": "Huntington Beach",
      "country": "US",
      "state": "CA",
      "Postal Code": "92648",
      "full_address": "19671 Beach Blvd., Suite 103, Huntington Beach, CA, 92648, US"
    }
  ]
}
```

### 4) Get All Contacts

`POST /api/get-all-contacts`

Request body:

```json
{
  "page": 1,
  "pageLimit": 50,
  "query": ""
}
```

Response shape:

```json
{
  "status": "success",
  "count": 50,
  "contacts": [],
  "page": 1,
  "pageLimit": 50,
  "total": 120
}
```

## Error Responses

| Status | Meaning |
|---|---|
| `400` | Missing required headers (`x-location-id`, `x-ghl-api-key`) |
| `401` | Invalid `x-api-key` |
| `405` | Method not allowed |
| `502` | GHL request/network failure |

## GHL Webhook Setup

For each webhook action in GHL:
1. Method: `POST`
2. Authorization: `None`
3. URL: one of the endpoint URLs above
4. Headers: add all required headers
5. Body: use endpoint-specific JSON body
6. Check execution response (`status`, `count`)

Use [ghl-route-test-pack.json](ghl-route-test-pack.json) as a ready test template.
