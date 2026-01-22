const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const hbs = require("hbs"); // 1. Add handlebars support

const app = express();
app.use(express.json()); // for JSON body support
app.use(express.urlencoded({ extended: true })); // for form data

const PORT = process.env.PORT || 3000;

// 🧠 Your Firebase database URL
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com";

// 2. Setup Handlebars
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/pages")); // Ensure your hbs file is in src/pages/
app.use(express.static(path.join(__dirname, "public")));

// 🏁 Home route - Renders the Dashboard
app.get("/", (req, res) => {
  res.render("index");
});

/**
 * ⚡ ESP32 SYNC ROUTE
 * ESP32 sends: { "V1": "230", "amps": "5.0", ... }
 * Server saves to DB and replies with Motor Status
 */
app.post("/update-esp32", async (req, res) => {
  // Destructure with fallbacks for safety
  const v1 = req.body.V1 || req.body.v1 || "0";
  const v2 = req.body.V2 || req.body.v2 || "0";
  const v3 = req.body.V3 || req.body.v3 || "0";
  const amps = req.body.amps || "0.00";

  try {
    // 1. Save sensors to '/Starter' (Merging with existing data)
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        V1: v1, 
        V2: v2, 
        V3: v3, 
        amps: amps, 
        last_update: Date.now() 
      }),
    });

    // 2. Read latest control states (M1, M2, timers)
    const controlRes = await fetch(`${BASE_URL}/Starter.json`);
    const dbData = await controlRes.json();

    // 3. Return command to ESP32
    res.json({
      M1: dbData.M1 || "0",
      M2: dbData.M2 || "0",
      on_time: dbData.on_time || "0",
      off_time: dbData.off_time || "0",
      stop: dbData.stop || "0"
    }); 
  } catch (err) {
    console.error("ESP32 Sync Error:", err);
    res.status(500).send("Error syncing");
  }
});

// ✅ Read from Firebase (Utility)
app.get("/get", async (req, res) => {
  const path = req.query.path || "/Starter"; 
  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`);
    const data = await fbRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).send("Error reading from Firebase");
  }
});

// ✏️ Update (PUT) data (Utility)
app.get("/put", async (req, res) => {
  const path = req.query.path || "/Starter";
  const key = req.query.key;
  const value = req.query.value;

  if (!key || typeof value === "undefined") {
    return res.status(400).send("Missing key or value");
  }

  const body = { [key]: value };

  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await fbRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).send("Error putting to Firebase");
  }
});

// 🔔 Notification Route (With Auto-Cleanup)
app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) return res.status(400).send("❌ Missing message");

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);

  const date = istTime.toISOString().split("T")[0];
  const time = istTime.toTimeString().split(" ")[0];

  const flatKey = `${date} ${time}`;
  const path = `/notification/${encodeURIComponent(flatKey)}`;

  try {
    // 1. Save notification
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    
    // 2. Update latest notification in dashboard
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifi: message }),
    });

    // 3. Clean old notifications (Keep 2 days)
    const allNotificationsRes = await fetch(`${BASE_URL}/notification.json`);
    const allNotifications = await allNotificationsRes.json();

    if (allNotifications) {
      const allDatesSet = new Set();
      for (const key of Object.keys(allNotifications)) {
        allDatesSet.add(key.split(" ")[0]);
      }
      const datesToKeep = Array.from(allDatesSet).sort().reverse().slice(0, 2);

      for (const key of Object.keys(allNotifications)) {
        if (!datesToKeep.includes(key.split(" ")[0])) {
          await fetch(`${BASE_URL}/notification/${encodeURIComponent(key)}.json`, { method: "DELETE" });
        }
      }
    }

    res.send(`✅ Notification logged at ${flatKey}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log/clean notification");
  }
});

// 🟢 Online Logger
app.get("/online", async (req, res) => {
  try {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const istTime = new Date(utc + 5.5 * 60 * 60000);
    const date = istTime.toISOString().split("T")[0];
    const time = istTime.toTimeString().split(" ")[0];
    const timestamp = `"Online: ${date} ${time}"`;

    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online_time: timestamp }),
    });

    res.send(`✅ Logged ${timestamp}`);
  } catch (err) {
    res.status(500).send("❌ Failed to log online time");
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});

// Self-ping to keep Render awake
setInterval(() => {
  require("node-fetch")(`https://starter-a2t3.onrender.com`)
    .then(res => console.log("🔄 Self-ping success"))
    .catch(err => console.error("❌ Self-ping error", err));
}, 280000);
