import React, { useState } from "react";

interface MapLayerSwitcherProps {
    selectedLayer: string;
    onChange: (layer: string) => void;
}

const layers = [
    {
        name: "Light",
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        attribution: "&copy; CARTO & OSM",
        thumbnail: "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/6/32/21.png",
        maxZoom: 17, // Carto basemaps support up to 20
    },
    {
        name: "Dark",
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: "&copy; CARTO & OSM",
        thumbnail: "https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/6/32/21.png",
        maxZoom: 17,
    },
    {
        name: "Streets",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OSM",
        thumbnail: "https://tile.openstreetmap.org/6/32/21.png",
        maxZoom: 17, // OSM standard supports up to 19
    },
    {
        name: "Satellite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "© ESRI",
        thumbnail: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/21/32",
        maxZoom: 17, // ESRI World Imagery supports up to 17
    },
];

const MapLayerSwitcher: React.FC<MapLayerSwitcherProps> = ({ selectedLayer, onChange }) => {
    const [open, setOpen] = useState(false);

    const selected = layers.find(l => l.name === selectedLayer) || layers[0];

    return (
        <div
            style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                zIndex: 1000,
                background: "rgba(255,255,255,0.95)",
                padding: "6px",
                borderRadius: "12px",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.12)"
            }}
        >
            {/* Collapsed button */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open map layer switcher"
                    title="Change map style"
                    style={{
                        width: "70px",
                        height: "70px",
                        borderRadius: "6px",
                        overflow: "hidden",
                        cursor: "pointer",
                        border: "1px solid #ccc",
                        position: "relative",
                        padding: 0,
                        background: "transparent"
                    }}
                >
                    <img
                        src={selected.thumbnail}
                        alt={selected.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: "rgba(0,0,0,0.6)",
                            color: "white",
                            fontSize: "12px",
                            textAlign: "center",
                            padding: "2px"
                        }}
                    >
                        {selected.name}
                    </div>
                </button>
            )}

            {/* Expanded menu */}
            {open && (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569" }}>
                            Map style
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close map layer switcher"
                            style={{
                                border: "1px solid #d5dce5",
                                borderRadius: "999px",
                                background: "white",
                                color: "#475569",
                                fontSize: "11px",
                                padding: "2px 8px",
                                cursor: "pointer"
                            }}
                        >
                            Close
                        </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {layers.map((layer) => (
                            <button
                                key={layer.name}
                                type="button"
                                onClick={() => {
                                    onChange(layer.name);
                                    setOpen(false);
                                }}
                                aria-pressed={layer.name === selectedLayer}
                                title={`Use ${layer.name} map`}
                                style={{
                                    width: "70px",
                                    height: "70px",
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                    cursor: "pointer",
                                    border: layer.name === selectedLayer ? "3px solid #0078D7" : "1px solid #ccc",
                                    position: "relative",
                                    padding: 0,
                                    background: "transparent"
                                }}
                            >
                                <img
                                    src={layer.thumbnail}
                                    alt={layer.name}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                                <div
                                    style={{
                                        position: "absolute",
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        background: "rgba(0,0,0,0.6)",
                                        color: "white",
                                        fontSize: "12px",
                                        textAlign: "center",
                                        padding: "2px"
                                    }}
                                >
                                    {layer.name}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export { layers };
export default MapLayerSwitcher;