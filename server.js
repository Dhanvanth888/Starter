const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const hbs = require("hbs");

const app = express();
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

const PORT = process.env.PORT || 3000;

// 🔴 Your Firebase Database URL
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com";

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/pages"));
app.use(express.static(path.join(__dirname, "public")));

// Dashboard Route
app.get("/", (req, res) => {
  res.render("index");
});

/**
 * ⚡ ESP32 UPDATE ROUTE (FIXED)
 * Now saves v1, v2, v3, amps into 'Starter' so the dashboard can see it.
 */
app.post("/update-esp32", async (req, res) => {
  const { v1, v2, v3, amps } = req.body;
  
  try {
    // 1. Save sensor data directly to 'Starter' node
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v1, v2, v3, amps, last_update: Date.now() }),
    });

    // 2. Read control states to send back to ESP32
    const controlRes = await fetch(`${BASE_URL}/Starter.json`);
    const controls = await controlRes.json();

    res.json(controls); 
  } catch (err) {
    console.error("ESP32 Update Error:", err);
    res.status(500).send("Error syncing with Firebase");
  }
});

// --- EXISTING UTILITY ROUTES ---

app.get("/get", async (req, res) => {
  const path = req.query.path || "/Starter"; 
  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`);
    const data = await fbRes.json();
    res.json(data);
  } catch (err) { res.status(500).send("Error reading from Firebase"); }
});

app.get("/put", async (req, res) => {
  const path = req.query.path || "/Starter";
  const key = req.query.key;
  const value = req.query.value;
  if (!key || typeof value === "undefined") return res.status(400).send("Missing key or value");
  const body = { [key]: value };
  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    res.json(await fbRes.json());
  } catch (err) { res.status(500).send("Error putting to Firebase"); }
});

app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) return res.status(400).send("❌ Missing message");

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);
  const flatKey = `${istTime.toISOString().split("T")[0]} ${istTime.toTimeString().split(" ")[0]}`;
  
  try {
    await fetch(`${BASE_URL}/notification/${encodeURIComponent(flatKey)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    // Update pointer in Starter
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifi: message }),
    });
    res.send(`✅ Notification logged`);
  } catch (err) { res.status(500).send("❌ Failed to log notification"); }
});

app.get("/online", async (req, res) => {
  // Simple online logger
  const now = new Date().toISOString();
  await fetch(`${BASE_URL}/Starter.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ online_time: now }),
  });
  res.send("✅ Logged online time");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Self-ping
setInterval(() => {
  fetch(`https://starter-a2t3.onrender.com`).catch(() => {});
}, 280000);
