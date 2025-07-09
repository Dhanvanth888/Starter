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

  const path = `/notification/${date}`;
  const body = { [time]: message };

  try {
    // 1️⃣ Save new notification
    await fetch(`${BASE_URL}${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // 2️⃣ Fetch all existing notification days
    const allDatesRes = await fetch(`${BASE_URL}/notification.json`);
    const allDates = await allDatesRes.json();

    if (allDates) {
      const dateKeys = Object.keys(allDates).sort().reverse(); // latest first
      const toDelete = dateKeys.slice(2); // keep only latest 2 dates

      for (const oldDate of toDelete) {
        await fetch(`${BASE_URL}/notification/${oldDate}.json`, {
          method: "DELETE",
        });
      }
    }

    res.send(`✅ Notification logged at ${date} ${time} (IST), and old entries cleaned`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to log or clean notification");
  }
});
