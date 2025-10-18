# Flovo Backend API Documentation for Frontend Developers

## 🚀 Base Configuration

- **Base URL**: `http://localhost:4000/api/v1` (development)
- **API Version**: v1 (URI versioning)
- **Content-Type**: `application/json` (except file uploads)
- **Authentication**: JWT Bearer Token
- **Swagger Documentation**: `http://localhost:4000/docs`

## 🔐 Authentication

### Authentication Flow
1. **Register/Login** → Get `accessToken` and `refreshToken`
2. **Include Bearer Token** in Authorization header for protected endpoints
3. **Refresh Token** when access token expires
4. **Logout** to invalidate refresh token

### Headers Required
```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 📋 API Endpoints Overview

### 🔑 Authentication Endpoints (`/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | ❌ |
| POST | `/auth/login` | Login user | ❌ |
| POST | `/auth/refresh` | Refresh tokens | ❌ |
| POST | `/auth/logout` | Logout user | ✅ |
| GET | `/auth/me` | Get current user info | ✅ |
| POST | `/auth/forgot-password` | Request password reset | ❌ |
| POST | `/auth/reset-password` | Reset password | ❌ |
| GET | `/auth/google` | Google OAuth login | ❌ |
| GET | `/auth/google/redirect` | Google OAuth callback | ❌ |

### 🤖 Bot Management (`/bots`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/bots` | Create new bot | ✅ |
| GET | `/bots` | Get all bots (paginated) | ✅ |
| GET | `/bots/:id` | Get bot details | ✅ |
| PATCH | `/bots/:id` | Update bot | ✅ |
| DELETE | `/bots/:id` | Delete bot | ✅ |
| POST | `/bots/:id/start` | Start bot (set webhook) | ✅ |
| POST | `/bots/:id/stop` | Stop bot (delete webhook) | ✅ |

### 📺 Channel Management (`/channels`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/channels` | Add Telegram channel | ✅ |
| GET | `/channels` | Get all channels (paginated) | ✅ |
| GET | `/channels/:id` | Get channel by ID | ✅ |
| PATCH | `/channels/:id` | Update channel | ✅ |
| DELETE | `/channels/:id` | Delete channel | ✅ |

### 👥 Customer Management (`/customers`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/customers` | Get all customers (paginated) | ✅ |
| GET | `/customers/:id` | Get customer details | ✅ |

### 📁 File Management (`/files`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/files/upload` | Upload single file | ✅ |
| POST | `/files/upload-many` | Upload multiple files | ✅ |
| GET | `/files/recent` | Get recent files (paginated) | ✅ |
| DELETE | `/files/delete-many` | Delete multiple files | ✅ |
| DELETE | `/files/:id` | Delete file by ID | ✅ |
| DELETE | `/files/by-key/:key` | Delete file by key/path | ✅ |

### 🎯 Onboarding Progress (`/onboarding-progress`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/onboarding-progress/current-step` | Get current step | ✅ |
| GET | `/onboarding-progress/steps` | Get all steps | ✅ |
| GET | `/onboarding-progress/progress` | Get full progress | ✅ |
| PATCH | `/onboarding-progress/next-step` | Update to next step | ✅ |

### 🏢 Organization Management (`/organizations`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/organizations` | Create organization | ✅ |
| GET | `/organizations` | Get user's organization | ✅ |
| GET | `/organizations/:id` | Get organization details | ✅ |
| PATCH | `/organizations/:id` | Update organization | ✅ |
| DELETE | `/organizations/:id` | Delete organization | ✅ |

### 📦 Order Management (`/orders`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/orders` | Get all orders (paginated) | ✅ |
| GET | `/orders/:id` | Get order details | ✅ |
| PATCH | `/orders/:id/status` | Update order status | ✅ |
| DELETE | `/orders/:id` | Delete order | ✅ |

### 📝 Post Management (`/posts`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/posts` | Create post | ✅ |
| GET | `/posts` | Get all posts (paginated) | ✅ |
| GET | `/posts/:id` | Get post details | ✅ |
| PATCH | `/posts/:id` | Update post | ✅ |
| DELETE | `/posts/:id` | Delete post | ✅ |
| POST | `/posts/:id/schedule` | Schedule post | ✅ |

### 🛍️ Product Management (`/products`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/products` | Create product | ✅ |
| GET | `/products` | Get all products (paginated) | ✅ |
| GET | `/products/:id` | Get product details | ✅ |
| PATCH | `/products/:id` | Update product | ✅ |
| DELETE | `/products/:id` | Delete product | ✅ |
| DELETE | `/products/bulk-delete` | Delete multiple products | ✅ |

### 🏗️ Product Schema (`/product-schema`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/product-schema` | Create schema | ✅ |
| GET | `/product-schema` | Get organization schema | ✅ |
| PATCH | `/product-schema/:id` | Update schema | ✅ |
| DELETE | `/product-schema/:id` | Delete schema | ✅ |
| POST | `/product-schema/:id/fields` | Add field to schema | ✅ |
| PATCH | `/product-schema/:id/fields/reorder` | Reorder fields | ✅ |
| PATCH | `/product-schema/:id/fields/:fieldId` | Update field | ✅ |
| DELETE | `/product-schema/:id/fields/:fieldId` | Delete field | ✅ |

### 🔗 Webhook (`/webhook`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/webhook/:botId/:organizationId` | Telegram webhook handler | ❌ |

---

## 📊 Common Query Parameters

Most list endpoints support these query parameters:

```typescript
interface PaginationQuery {
  page?: number;        // Page number (1-based), default: 1
  limit?: number;       // Items per page (max 100), default: 20
  search?: string;      // Search term for filtering
  order?: 'asc' | 'desc'; // Sort order, default: 'desc'
}
```

---

## 🔐 Authentication Details

### Register Request
```typescript
POST /auth/register
Content-Type: application/json

{
  "firstName": "John",        // Optional
  "lastName": "Doe",          // Optional
  "email": "john@example.com", // Required
  "password": "StrongPass123" // Required, min 8 chars
}
```

### Register Response
```typescript
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login Request
```typescript
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "StrongPass123"
}
```

### Login Response
```typescript
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Refresh Token Request
```typescript
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User Response
```typescript
GET /auth/me
Authorization: Bearer <access_token>

{
  "userId": 123
}
```

---

## 🤖 Bot Management Details

### Create Bot Request
```typescript
POST /bots
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "token": "8189802940:AAGAu-_rFoJEGYJZSdCfWhNRHxtybKCyd3A"
}
```

### Bot Response
```typescript
{
  "id": 1,
  "token": "8189802940:AAGAu-_rFoJEGYJZSdCfWhNRHxtybKCyd3A",
  "isEnabled": false,
  "organizationId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Start/Stop Bot Response
```typescript
{
  "ok": true,
  "description": "Webhook was set"
}
```

---

## 📺 Channel Management Details

### Create Channel Request
```typescript
POST /channels
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "username": "@mychannel",
  "title": "My Channel",
  "description": "Channel description" // Optional
}
```

### Channel Response
```typescript
{
  "id": 1,
  "username": "@mychannel",
  "title": "My Channel",
  "description": "Channel description",
  "organizationId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

## 📁 File Management Details

### Upload Single File
```typescript
POST /files/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

FormData:
- file: File (required)
```

### Upload Multiple Files
```typescript
POST /files/upload-many
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

FormData:
- files: File[] (max 10 files)
```

### File Upload Response
```typescript
{
  "id": 1,
  "filename": "document.pdf",
  "originalName": "My Document.pdf",
  "mimetype": "application/pdf",
  "size": 1024000,
  "key": "public/uploads/abc123.pdf",
  "url": "http://localhost:4000/public/uploads/abc123.pdf",
  "organizationId": 1,
  "uploadedBy": 123,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Delete Multiple Files Request
```typescript
DELETE /files/delete-many
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "fileIds": [1, 2, 3]
}
```

---

## 🎯 Onboarding Progress Details

### Current Step Response
```typescript
GET /onboarding-progress/current-step
Authorization: Bearer <access_token>

{
  "step": "SELECT_CATEGORY" // SELECT_CATEGORY | CONFIGURE_SCHEMA | ADD_FIRST_PRODUCT | CONNECT_BOT
}
```

### All Steps Response
```typescript
GET /onboarding-progress/steps
Authorization: Bearer <access_token>

{
  "steps": [
    "SELECT_CATEGORY",
    "CONFIGURE_SCHEMA", 
    "ADD_FIRST_PRODUCT",
    "CONNECT_BOT"
  ]
}
```

### Full Progress Response
```typescript
GET /onboarding-progress/progress
Authorization: Bearer <access_token>

{
  "id": 1,
  "organizationId": 1,
  "percentage": 40,
  "isCategorySelected": true,
  "isSchemaConfigured": false,
  "isFirstProductAdded": false,
  "isBotConnected": false,
  "nextStep": "CONFIGURE_SCHEMA",
  "status": "INCOMPLETE" // INCOMPLETE | COMPLETED
}
```

### Update Next Step Request
```typescript
PATCH /onboarding-progress/next-step
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "step": "CONFIGURE_SCHEMA"
}
```

---

## 🏢 Organization Management Details

### Create Organization Request
```typescript
POST /organizations
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "My Company",
  "description": "Company description", // Optional
  "category": "ELECTRONICS" // FASHION | ELECTRONICS | COSMETICS | SERVICES | FOOD | BOOKS | HOME | SPORTS | AUTOMOTIVE | OTHER
}
```

### Organization Response
```typescript
{
  "id": 1,
  "name": "My Company",
  "description": "Company description",
  "category": "ELECTRONICS",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

## 📦 Order Management Details

### Create Order Request
```typescript
POST /orders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "customerId": 1, // Optional
  "status": "NEW", // NEW | PENDING | CONFIRMED | SHIPPED | DELIVERED | CANCELLED
  "details": {
    "customerName": "John Doe",
    "phoneNumber": "+998901234567",
    "location": "Tashkent, Chilonzor",
    "items": ["iPhone 15 Pro", "Samsung Galaxy S24"],
    "notes": "Delivery to office"
  },
  "quantity": 2,
  "totalPrice": 1500.5,
  "productIds": [1, 2, 3] // Optional
}
```

### Order Response
```typescript
{
  "id": 1,
  "customerId": 1,
  "status": "NEW",
  "details": {
    "customerName": "John Doe",
    "phoneNumber": "+998901234567",
    "location": "Tashkent, Chilonzor",
    "items": ["iPhone 15 Pro", "Samsung Galaxy S24"],
    "notes": "Delivery to office"
  },
  "quantity": 2,
  "totalPrice": 1500.5,
  "organizationId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Update Order Status Request
```typescript
PATCH /orders/:id/status
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "status": "CONFIRMED"
}
```

---

## 📝 Post Management Details

### Create Post Request
```typescript
POST /posts
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "productId": 1,
  "channelId": 1,
  "content": "Check out this amazing product!",
  "status": "DRAFT", // DRAFT | SCHEDULED | PUBLISHED | FAILED
  "scheduledAt": "2024-01-01T12:00:00.000Z" // Optional, ISO format
}
```

### Post Response
```typescript
{
  "id": 1,
  "productId": 1,
  "channelId": 1,
  "content": "Check out this amazing product!",
  "status": "DRAFT",
  "scheduledAt": "2024-01-01T12:00:00.000Z",
  "organizationId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Schedule Post Request
```typescript
POST /posts/:id/schedule
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "scheduledAt": "2024-01-01T12:00:00.000Z"
}
```

---

## 🛍️ Product Management Details

### Create Product Request
```typescript
POST /products
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Premium Laptop",
  "price": 1299.99,
  "images": [1, 2, 3], // Array of file IDs
  "fields": [
    {
      "fieldId": 1,
      "value": "Intel i7"
    },
    {
      "fieldId": 2,
      "value": 16
    },
    {
      "fieldId": 3,
      "value": true
    }
  ]
}
```

### Product Response
```typescript
{
  "id": 1,
  "name": "Premium Laptop",
  "price": 1299.99,
  "quantity": 1,
  "schemaId": 1,
  "organizationId": 1,
  "images": [
    {
      "id": 1,
      "filename": "laptop1.jpg",
      "url": "http://localhost:4000/public/uploads/laptop1.jpg"
    }
  ],
  "fields": [
    {
      "id": 1,
      "fieldId": 1,
      "value": "Intel i7"
    }
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Bulk Delete Products Request
```typescript
DELETE /products/bulk-delete
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "productIds": [1, 2, 3]
}
```

---

## 🏗️ Product Schema Management Details

### Create Schema Request
```typescript
POST /product-schema
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Electronics Schema",
  "description": "Schema for electronic products"
}
```

### Schema Response
```typescript
{
  "id": 1,
  "name": "Electronics Schema",
  "description": "Schema for electronic products",
  "organizationId": 1,
  "fields": [
    {
      "id": 1,
      "name": "Processor",
      "type": "TEXT",
      "isRequired": true,
      "order": 1
    }
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Add Field Request
```typescript
POST /product-schema/:id/fields
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "RAM",
  "type": "NUMBER", // TEXT | NUMBER | BOOLEAN | DATE | JSON
  "isRequired": false,
  "order": 2
}
```

### Reorder Fields Request
```typescript
PATCH /product-schema/:id/fields/reorder
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "fieldOrders": [
    { "fieldId": 1, "order": 2 },
    { "fieldId": 2, "order": 1 }
  ]
}
```

---

## 📊 Pagination Response Format

All paginated endpoints return this format:

```typescript
{
  "data": [...], // Array of items
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## ❌ Error Response Format

All error responses follow this format:

```typescript
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/products"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `204` - No Content (for delete operations)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resources)
- `500` - Internal Server Error

---

## 🔧 Frontend Integration Tips

### 1. Token Management
```typescript
// Store tokens securely
localStorage.setItem('accessToken', response.accessToken);
localStorage.setItem('refreshToken', response.refreshToken);

// Include in requests
const token = localStorage.getItem('accessToken');
fetch('/api/v1/products', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### 2. Error Handling
```typescript
try {
  const response = await fetch('/api/v1/products');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  return await response.json();
} catch (error) {
  console.error('API Error:', error.message);
  // Handle error appropriately
}
```

### 3. File Upload
```typescript
const formData = new FormData();
formData.append('file', file);

const response = await fetch('/api/v1/files/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### 4. Pagination Implementation
```typescript
const fetchProducts = async (page = 1, limit = 20, search = '') => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search })
  });
  
  const response = await fetch(`/api/v1/products?${params}`);
  return await response.json();
};
```

---

## 🚀 Getting Started

1. **Start the backend server**:
   ```bash
   npm run start:dev
   ```

2. **Access Swagger documentation**:
   - Visit `http://localhost:4000/docs`
   - Use "Authorize" button to add Bearer token
   - Test endpoints directly from the UI

3. **Test authentication**:
   ```bash
   # Register
   curl -X POST http://localhost:4000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   
   # Login
   curl -X POST http://localhost:4000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

4. **Use the access token**:
   ```bash
   curl -X GET http://localhost:4000/api/v1/auth/me \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

---

## 📝 Notes for Frontend Developers

- **All protected endpoints require JWT Bearer token authentication**
- **File uploads use `multipart/form-data`, not `application/json`**
- **Pagination is consistent across all list endpoints**
- **Error responses include detailed validation messages**
- **Webhook endpoints are for Telegram integration only**
- **Organization-based access control is enforced**
- **Rate limiting is applied to authentication endpoints**

For more detailed information, visit the Swagger documentation at `http://localhost:4000/docs` when the server is running.

