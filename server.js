const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const hbs = require("hbs");

const app = express();
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

const PORT = process.env.PORT || 3000;
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com";

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "src/pages"));
app.use(express.static(path.join(__dirname, "public")));

// Home Route
app.get("/", (req, res) => {
  res.render("index");
});

/**
 * ⚡ ESP32 UPDATE ROUTE
 */
app.post("/update-esp32", async (req, res) => {
  const val_v1 = req.body.V1 || req.body.v1 || "0";
  const val_v2 = req.body.V2 || req.body.v2 || "0";
  const val_v3 = req.body.V3 || req.body.v3 || "0";
  const val_amps = req.body.amps || req.body.Amps || "0.00";

  try {
    // Save to Firebase
    await fetch(`${BASE_URL}/Starter.json`, {
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

    // Read controls to return
    const controlRes = await fetch(`${BASE_URL}/Starter.json`);
    const dbData = await controlRes.json();

    res.json({
      M1: dbData.M1 || "0",       
      M2: dbData.M2 || "0",       
      on_time: dbData.on_time || "0", 
      off_time: dbData.off_time || "0",
      stop: dbData.stop || "0",
      device: dbData.device || "0" // Added device to response
    }); 
  } catch (err) {
    console.error("ESP32 Sync Error:", err);
    res.status(500).send("Error syncing");
  }
});

// --- UTILITY ROUTES ---

app.get("/get", async (req, res) => {
  const path = req.query.path || "/Starter"; 
  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`);
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
    const fbRes = await fetch(`${BASE_URL}${path}.json`, {
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
    await fetch(`${BASE_URL}/notification/${encodeURIComponent(flatKey)}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    await fetch(`${BASE_URL}/Starter.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifi: message }),
    });

    // Cleanup logic (Keep 2 days)
    const allNotificationsRes = await fetch(`${BASE_URL}/notification.json`);
    const allNotifications = await allNotificationsRes.json();
    if (allNotifications) {
      const allDatesSet = new Set();
      for (const key of Object.keys(allNotifications)) allDatesSet.add(key.split(" ")[0]);
      const datesToKeep = Array.from(allDatesSet).sort().reverse().slice(0, 2);
      for (const key of Object.keys(allNotifications)) {
        if (!datesToKeep.includes(key.split(" ")[0])) {
          await fetch(`${BASE_URL}/notification/${encodeURIComponent(key)}.json`, { method: "DELETE" });
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
  
  await fetch(`${BASE_URL}/Starter.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ online_time: timestamp }),
  });
  res.send(`Logged: ${timestamp}`);
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));

setInterval(() => {
  fetch(`https://starter-a2t3.onrender.com`).catch(() => {});
}, 280000);
