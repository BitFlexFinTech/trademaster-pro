import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  type: 'slow_total' | 'slow_phase' | 'critical' | 'trade_completed' | 'error';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  tradeId?: string;
  pair?: string;
  exchange?: string;
  durationMs?: number;
  thresholdMs?: number;
}

interface WebhookConfig {
  discord_url?: string | null;
  slack_url?: string | null;
  enabled: boolean;
  alert_types: string[];
  cooldown_seconds: number;
}

// Format Discord embed message
function formatDiscordMessage(payload: WebhookPayload): object {
  const colorMap = {
    info: 0x3498db,     // Blue
    warning: 0xf39c12,  // Orange
    error: 0xe74c3c,    // Red
  };

  const embed = {
    title: payload.title,
    description: payload.description,
    color: colorMap[payload.severity] || colorMap.info,
    timestamp: payload.timestamp || new Date().toISOString(),
    fields: payload.fields || [],
    footer: {
      text: "Trading Bot Alert System",
    },
  };

  // Add standard fields
  if (payload.pair) {
    embed.fields.push({ name: "Pair", value: payload.pair, inline: true });
  }
  if (payload.exchange) {
    embed.fields.push({ name: "Exchange", value: payload.exchange, inline: true });
  }
  if (payload.durationMs !== undefined) {
    embed.fields.push({ name: "Duration", value: `${payload.durationMs}ms`, inline: true });
  }
  if (payload.thresholdMs !== undefined) {
    embed.fields.push({ name: "Threshold", value: `${payload.thresholdMs}ms`, inline: true });
  }

  return {
    embeds: [embed],
  };
}

// Format Slack Block Kit message
function formatSlackMessage(payload: WebhookPayload): object {
  const emojiMap = {
    info: ":information_source:",
    warning: ":warning:",
    error: ":rotating_light:",
  };

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emojiMap[payload.severity] || ""} ${payload.title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: payload.description,
      },
    },
  ];

  // Add fields section
  const fields: Array<{ type: string; text: string }> = [];
  if (payload.pair) {
    fields.push({ type: "mrkdwn", text: `*Pair:*\n${payload.pair}` });
  }
  if (payload.exchange) {
    fields.push({ type: "mrkdwn", text: `*Exchange:*\n${payload.exchange}` });
  }
  if (payload.durationMs !== undefined) {
    fields.push({ type: "mrkdwn", text: `*Duration:*\n${payload.durationMs}ms` });
  }
  if (payload.thresholdMs !== undefined) {
    fields.push({ type: "mrkdwn", text: `*Threshold:*\n${payload.thresholdMs}ms` });
  }

  if (fields.length > 0) {
    blocks.push({
      type: "section",
      // @ts-ignore - Slack block structure
      fields,
    });
  }

  blocks.push({
    type: "context",
    // @ts-ignore - Slack block structure
    elements: [
      {
        type: "mrkdwn",
        text: `Sent at ${new Date().toISOString()}`,
      },
    ],
  });

  return { blocks };
}

// Send to Discord webhook
async function sendDiscordWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  try {
    const message = formatDiscordMessage(payload);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }

    console.log("✅ Discord webhook sent successfully");
    return true;
  } catch (error) {
    console.error("Discord webhook error:", error);
    return false;
  }
}

// Send to Slack webhook
async function sendSlackWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  try {
    const message = formatSlackMessage(payload);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`Slack webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }

    console.log("✅ Slack webhook sent successfully");
    return true;
  } catch (error) {
    console.error("Slack webhook error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const payload: WebhookPayload = body.payload;
    const testMode = body.testMode === true;

    if (!payload) {
      return new Response(JSON.stringify({ error: "Missing payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[send-alert-webhook] User ${user.id}, type: ${payload.type}, testMode: ${testMode}`);

    // Fetch user's webhook config
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("webhook_config")
      .eq("user_id", user.id)
      .single();

    if (settingsError) {
      console.error("Failed to fetch webhook config:", settingsError);
      return new Response(JSON.stringify({ error: "Failed to fetch webhook config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config: WebhookConfig = (settings?.webhook_config as WebhookConfig) || {
      enabled: false,
      alert_types: [],
      cooldown_seconds: 60,
    };

    // Check if webhooks are enabled (skip for test mode)
    if (!testMode && !config.enabled) {
      return new Response(JSON.stringify({ success: false, reason: "Webhooks disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this alert type is enabled (skip for test mode)
    if (!testMode && !config.alert_types.includes(payload.type)) {
      return new Response(JSON.stringify({ success: false, reason: `Alert type ${payload.type} not enabled` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = {
      discord: false,
      slack: false,
    };

    // Send to Discord if configured
    if (config.discord_url) {
      results.discord = await sendDiscordWebhook(config.discord_url, payload);
    }

    // Send to Slack if configured
    if (config.slack_url) {
      results.slack = await sendSlackWebhook(config.slack_url, payload);
    }

    const anySuccess = results.discord || results.slack;

    return new Response(JSON.stringify({
      success: anySuccess,
      results,
      message: anySuccess ? "Webhook sent successfully" : "No webhooks configured or all failed",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[send-alert-webhook] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
