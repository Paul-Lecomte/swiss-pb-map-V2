const asyncHandler = require('express-async-handler');
const Stops = require("../model/stopsModel");
const ProcessedStop = require("../model/processedStopsModel");

const getAllStops = asyncHandler(async (req, res) => {
    try {
        const stops = await Stops.find({});
        res.status(200).json(stops);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch stops', error: error.message });
    }
});

// get the stops in a bounding box
// bbox = "minLng,minLat,maxLng,maxLat"
const getStopsInBbox = asyncHandler(async (req, res) => {
    const { bbox, zoom } = req.query; // bbox = "minLng,minLat,maxLng,maxLat"
    if (!bbox) return res.status(400).json({ error: "bbox manquant" });

    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);

    const stops = await ProcessedStop.find({
        stop_lon: { $gte: minLng, $lte: maxLng },
        stop_lat: { $gte: minLat, $lte: maxLat }
    }).limit(zoom < 10 ? 100 : 1000);

    res.json({
        type: "FeatureCollection",
        features: stops.map(stop => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [stop.stop_lon, stop.stop_lat]
            },
            properties: {
                stop_id: stop.stop_id,
                stop_name: stop.stop_name,
                stop_lat: stop.stop_lat,
                stop_lon: stop.stop_lon,
                location_type: stop.location_type,
                parent_station: stop.parent_station,
                routes: stop.routes || []
            }
        }))
    });
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeText = (value) =>
    (value || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

const scoreStopMatch = (stop, queryNorm) => {
    const nameNorm = normalizeText(stop.stop_name);
    let score = 0;
    if (nameNorm === queryNorm) score += 100;
    if (nameNorm.startsWith(queryNorm)) score += 60;
    if (nameNorm.includes(` ${queryNorm}`)) score += 40;
    if (nameNorm.includes(queryNorm)) score += 30;
    if (nameNorm.includes("gare") && nameNorm.includes(queryNorm)) score += 15;
    if (Number(stop.location_type) === 1) score += 10;
    if (!stop.parent_station) score += 5;
    return score;
};

const searchProcessedStops = asyncHandler(async (req, res) => {
    const { q, type } = req.query;
    if (!q) return res.status(400).json({ error: "Research parameter not found" });

    const queryNorm = normalizeText(q);
    const regex = new RegExp(escapeRegex(queryNorm), "i");
    const query = { stop_name: { $regex: regex } };
    if (type) query.location_type = type;

    const stops = await ProcessedStop.find(query).limit(50);
    const ranked = stops
        .map((stop) => ({ stop, score: scoreStopMatch(stop, queryNorm) }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const nameA = a.stop.stop_name || "";
            const nameB = b.stop.stop_name || "";
            if (nameA.length !== nameB.length) return nameA.length - nameB.length;
            return nameA.localeCompare(nameB);
        })
        .slice(0, 10)
        .map(({ stop }) => ({
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            stop_lat: stop.stop_lat,
            stop_lon: stop.stop_lon,
            location_type: stop.location_type,
            parent_station: stop.parent_station,
            routes: stop.routes || []
        }));

    res.json(ranked);
});

module.exports = {
    getAllStops,
    getStopsInBbox,
    searchProcessedStops
};