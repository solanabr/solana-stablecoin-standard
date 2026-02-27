/**
 * SSS Token Backend API Server
 *
 * Express.js API for:
 * - Mint/Burn lifecycle
 * - Event indexing
 * - Compliance service
 * - Webhook notifications
 */

import express, { Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import cors from "cors";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import { SSS_TOKEN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "@stbr/sss-token";
import { SssToken } from "@stbr/sss-token/src/types/idl/sss_token";
import { SssTransferHook } from "@stbr/sss-token/src/types/idl/sss_transfer_hook";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Solana connection
const connection = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// Supabase for data persistence
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    solanaConnection: connection.rpcEndpoint,
    version: "1.0.0",
  });
});

// ============================================
// MINT/BURN LIFECYCLE
// ============================================

/**
 * Request to mint tokens
 * POST /api/mint/request
 */
app.post("/api/mint/request", async (req: Request, res: Response) => {
  try {
    const {
      stablecoin,
      recipient,
      amount,
      minter,
      requestId,
      metadata = {},
    } = req.body;

    // Validate inputs
    if (!stablecoin || !recipient || !amount || !minter) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: stablecoin, recipient, amount, minter",
      });
    }

    // Create mint request record
    const { data: request, error } = await supabase
      .from("mint_requests")
      .insert({
        request_id: requestId || crypto.randomUUID(),
        stablecoin,
        recipient,
        amount,
        requested_by: minter,
        status: "pending",
        metadata,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Emit webhook if configured
    await emitWebhook("mint.requested", request);

    res.json({
      success: true,
      data: {
        requestId: request.request_id,
        status: "pending",
        message: "Mint request submitted for approval",
      },
    });
  } catch (error: any) {
    console.error("Mint request error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Approve and execute mint
 * POST /api/mint/execute
 */
app.post("/api/mint/execute", async (req: Request, res: Response) => {
  try {
    const { requestId, approver } = req.body;

    // Get request
    const { data: request, error: fetchError } = await supabase
      .from("mint_requests")
      .select("*")
      .eq("request_id", requestId)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({
        success: false,
        error: "Mint request not found",
      });
    }

    // TODO: Verify approver has MINTER role on-chain
    // This would involve calling the program to check roles

    // Update status
    await supabase
      .from("mint_requests")
      .update({
        status: "executing",
        approved_by: approver,
        approved_at: new Date().toISOString(),
      })
      .eq("request_id", requestId);

    // In production, this would sign and send the transaction
    const mockSignature = "mock-signature-" + Date.now();

    // Update with result
    await supabase
      .from("mint_requests")
      .update({
        status: "completed",
        signature: mockSignature,
        executed_at: new Date().toISOString(),
      })
      .eq("request_id", requestId);

    // Emit webhook
    await emitWebhook("mint.executed", {
      ...request,
      signature: mockSignature,
    });

    res.json({
      success: true,
      data: {
        requestId,
        signature: mockSignature,
        status: "completed",
      },
    });
  } catch (error: any) {
    console.error("Mint execute error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Request to burn tokens
 * POST /api/burn/request
 */
app.post("/api/burn/request", async (req: Request, res: Response) => {
  try {
    const { stablecoin, tokenAccount, amount, burner, requestId } = req.body;

    const { data: request, error } = await supabase
      .from("burn_requests")
      .insert({
        request_id: requestId || crypto.randomUUID(),
        stablecoin,
        token_account: tokenAccount,
        amount,
        requested_by: burner,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    await emitWebhook("burn.requested", request);

    res.json({
      success: true,
      data: {
        requestId: request.request_id,
        status: "pending",
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// EVENTS & INDEXING
// ============================================

/**
 * Get events for a stablecoin
 * GET /api/events/:stablecoin
 */
app.get("/api/events/:stablecoin", async (req: Request, res: Response) => {
  try {
    const { stablecoin } = req.params;
    const { type, from, to, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from("events")
      .select("*")
      .eq("stablecoin", stablecoin)
      .order("timestamp", { ascending: false })
      .limit(Number(limit))
      // @ts-ignore
      .offset(Number(offset));

    if (type) {
      query = query.eq("event_type", type);
    }

    if (from) {
      query = query.gte("timestamp", from);
    }

    if (to) {
      query = query.lte("timestamp", to);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: events,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: events?.length || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get transaction history
 * GET /api/transactions/:address
 */
app.get("/api/transactions/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = 50 } = req.query;

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`from.eq.${address},to.eq.${address}`)
      .order("timestamp", { ascending: false })
      .limit(Number(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// COMPLIANCE SERVICE (SSS-2)
// ============================================

/**
 * Check if address is blacklisted
 * GET /api/compliance/blacklist/check/:address
 */
app.get(
  "/api/compliance/blacklist/check/:address",
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { stablecoin } = req.query;

      // Check database
      const { data: entry, error } = await supabase
        .from("blacklist")
        .select("*")
        .eq("address", address)
        .eq("stablecoin", stablecoin)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        // Not found is ok
        throw error;
      }

      res.json({
        success: true,
        data: {
          address,
          stablecoin,
          isBlacklisted: !!entry,
          reason: entry?.reason || null,
          blacklistedAt: entry?.created_at || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * Add to blacklist
 * POST /api/compliance/blacklist/add
 */
app.post(
  "/api/compliance/blacklist/add",
  async (req: Request, res: Response) => {
    try {
      const { stablecoin, address, reason, blacklister } = req.body;

      // Validate blacklister role on-chain (mock)
      // In production: verify signature and check on-chain role

      const { data: entry, error } = await supabase
        .from("blacklist")
        .insert({
          stablecoin,
          address,
          reason,
          blacklisted_by: blacklister,
          is_active: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      await emitWebhook("compliance.blacklist.added", entry);

      res.json({
        success: true,
        data: entry,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * Remove from blacklist
 * POST /api/compliance/blacklist/remove
 */
app.post(
  "/api/compliance/blacklist/remove",
  async (req: Request, res: Response) => {
    try {
      const { stablecoin, address, blacklister } = req.body;

      const { data: entry, error } = await supabase
        .from("blacklist")
        .update({
          is_active: false,
          removed_by: blacklister,
          removed_at: new Date().toISOString(),
        })
        .eq("stablecoin", stablecoin)
        .eq("address", address)
        .select()
        .single();

      if (error) throw error;

      await emitWebhook("compliance.blacklist.removed", entry);

      res.json({
        success: true,
        data: entry,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * Export audit trail
 * GET /api/compliance/audit/:stablecoin
 */
app.get(
  "/api/compliance/audit/:stablecoin",
  async (req: Request, res: Response) => {
    try {
      const { stablecoin } = req.params;
      const { format = "json" } = req.query;

      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("stablecoin", stablecoin)
        .order("timestamp", { ascending: true });

      const { data: blacklist } = await supabase
        .from("blacklist")
        .select("*")
        .eq("stablecoin", stablecoin)
        .order("created_at", { ascending: true });

      const audit = {
        stablecoin,
        generatedAt: new Date().toISOString(),
        events: events || [],
        blacklist: blacklist || [],
      };

      if (format === "csv") {
        // Convert to CSV
        const csv = convertToCSV(audit.events);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audit-${stablecoin}.csv"`
        );
        return res.send(csv);
      }

      res.json({
        success: true,
        data: audit,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ============================================
// WEBHOOKS
// ============================================

/**
 * Register webhook
 * POST /api/webhooks/register
 */
app.post("/api/webhooks/register", async (req: Request, res: Response) => {
  try {
    const { url, events, secret } = req.body;

    const { data: webhook, error } = await supabase
      .from("webhooks")
      .insert({
        url,
        events: events || ["*"],
        secret,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: {
        webhookId: webhook.id,
        url,
        events: webhook.events,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Emit webhook event
 */
async function emitWebhook(eventType: string, payload: any) {
  try {
    // Get active webhooks for this event
    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("*")
      .eq("is_active", true)
      .or(`events.cs.{${eventType}},events.cs.{*}`);

    if (!webhooks) return;

    // Send to each webhook
    const promises = webhooks.map(async (webhook) => {
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": webhook.secret || "",
          },
          body: JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload,
          }),
        });

        // Log attempt
        await supabase.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          event_type: eventType,
          payload: JSON.stringify(payload),
          status_code: response.status,
          delivered_at: new Date().toISOString(),
        });
      } catch (error) {
        // Log failure
        await supabase.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          event_type: eventType,
          payload: JSON.stringify(payload),
          status_code: 0,
          error: error instanceof Error ? error.message : "Unknown error",
          delivered_at: new Date().toISOString(),
        });
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Webhook emission error:", error);
  }
}

// ============================================
// INDEXER ENDPOINTS
// ============================================

/**
 * Get holder list
 * GET /api/holders/:stablecoin
 */
app.get("/api/holders/:stablecoin", async (req: Request, res: Response) => {
  try {
    const { stablecoin } = req.params;
    const { minBalance = 0 } = req.query;

    const { data: holders, error } = await supabase
      .from("token_accounts")
      .select("owner, balance")
      .eq("stablecoin", stablecoin)
      .gte("balance", minBalance)
      .order("balance", { ascending: false });

    if (error) throw error;

    const totalSupply =
      holders?.reduce((sum, h) => sum + Number(h.balance), 0) || 0;

    res.json({
      success: true,
      data: {
        holders: holders || [],
        totalHolders: holders?.length || 0,
        totalSupply,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get supply stats
 * GET /api/stats/:stablecoin
 */
app.get("/api/stats/:stablecoin", async (req: Request, res: Response) => {
  try {
    const { stablecoin } = req.params;

    // Get from database
    const { data: state } = await supabase
      .from("stablecoin_states")
      .select("*")
      .eq("stablecoin", stablecoin)
      .single();

    // Calculate 24h stats
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: recentTransactions } = await supabase
      .from("transactions")
      .select("amount, type")
      .eq("stablecoin", stablecoin)
      .gte("timestamp", yesterday.toISOString());

    const minted24h =
      recentTransactions
        ?.filter((t) => t.type === "mint")
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    const burned24h =
      recentTransactions
        ?.filter((t) => t.type === "burn")
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    res.json({
      success: true,
      data: {
        totalSupply: state?.total_supply || 0,
        isPaused: state?.is_paused || false,
        minted24h,
        burned24h,
        netChange24h: minted24h - burned24h,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// UTILS
// ============================================

function convertToCSV(data: any[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map((v) => `"${v}"`)
      .join(",")
  );

  return [headers, ...rows].join("\n");
}

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 SSS Token API Server running on port ${PORT}`);
  console.log(`📡 Solana RPC: ${connection.rpcEndpoint}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;
