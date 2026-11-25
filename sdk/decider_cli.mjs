import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { OpenRouter } from "@openrouter/sdk";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Missing OPENROUTER_API_KEY in .env");
  process.exit(1);
}

const openrouter = new OpenRouter({ apiKey });

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  const imagePath = args[1];

  const state = [];
  if (inputPath && fs.existsSync(inputPath)) {
    const content = fs.readFileSync(inputPath, "utf-8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const prioritized = lines.filter((l) =>
      /\b(ERROR|WARN|CRITICAL|deploy|pool_max|ttl_flush|jwks_rotate)\b/i.test(l)
    );
    const sample = prioritized.length > 0 ? prioritized.slice(0, 40) : lines.slice(-40);
    state.push(...sample);
  } else {
    state.push(
      "[LOG-0042] 2026-11-25T14:02:01Z checkout-svc INFO deploy v2.4.1 applied config db_pool_max=5 (prev=50)",
      "[LOG-0188] 2026-11-25T14:04:12Z checkout-svc ERROR HikariPool-1 connection timeout after 3000ms active=5/5",
      "[MET-0035] 2026-11-25T14:04:30Z checkout-svc db_pool_usage=100.0% (z=5.42)",
      "[TRACE-0091] 2026-11-25T14:04:45Z payment-svc span=charge duration_ms=4820 status=TIMEOUT"
    );
  }

  if (imagePath && fs.existsSync(imagePath)) {
    const imageBase64 = (await fs.promises.readFile(imagePath)).toString("base64");
    const ext = path.extname(imagePath).toLowerCase().replace(".", "") || "png";
    state.push({
      type: "image_url",
      image_url: { url: `data:image/${ext};base64,${imageBase64}` }
    });
  }

  const decision = await openrouter.alpha.decisions.create({
    decisionsRequest: {
      model: "perplexity/pplx-decider-flash-v1.3:free",
      state,
      questions: {
        is_incident_confirmed: {
          type: "noul",
          instructions: "Does the attached state confirm an active production incident or outage?",
          criteria: {
            true: "Active errors, latency spikes, or resource exhaustion are observed",
            false: "System appears healthy or insufficient signal"
          }
        },
        root_cause_category: {
          type: "choice",
          instructions: "Which failure mechanism best fits the incident state?",
          criteria: {
            connection_pool_exhaustion: "Database connection pool limit reached or misconfigured",
            upstream_timeout: "External dependency or downstream service timing out",
            auth_failure: "Authentication, token, or permission rejection",
            memory_pressure: "OOM, heap exhaustion, or GC thrashing",
            deployment_regression: "General bad release or config regression"
          }
        },
        severity: {
          type: "score",
          instructions: "How severe is the operational impact?",
          criteria: ["Low", "Medium", "High"]
        }
      }
    }
  });

  console.log(JSON.stringify(decision, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
