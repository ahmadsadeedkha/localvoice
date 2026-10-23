import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { CallsService } from './calls.service';
import { Public } from '../auth/decorators';

/**
 * DEV ONLY. Registered only outside production (see CallsModule).
 * Takes tenantId from the body purely for local testing; this must never exist in prod.
 */

// Served from the backend itself: same origin (no CORS) and localhost counts as a
// secure context, so the browser allows microphone access.
// NOTE: no backticks or dollar-brace sequences inside the page script.
const TEST_PAGE = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LocalVoice test call</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    input { width: 22rem; max-width: 100%; padding: .4rem; }
    button { padding: .5rem 1rem; margin-right: .5rem; }
    #status { font-weight: 600; margin: 1rem 0 .5rem; }
    #transcript { background: #f4f4f5; padding: .75rem; border-radius: 6px; min-height: 6rem; white-space: pre-wrap; }
    #log { color: #555; font-size: .85rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>LocalVoice test call</h1>
  <p><label>Tenant ID <input id="tenant" placeholder="uuid of a seeded tenant" /></label></p>
  <button id="start">Start call</button>
  <button id="stop" disabled>End call</button>
  <div id="status">Idle</div>
  <div id="transcript"></div>
  <pre id="log"></pre>

  <script type="module">
    import { RetellWebClient } from "https://esm.sh/retell-client-js-sdk@latest";

    const $ = (id) => document.getElementById(id);
    const client = new RetellWebClient();

    const params = new URLSearchParams(location.search);
    if (params.get("tenantId")) $("tenant").value = params.get("tenantId");

    const log = (msg) => { $("log").textContent += msg + "\\n"; };
    const setStatus = (s) => { $("status").textContent = s; };
    const setRunning = (running) => { $("start").disabled = running; $("stop").disabled = !running; };

    client.on("call_started", () => { setStatus("In call"); log("call_started"); });
    client.on("call_ended", () => { setStatus("Call ended"); setRunning(false); log("call_ended"); });
    client.on("error", (e) => { setStatus("Error"); setRunning(false); log("error: " + JSON.stringify(e)); client.stopCall(); });
    client.on("update", (u) => {
      if (!u || !u.transcript) return;
      $("transcript").textContent = u.transcript
        .map((t) => (t.role === "agent" ? "Agent: " : "You: ") + t.content)
        .join("\\n");
    });

    $("start").addEventListener("click", async () => {
      const tenantId = $("tenant").value.trim();
      if (!tenantId) { setStatus("Enter a tenant id first"); return; }
      setRunning(true);
      setStatus("Creating call...");
      try {
        const res = await fetch("/dev/calls/web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        });
        if (!res.ok) throw new Error("Backend returned " + res.status + ": " + (await res.text()));
        const d = await res.json();
        log("call id: " + d.callId);
        await client.startCall({
          callId: d.callId,
          accessToken: d.accessToken,
          transport: d.transport,
          iceServers: d.iceServers,
        });
      } catch (e) {
        setStatus("Failed to start");
        setRunning(false);
        log(String(e));
      }
    });

    $("stop").addEventListener("click", () => client.stopCall());
  </script>
</body>
</html>`;

@Public()
@Controller('dev/calls')
export class DevCallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('test-page')
  @Header('Content-Type', 'text/html; charset=utf-8')
  testPage() {
    return TEST_PAGE;
  }

  @Post('web')
  createWebCall(@Body() body: { tenantId: string }) {
    return this.calls.createWebCall(body.tenantId);
  }
}
