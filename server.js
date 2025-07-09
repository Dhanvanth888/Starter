const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json()); // for JSON body support
const PORT = process.env.PORT || 3000;

// 🧠 Your Firebase database URL
const BASE_URL = "https://starter-2cedf-default-rtdb.firebaseio.com"; // <-- no .json here

// ✅ Read from Firebase
app.get("/get", async (req, res) => {
  const path = req.query.path || "/Starter"; // Default path: /starter
  try {
    const fbRes = await fetch(`${BASE_URL}${path}.json`);
    const data = await fbRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).send("Error reading from Firebase");
  }
});



// ✏️ Update (PUT) data in Firebase
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

// 🏁 Home route
app.get("/", (req, res) => {
  res.send("✅ Firebase Proxy Online (GET /get | POST /post | PUT /put)");
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
setInterval(() => {
  require("node-fetch")(`https://starter-a2t3.onrender.com`)
    .then(res => console.log("🔄 Self-ping success"))
    .catch(err => console.error("❌ Self-ping error", err));
}, 280000); // Every ~4.5 minutes (under 5)


app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.status(400).send("❌ Missing message");
  }

  // Convert to IST (UTC+5:30)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 60 * 60000);

  const date = istTime.toISOString().split("T")[0]; // e.g., "2025-07-09"
  const time = istTime.toTimeString().split(" ")[0]; // e.g., "21:38:02"

  const flatKey = `${date} ${time}`;
  const path = `/notification/${encodeURIComponent(flatKey)}`;

  try {
    // 1️⃣ Save new notification
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    // 2️⃣ Fetch all notifications
    const allNotificationsRes = await fetch(`${BASE_URL}/notification.json`);
    const allNotifications = await allNotificationsRes.json();

    if (allNotifications) {
      // Extract unique dates from keys
      const allDatesSet = new Set();
      for (const key of Object.keys(allNotifications)) {
        const keyDate = key.split(" ")[0]; // get YYYY-MM-DD from "YYYY-MM-DD HH:mm:ss"
        allDatesSet.add(keyDate);
      }

      // Sort dates descending
      const allDates = Array.from(allDatesSet).sort().reverse();

      // Keep latest 2 dates only
      const datesToKeep = allDates.slice(0, 2);

      // Delete notifications not in datesToKeep
      for (const key of Object.keys(allNotifications)) {
        const keyDate = key.split(" ")[0];
        if (!datesToKeep.includes(keyDate)) {
          await fetch(`${BASE_URL}/notification/${encodeURIComponent(key)}.json`, {
            method: "DELETE",
          });
        }
      }
    }

    res.send(`✅ Notification logged at ${flatKey} (IST), and old days cleaned`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log or clean notification");
  }
});
app.get("/online", async (req, res) => {
  try {
    // Get current IST time string
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const istTime = new Date(utc + 5.5 * 60 * 60000);
    const date = istTime.toISOString().split("T")[0];
    const time = istTime.toTimeString().split(" ")[0];
    const timestamp = `${date} ${time}`;

    // Prepare PATCH body
    const path = `/Starter`;
    const body = { online_time: timestamp };

    // Send PATCH request to Firebase
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    res.send(`✅ Logged current time ${timestamp} to /Starter/online_time`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log online time");
  }
});


