const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const hbs = require("hbs");

const app = express();
app.use(express.json()); // for JSON body support
app.use(express.urlencoded({ extended: true })); // for form data

const PORT = process.env.PORT || 3000;

// Your Firebase database URL
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com";

// Setup Handlebars for the webpage
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/pages"));
app.use(express.static(path.join(__dirname, "public")));

/**
 * MOBILE DASHBOARD ROUTE
 */
app.get("/", (req, res) => {
  res.render("index");
});

/**
 * ESP32 INTEGRATION ROUTE
 * ESP32 sends: { "v1": 12.5, "v2": 12.0, "v3": 5.0, "amps": 1.2 }
 * Server responds with: { "m1": "OFF", "m2": "ON", "timer": "00:30:00" }
 */
app.post("/update-esp32", async (req, res) => {
  const { v1, v2, v3, amps } = req.body;

  try {
    // 1. Save sensor data to Firebase
    await fetch(`${BASE_URL}/telemetry.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v1, v2, v3, amps, last_update: Date.now() }),
    });

    // 2. Read control states to send back to ESP32
    const controlRes = await fetch(`${BASE_URL}/Starter.json`);
    const controls = await controlRes.json();

    // 3. Send controls back to ESP32
    res.json(controls); 
  } catch (err) {
    console.error("ESP32 Update Error:", err);
    res.status(500).send("Error syncing with Firebase");
  }
});

/**
 * --- EXISTING UTILITY ROUTES ---
 */

// Read from Firebase
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

// Update (PUT/PATCH) data in Firebase
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

// Notification Route
app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) return res.status(400).send("❌ Missing message");

  // Convert to IST (UTC+5:30)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);

  const date = istTime.toISOString().split("T")[0];
  const time = istTime.toTimeString().split(" ")[0];

  const flatKey = `${date} ${time}`;
  const path = `/notification/${encodeURIComponent(flatKey)}`;

  try {
    // 1. Save new notification
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    // Update latest notification pointer
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifi: message }),
    });

    // 2. Clean old notifications (Keep 2 days)
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

    res.send(`✅ Notification logged at ${flatKey} (IST)`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log or clean notification");
  }
});

// Online Status Route
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

    res.send(`✅ Logged current time ${timestamp}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log online time");
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});

// Self-ping to keep Render awake
setInterval(() => {
  fetch(`https://starter-a2t3.onrender.com`)
    .then(res => console.log("🔄 Self-ping success"))
    .catch(err => console.error("❌ Self-ping error", err));
}, 280000);
