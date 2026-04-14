"use client";

import L from "leaflet";
import { createControlComponent } from "@react-leaflet/core";
import "./ZoomControl.css";

const ZoomControlLeaflet = L.Control.extend({
  options: {
    position: "topright",
  },

  onAdd: function (map: any) {
    const container = L.DomUtil.create("div", "zoom-control");

    // Prevent map from moving when clicking on the control
    L.DomEvent.disableClickPropagation(container);

    // Zoom-in button
    const zoomInBtn = L.DomUtil.create("button", "", container);
    zoomInBtn.innerHTML = "+";
    zoomInBtn.onclick = () => map.zoomIn();

    // Zoom slider
    const slider = L.DomUtil.create("input", "zoom-slider", container) as HTMLInputElement;
    slider.type = "range";
    slider.min = map.getMinZoom().toString();
    slider.max = map.getMaxZoom().toString();
    slider.value = map.getZoom().toString();
    slider.oninput = (e: any) => map.setZoom(Number(e.target.value));

    // Keep the slider value synced with the current zoom level
    map.on("zoomend", () => {
      slider.value = map.getZoom().toString();
    });

    // Zoom-out button
    const zoomOutBtn = L.DomUtil.create("button", "", container);
    zoomOutBtn.innerHTML = "−";
    zoomOutBtn.onclick = () => map.zoomOut();

    // Recenter button (user location)
    const centerBtn = L.DomUtil.create("button", "", container);
    centerBtn.innerHTML = "●";
    centerBtn.title = "Recenter on your location";

    // Recenter map on user's position when the button is clicked
    centerBtn.onclick = () => {
      try {
        window.dispatchEvent(new CustomEvent("app:user-location-request"));
      } catch {}

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
              map.setView(coords, Math.max(map.getZoom(), 15));
            },
            (err) => {
              console.warn("Geolocation error:", err.message);
              alert("User location not available");
            },
            {
              enableHighAccuracy: true,
              maximumAge: 2000,
              timeout: 10000,
            }
        );
      } else {
        alert("User location not available");
      }
    };

    return container;
  },
});

// Convert to React component
const ZoomControl = createControlComponent(
    (props: any) => new ZoomControlLeaflet(props) as any
);

export default ZoomControl;