# Onboarding Progress API Design Summary

## Overview
This document outlines the REST API design for the Onboarding Progress module, providing endpoints to manage and track user onboarding progress through the application setup flow.

## API Endpoints

### Base URL
All endpoints are prefixed with `/v1/onboarding-progress`

### Authentication
All endpoints require JWT Bearer token authentication via the `Authorization` header.

---

## 1. Get Current Step

**Endpoint:** `GET /v1/onboarding-progress/current-step`

**Description:** Returns the current onboarding step for the authenticated user's organization.

**Authentication:** Required (JWT Bearer Token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "step": "SELECT_CATEGORY"
}
```

**Possible Step Values:**
- `SELECT_CATEGORY` - User needs to select business category
- `CONFIGURE_SCHEMA` - User needs to configure product schema
- `ADD_FIRST_PRODUCT` - User needs to add their first product
- `CONNECT_BOT` - User needs to connect their Telegram bot

**Error Responses:**
- `404 Not Found` - User is not a member of any organization or onboarding progress not found

**Use Case:** Frontend can use this to display the current step indicator and guide users through the onboarding process.

---

## 2. Get All Onboarding Steps

**Endpoint:** `GET /v1/onboarding-progress/steps`

**Description:** Returns a list of all available onboarding steps in sequential order.

**Authentication:** Required (JWT Bearer Token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "steps": [
    "SELECT_CATEGORY",
    "CONFIGURE_SCHEMA",
    "ADD_FIRST_PRODUCT",
    "CONNECT_BOT"
  ]
}
```

**Use Case:** Frontend can use this to display the complete onboarding flow, showing all steps with progress indicators.

---

## 3. Get Full Progress

**Endpoint:** `GET /v1/onboarding-progress/progress`

**Description:** Returns the complete onboarding progress information for the authenticated user's organization, including all completion flags and status.

**Authentication:** Required (JWT Bearer Token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "id": 1,
  "organizationId": 1,
  "percentage": 40,
  "isCategorySelected": true,
  "isSchemaConfigured": false,
  "isFirstProductAdded": false,
  "isBotConnected": false,
  "nextStep": "CONFIGURE_SCHEMA",
  "status": "INCOMPLETE"
}
```

**Response Fields:**
- `id` - Unique identifier for the onboarding progress record
- `organizationId` - ID of the organization
- `percentage` - Completion percentage (0-100)
- `isCategorySelected` - Boolean flag for category selection
- `isSchemaConfigured` - Boolean flag for schema configuration
- `isFirstProductAdded` - Boolean flag for first product addition
- `isBotConnected` - Boolean flag for bot connection
- `nextStep` - The next step the user should complete
- `status` - Overall status: `INCOMPLETE` or `COMPLETED`

**Error Responses:**
- `404 Not Found` - User is not a member of any organization or onboarding progress not found

**Use Case:** Frontend can use this to display detailed progress information, completion checkboxes, and overall status.

---

## 4. Update to Next Step

**Endpoint:** `PATCH /v1/onboarding-progress/next-step`

**Description:** Updates the onboarding progress to the specified step and automatically recalculates the completion percentage and status.

**Authentication:** Required (JWT Bearer Token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "step": "CONFIGURE_SCHEMA"
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "organizationId": 1,
  "percentage": 60,
  "isCategorySelected": true,
  "isSchemaConfigured": true,
  "isFirstProductAdded": false,
  "isBotConnected": false,
  "nextStep": "CONFIGURE_SCHEMA",
  "status": "INCOMPLETE"
}
```

**Percentage Calculation:**
- `SELECT_CATEGORY` → 40%
- `CONFIGURE_SCHEMA` → 60%
- `ADD_FIRST_PRODUCT` → 80%
- `CONNECT_BOT` → 100% (status changes to COMPLETED)

**Error Responses:**
- `404 Not Found` - User is not a member of any organization

**Use Case:** Call this endpoint when a user completes a step to advance their onboarding progress.

---

## Implementation Details

### Files Created/Modified

1. **Controller:** `src/modules/onboarding-progress/onboarding-progress.controller.ts`
   - Implements all 4 endpoints with proper decorators
   - Includes Swagger/OpenAPI documentation
   - Uses JWT authentication guard

2. **DTOs:** `src/modules/onboarding-progress/dto/onboarding-progress-response.dto.ts`
   - `CurrentStepResponseDto` - Response for current step
   - `OnboardingStepsResponseDto` - Response for all steps
   - `OnboardingProgressResponseDto` - Full progress response
   - `UpdateNextStepDto` - Request body for updating step

3. **Service:** `src/modules/onboarding-progress/onboarding-progress.service.ts`
   - Already implemented with business logic
   - Handles database operations via Prisma

### Design Patterns Used

1. **Authentication:** JWT Bearer token via `@UseGuards(JwtAuthGuard)`
2. **User Context:** `@CurrentUser()` decorator extracts user from JWT
3. **API Versioning:** All routes prefixed with `/v1/`
4. **Swagger Documentation:** Full OpenAPI/Swagger annotations for API documentation
5. **DTO Pattern:** Type-safe request/response objects with validation
6. **Error Handling:** Proper HTTP status codes and error messages

### Security Considerations

- All endpoints require authentication
- User ID is extracted from JWT token (cannot be spoofed)
- Only users with ADMIN role can access their organization's onboarding progress
- Organization membership is validated before returning data

### Database Schema

The implementation uses the `OnboardingProgress` model with the following structure:
- Links to organization via `organizationId`
- Tracks individual step completion with boolean flags
- Stores current `nextStep` and overall `status`
- Calculates `percentage` based on completed steps

### Testing Recommendations

1. **Unit Tests:**
   - Test service methods with mocked Prisma
   - Test DTO validation
   - Test error scenarios

2. **Integration Tests:**
   - Test complete flow from authentication to response
   - Test with different user roles
   - Test with non-existent organizations

3. **E2E Tests:**
   - Test full onboarding flow
   - Test progress updates
   - Test completion status

---

## Usage Example

### Complete Onboarding Flow

```javascript
// 1. Get current step
GET /v1/onboarding-progress/current-step
Response: { "step": "SELECT_CATEGORY" }

// 2. User selects category
PATCH /v1/onboarding-progress/next-step
Body: { "step": "SELECT_CATEGORY" }
Response: { "percentage": 40, "nextStep": "SELECT_CATEGORY" }

// 3. Get updated progress
GET /v1/onboarding-progress/progress
Response: { "percentage": 40, "isCategorySelected": true, ... }

// 4. User configures schema
PATCH /v1/onboarding-progress/next-step
Body: { "step": "CONFIGURE_SCHEMA" }
Response: { "percentage": 60, "nextStep": "CONFIGURE_SCHEMA" }

// Continue until CONNECT_BOT (100% complete)
```

---

## Swagger Documentation

All endpoints are automatically documented in Swagger UI at:
```
http://localhost:3000/api (or your configured Swagger path)
```

The documentation includes:
- Endpoint descriptions
- Request/response schemas
- Authentication requirements
- Example values
- Error responses

---

## Notes

- The service automatically handles organization lookup based on the authenticated user
- Only ADMIN members can access onboarding progress
- The `handleNextStep` method automatically calculates percentage and updates status
- All responses follow consistent JSON structure
- Error messages are user-friendly and descriptive

