// ============================================================
// Maps Routes — /api/maps/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  searchNearbyPlaces,
  searchPlacesByText,
  getPlaceDetails,
} = require("../services/google.service");

router.use(authMiddleware);

router.post("/nearby", async (req, res) => {
  const { query, latitude, longitude, radius = 3000, locationText } = req.body;
  if (!query) return res.status(400).json({ error: "query is required." });

  try {
    const places = latitude != null && longitude != null
      ? await searchNearbyPlaces({ query, latitude, longitude, radius })
      : await searchPlacesByText({ query, locationText });

    res.json({ places });
  } catch (err) {
    console.error("Nearby places error:", err.message);
    res.status(500).json({ error: err.message || "Failed to search nearby places." });
  }
});

router.get("/place/:placeId", async (req, res) => {
  try {
    const place = await getPlaceDetails(req.params.placeId);
    res.json(place);
  } catch (err) {
    console.error("Place details error:", err.message);
    res.status(500).json({ error: err.message || "Failed to fetch place details." });
  }
});

module.exports = router;
