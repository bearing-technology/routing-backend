/**
 * Standalone test script to verify routing endpoints work with mock data
 *
 * Run with: npx ts-node test-routing-endpoints.ts
 *
 * Make sure the server is running on http://localhost:8080
 */

import axios from "axios";

const BASE_URL = "http://localhost:8080/routing";

interface QuoteResponse {
  quotes: Array<{
    quoteId: string;
    route: any;
    amountOut: number;
    netAmountOut: number;
    expiryTs: number;
    type: string;
    confidence: number;
    scoringMeta: {
      settlementDays: number;
      counterpartyRisk: number;
      timePenalty: number;
    };
  }>;
}

interface ExecuteResponse {
  reservationId: string;
  quoteId: string;
  status: string;
  depositInstructions?: {
    method: string;
    accountDetails: any;
    amount: number;
    paymentReference: string;
    qrCodeData?: string;
    depositExpiryTs: number;
  };
  reservedUntil: number;
  otcReservationId?: string;
}

interface DepositWebhookResponse {
  success: boolean;
  depositId?: string;
  executionId?: string;
}

interface StatusResponse {
  executionId: string;
  status: string;
  route: any;
  transactionHashes?: string[];
  currentStep?: number;
  completedAt?: number;
  error?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testQuoteEndpoint() {
  console.log("\n📊 Testing POST /routing/quote/v2");
  console.log("=".repeat(50));

  try {
    const response = await axios.post<QuoteResponse>(`${BASE_URL}/quote/v2`, {
      amountIn: 10000,
      fromToken: "BRL",
      toToken: "EUR",
      clientId: "test-client-123",
      priority: "cost",
    });

    console.log("✅ Quote request successful!");
    console.log(`   Found ${response.data.quotes.length} quote(s)\n`);

    if (response.data.quotes.length > 0) {
      const bestQuote = response.data.quotes[0];
      console.log("   Best Quote:");
      console.log(`   - Quote ID: ${bestQuote.quoteId}`);
      console.log(`   - Type: ${bestQuote.type}`);
      console.log(`   - Amount Out: ${bestQuote.amountOut} EUR`);
      console.log(`   - Net Amount Out: ${bestQuote.netAmountOut} EUR`);
      console.log(
        `   - Confidence: ${(bestQuote.confidence * 100).toFixed(1)}%`
      );
      console.log(
        `   - Settlement Days: ${bestQuote.scoringMeta.settlementDays}`
      );
      console.log(
        `   - Counterparty Risk: ${(
          bestQuote.scoringMeta.counterpartyRisk * 100
        ).toFixed(2)}%`
      );
      console.log(
        `   - Time Penalty: ${bestQuote.scoringMeta.timePenalty.toFixed(2)} EUR`
      );
      console.log(
        `   - Expires At: ${new Date(bestQuote.expiryTs).toISOString()}`
      );

      if (bestQuote.route) {
        console.log(`   - Route Steps: ${bestQuote.route.steps?.length || 0}`);
        bestQuote.route.steps?.forEach((step: any, idx: number) => {
          console.log(
            `     Step ${idx + 1}: ${step.fromToken} → ${step.toToken} via ${
              step.venueId
            }`
          );
        });
      }

      return bestQuote.quoteId;
    }

    return null;
  } catch (error: any) {
    console.error("❌ Quote request failed!");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      console.error(`   Error: ${error.message}`);
    }
    return null;
  }
}

async function testExecuteEndpoint(quoteId: string) {
  console.log("\n🚀 Testing POST /routing/execute/v2");
  console.log("=".repeat(50));

  try {
    const response = await axios.post<ExecuteResponse>(
      `${BASE_URL}/execute/v2`,
      {
        quoteId,
        clientId: "test-client-123",
      }
    );

    console.log("✅ Execute request successful!");
    console.log(`   Reservation ID: ${response.data.reservationId}`);
    console.log(`   Status: ${response.data.status}`);
    console.log(
      `   Reserved Until: ${new Date(
        response.data.reservedUntil
      ).toISOString()}`
    );

    if (response.data.depositInstructions) {
      console.log("\n   Deposit Instructions:");
      console.log(`   - Method: ${response.data.depositInstructions.method}`);
      console.log(`   - Amount: ${response.data.depositInstructions.amount}`);
      console.log(
        `   - Payment Reference: ${response.data.depositInstructions.paymentReference}`
      );
      if (response.data.depositInstructions.qrCodeData) {
        console.log(
          `   - QR Code: ${response.data.depositInstructions.qrCodeData.substring(
            0,
            50
          )}...`
        );
      }
      console.log(
        `   - Expires At: ${new Date(
          response.data.depositInstructions.depositExpiryTs
        ).toISOString()}`
      );

      if (response.data.depositInstructions.accountDetails) {
        console.log("\n   Account Details:");
        Object.entries(
          response.data.depositInstructions.accountDetails
        ).forEach(([key, value]) => {
          console.log(`   - ${key}: ${value}`);
        });
      }
    }

    if (response.data.otcReservationId) {
      console.log(`\n   OTC Reservation ID: ${response.data.otcReservationId}`);
    }

    return {
      reservationId: response.data.reservationId,
      paymentReference: response.data.depositInstructions?.paymentReference,
      executionId: null as string | null, // Will be set after deposit webhook
    };
  } catch (error: any) {
    console.error("❌ Execute request failed!");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      console.error(`   Error: ${error.message}`);
    }
    return null;
  }
}

async function testDepositWebhook(paymentReference: string) {
  console.log("\n💰 Testing POST /routing/webhooks/deposit");
  console.log("=".repeat(50));

  try {
    const response = await axios.post<DepositWebhookResponse>(
      `${BASE_URL}/webhooks/deposit`,
      {
        paymentReference,
        amountReceived: 10000,
        bankTxId: `test-tx-${Date.now()}`,
        source: "PIX",
      }
    );

    console.log("✅ Deposit webhook successful!");
    console.log(`   Success: ${response.data.success}`);
    if (response.data.depositId) {
      console.log(`   Deposit ID: ${response.data.depositId}`);
    }
    if (response.data.executionId) {
      console.log(`   Execution ID: ${response.data.executionId}`);
      return response.data.executionId;
    }

    return null;
  } catch (error: any) {
    console.error("❌ Deposit webhook failed!");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      console.error(`   Error: ${error.message}`);
    }
    return null;
  }
}

async function testStatusEndpoint(executionId: string) {
  console.log("\n📈 Testing GET /routing/status");
  console.log("=".repeat(50));

  try {
    const response = await axios.get<StatusResponse>(`${BASE_URL}/status`, {
      params: { executionId },
    });

    console.log("✅ Status request successful!");
    console.log(`   Execution ID: ${response.data.executionId}`);
    console.log(`   Status: ${response.data.status}`);
    if (response.data.currentStep !== undefined) {
      console.log(`   Current Step: ${response.data.currentStep}`);
    }
    if (response.data.transactionHashes) {
      console.log(
        `   Transaction Hashes: ${response.data.transactionHashes.length}`
      );
      response.data.transactionHashes.forEach((hash, idx) => {
        console.log(`     ${idx + 1}. ${hash}`);
      });
    }
    if (response.data.completedAt) {
      console.log(
        `   Completed At: ${new Date(response.data.completedAt).toISOString()}`
      );
    }
    if (response.data.error) {
      console.log(`   Error: ${response.data.error}`);
    }

    if (response.data.route) {
      console.log(`\n   Route Summary:`);
      console.log(`   - Total In: ${response.data.route.totalIn}`);
      console.log(`   - Total Out: ${response.data.route.totalOut}`);
      console.log(`   - Effective Rate: ${response.data.route.effectiveRate}`);
      console.log(`   - Total Fees: ${response.data.route.totalFeesBps} bps`);
    }

    return response.data;
  } catch (error: any) {
    console.error("❌ Status request failed!");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      console.error(`   Error: ${error.message}`);
    }
    return null;
  }
}

async function testErrorCases() {
  console.log("\n⚠️  Testing Error Cases");
  console.log("=".repeat(50));

  // Test invalid quote request
  try {
    await axios.post(`${BASE_URL}/quote/v2`, {
      amountIn: -1000, // Invalid negative amount
      fromToken: "BRL",
      toToken: "EUR",
    });
    console.log("❌ Should have failed with negative amount");
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log("✅ Correctly rejected invalid amount");
    } else {
      console.log("❌ Unexpected error:", error.message);
    }
  }

  // Test non-existent quote
  try {
    await axios.post(`${BASE_URL}/execute/v2`, {
      quoteId: "quote:non-existent",
      clientId: "test-client",
    });
    console.log("❌ Should have failed with non-existent quote");
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("✅ Correctly rejected non-existent quote");
    } else {
      console.log("❌ Unexpected error:", error.message);
    }
  }

  // Test non-existent execution
  try {
    await axios.get(`${BASE_URL}/status`, {
      params: { executionId: "exec:non-existent" },
    });
    console.log("❌ Should have failed with non-existent execution");
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("✅ Correctly rejected non-existent execution");
    } else {
      console.log("❌ Unexpected error:", error.message);
    }
  }
}

async function runFullE2ETest() {
  console.log("\n" + "=".repeat(50));
  console.log("🧪 ROUTING ENDPOINTS E2E TEST");
  console.log("=".repeat(50));
  console.log(
    "\n⚠️  Make sure the server is running on http://localhost:8080\n"
  );

  try {
    // Step 1: Get Quote
    const quoteId = await testQuoteEndpoint();
    if (!quoteId) {
      console.log("\n❌ Cannot continue without a valid quote");
      return;
    }

    await sleep(1000); // Small delay

    // Step 2: Execute/Reserve Quote
    const executeResult = await testExecuteEndpoint(quoteId);
    if (!executeResult || !executeResult.paymentReference) {
      console.log("\n❌ Cannot continue without deposit instructions");
      return;
    }

    await sleep(1000);

    // Step 3: Simulate Deposit Webhook
    const executionId = await testDepositWebhook(
      executeResult.paymentReference
    );
    if (!executionId) {
      console.log(
        "\n⚠️  Deposit webhook did not return execution ID, but continuing..."
      );
    }

    await sleep(2000); // Wait for execution to start

    // Step 4: Check Status
    if (executionId) {
      await testStatusEndpoint(executionId);
    } else {
      console.log("\n⚠️  Skipping status check (no execution ID)");
    }

    // Test error cases
    await testErrorCases();

    console.log("\n" + "=".repeat(50));
    console.log("✅ ALL TESTS COMPLETED");
    console.log("=".repeat(50) + "\n");
  } catch (error: any) {
    console.error("\n❌ Test suite failed:", error.message);
    if (error.code === "ECONNREFUSED") {
      console.error(
        "\n⚠️  Could not connect to server. Make sure it's running on http://localhost:8080"
      );
    }
  }
}

// Run tests
if (require.main === module) {
  runFullE2ETest().catch(console.error);
}

export { runFullE2ETest };
