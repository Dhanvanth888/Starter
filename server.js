const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const hbs = require("hbs");
const https = require("https"); // 1. Import HTTPS

const app = express();
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

const PORT = process.env.PORT || 3000;
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com";

// 2. Create a stable connection agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000 // 60 seconds
});

// 3. Helper function to retry failed requests automatically
async function fetchWithRetry(url, options = {}, retries = 3) {
  try {
    // Attach the agent to every request
    options.agent = httpsAgent;
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.statusText}`);
    return response;
  } catch (err) {
    if (retries > 0) {
      console.log(`⚠️ Connection failed. Retrying... (${retries} left)`);
      await new Promise(res => setTimeout(res, 1000)); // Wait 1 sec
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/pages"));
app.use(express.static(path.join(__dirname, "public")));

// Home Route
app.get("/", (req, res) => {
  res.render("index");
});

/**
 * ⚡ ESP32 UPDATE ROUTE (With Retry & Agent)
 */
app.post("/update-esp32", async (req, res) => {
  const val_v1 = req.body.V1 || req.body.v1 || "0";
  const val_v2 = req.body.V2 || req.body.v2 || "0";
  const val_v3 = req.body.V3 || req.body.v3 || "0";
  const val_amps = req.body.amps || req.body.Amps || "0.00";

  try {
    // 1. Save to Firebase with retry
    await fetchWithRetry(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        V1: val_v1,    
        V2: val_v2,    
        V3: val_v3,    
        amps: val_amps, 
        last_update: Date.now() 
      }),
    });

    // 2. Read controls with retry
    const controlRes = await fetchWithRetry(`${BASE_URL}/Starter.json`);
    const dbData = await controlRes.json();

    res.json({
      M1: dbData.M1 || "0",       
      M2: dbData.M2 || "0",       
      on_time: dbData.on_time || "0", 
      off_time: dbData.off_time || "0",
      stop: dbData.stop || "0",
      device: dbData.device || "0"
    }); 
  } catch (err) {
    console.error("ESP32 Sync Error:", err.message);
    res.status(500).send("Error syncing");
  }
});

// --- UTILITY ROUTES ---

app.get("/get", async (req, res) => {
  const path = req.query.path || "/Starter"; 
  try {
    const fbRes = await fetchWithRetry(`${BASE_URL}${path}.json`);
    const data = await fbRes.json();
    res.json(data);
  } catch (err) { res.status(500).send("Error reading"); }
});

app.get("/put", async (req, res) => {
  const path = req.query.path || "/Starter";
  const key = req.query.key;
  const value = req.query.value;
  if (!key) return res.status(400).send("Missing key");
  
  try {
    const fbRes = await fetchWithRetry(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    res.json(await fbRes.json());
  } catch (err) { res.status(500).send("Error writing"); }
});

app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) return res.status(400).send("Missing message");

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);
  const flatKey = `${istTime.toISOString().split("T")[0]} ${istTime.toTimeString().split(" ")[0]}`;

  try {
    await fetchWithRetry(`${BASE_URL}/notification/${encodeURIComponent(flatKey)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    await fetchWithRetry(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifi: message }),
    });

    // Cleanup logic
    const allNotificationsRes = await fetchWithRetry(`${BASE_URL}/notification.json`);
    const allNotifications = await allNotificationsRes.json();
    if (allNotifications) {
      const allDatesSet = new Set();
      for (const key of Object.keys(allNotifications)) allDatesSet.add(key.split(" ")[0]);
      const datesToKeep = Array.from(allDatesSet).sort().reverse().slice(0, 2);
      for (const key of Object.keys(allNotifications)) {
        if (!datesToKeep.includes(key.split(" ")[0])) {
          await fetchWithRetry(`${BASE_URL}/notification/${encodeURIComponent(key)}.json`, { method: "DELETE" });
        }
      }
    }
    res.send("Notification Logged");
  } catch (err) { res.status(500).send("Error"); }
});

app.get("/online", async (req, res) => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);
  const timestamp = `"Online: ${istTime.toISOString().split("T")[0]} ${istTime.toTimeString().split(" ")[0]}"`;
  
  try {
    await fetchWithRetry(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online_time: timestamp }),
    });
    res.send(`Logged: ${timestamp}`);
  } catch (e) {
    res.status(500).send("Error logging time");
  }
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));

// Self-ping with error handling
setInterval(() => {
  fetchWithRetry(`https://starter-a2t3.onrender.com`)
    .catch(() => console.log("Self-ping skipped"));
}, 280000);
