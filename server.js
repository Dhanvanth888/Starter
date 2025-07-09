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
  require("node-fetch")(`https://${process.env.PROJECT_DOMAIN}.glitch.me`)
    .then(res => console.log("🔄 Self-ping success"))
    .catch(err => console.error("❌ Self-ping error", err));
}, 280000); // Every ~4.5 minutes (under 5)


app.get("/notify", async (req, res) => {
  const message = req.query.message;
  if (!message) {
    return res.status(400).send("❌ Missing message");
  }

  // Get current date and time
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // e.g., "2025-07-09"
  const time = now.toTimeString().split(" ")[0]; // e.g., "21:38:02"

  const path = `/notification/${date}`;
  const body = { [time]: message };

  try {
    // 1️⃣ Log the new notification
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // 2️⃣ Fetch all notification dates
    const allDatesRes = await fetch(`${BASE_URL}/notification.json`);
    const allDates = await allDatesRes.json();

    if (allDates) {
      const dateKeys = Object.keys(allDates).sort().reverse(); // latest first

      // 3️⃣ Keep only latest 2
      const toDelete = dateKeys.slice(2); // older than 2 latest dates

      for (const oldDate of toDelete) {
        await fetch(`${BASE_URL}/notification/${oldDate}.json`, {
          method: "DELETE",
        });
      }
    }

    res.send(`✅ Notification logged and old entries cleaned (kept last 2 days)`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log or cleanup notification");
  }
});
