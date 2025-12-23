# Testing Guide

This guide explains how to test the routing endpoints with mock data.

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm run start:dev
   ```
   The server should be running on `http://localhost:8080`

## Test Options

### Option 1: Standalone Test Script (Recommended for Quick Testing)

This script makes actual HTTP requests to your running server and tests the full flow.

**Run the standalone test:**
```bash
npx ts-node test-routing-endpoints.ts
```

**What it tests:**
- ✅ POST `/routing/quote/v2` - Get quotes with settlement scoring
- ✅ POST `/routing/execute/v2` - Reserve quote and get deposit instructions
- ✅ POST `/routing/webhooks/deposit` - Deposit confirmation webhook
- ✅ GET `/routing/status` - Check execution status
- ✅ Error cases (invalid requests, non-existent resources)

**Output:**
The script will print detailed results for each endpoint, showing:
- Quote details (amount, net amount, scoring metadata)
- Deposit instructions (PIX key, payment reference, QR code)
- Execution status and transaction hashes
- Error handling

### Option 2: Jest Unit Tests (For CI/CD)

These are proper unit tests with mocked dependencies.

**Run Jest tests:**
```bash
npm test routing.controller.spec
```

**Or run with coverage:**
```bash
npm run test:cov
```

**What it tests:**
- All endpoints with mocked services
- Request validation
- Error handling
- Full E2E flow simulation

## Test Flow Example

Here's what happens in a typical test run:

### 1. Request Quote
```bash
POST /routing/quote/v2
{
  "amountIn": 10000,
  "fromToken": "BRL",
  "toToken": "EUR",
  "clientId": "test-client-123"
}
```

**Expected Response:**
- Multiple ranked quotes
- Each quote includes:
  - `amountOut`: Quoted output
  - `netAmountOut`: After settlement risk discount
  - `scoringMeta`: Settlement days, counterparty risk, time penalty
  - `confidence`: Route confidence score

### 2. Reserve Quote
```bash
POST /routing/execute/v2
{
  "quoteId": "quote:abc-123",
  "clientId": "test-client-123"
}
```

**Expected Response:**
- Reservation ID
- Deposit instructions (PIX key, payment reference, QR code)
- Reservation expiry time

### 3. Confirm Deposit (Webhook)
```bash
POST /routing/webhooks/deposit
{
  "paymentReference": "rxyz-789-client-123",
  "amountReceived": 10000,
  "bankTxId": "pix-tx-123",
  "source": "PIX"
}
```

**Expected Response:**
- Success confirmation
- Deposit ID
- Execution ID

### 4. Check Status
```bash
GET /routing/status?executionId=exec:exec-789
```

**Expected Response:**
- Execution status (EXECUTING, COMPLETED, etc.)
- Current step
- Transaction hashes
- Route details

## Test Scenarios

### Happy Path: BRL → EUR
1. Request quote for 10,000 BRL → EUR
2. Reserve best quote
3. Simulate PIX deposit
4. Check execution status

### Error Cases
- Invalid amount (negative)
- Non-existent quote ID
- Non-existent execution ID
- Expired quote

## Mock Data

The tests use mock data that simulates:
- **BRL → EUR route**: 2-step route via USDC
- **Settlement scoring**: 0.5 day settlement, 0.1% counterparty risk
- **Deposit instructions**: PIX with QR code
- **Execution**: Simulated transaction hashes

## Troubleshooting

### "ECONNREFUSED" Error
- Make sure the server is running: `npm run start:dev`
- Check the server is on port 8080
- Verify no firewall is blocking connections

### "Quote not found" Error
- Quotes expire after 15 seconds (provisional) or 5 minutes (reserved)
- Make sure you're using a fresh quote ID from step 1

### Tests Pass but No Real Data
- The standalone script uses real endpoints but may hit mocked providers
- Check that OTC providers are configured in `AppModule`
- Verify Redis is running and accessible

## Next Steps

1. **Integrate real OTC APIs**: Replace mock providers with actual API calls
2. **Add PIX webhook**: Connect to real PIX provider for deposit confirmations
3. **Add monitoring**: Track quote freshness, execution success rates
4. **Load testing**: Use tools like `artillery` or `k6` for performance testing

## Example Output

```
🧪 ROUTING ENDPOINTS E2E TEST
==================================================

📊 Testing POST /routing/quote/v2
==================================================
✅ Quote request successful!
   Found 1 quote(s)

   Best Quote:
   - Quote ID: quote:test-123
   - Type: OTC+DEX
   - Amount Out: 1840 EUR
   - Net Amount Out: 1835.5 EUR
   - Confidence: 95.0%
   - Settlement Days: 0.5
   - Counterparty Risk: 0.10%
   - Time Penalty: 4.50 EUR

🚀 Testing POST /routing/execute/v2
==================================================
✅ Execute request successful!
   Reservation ID: reservation:test-456
   Status: PENDING_APPROVAL

   Deposit Instructions:
   - Method: PIX
   - Amount: 10000
   - Payment Reference: rtest-456-client-123
   - QR Code: 00020126580014BR.GOV.BCB.PIX...

💰 Testing POST /routing/webhooks/deposit
==================================================
✅ Deposit webhook successful!
   Success: true
   Deposit ID: deposit:test-111
   Execution ID: exec:test-789

📈 Testing GET /routing/status
==================================================
✅ Status request successful!
   Execution ID: exec:test-789
   Status: EXECUTING
   Current Step: 1
   Transaction Hashes: 2

✅ ALL TESTS COMPLETED
```

