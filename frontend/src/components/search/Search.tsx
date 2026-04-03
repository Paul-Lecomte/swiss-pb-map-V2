import React, { useState, useEffect } from "react";
import { searchProcessedStops } from "@/services/StopsApiCalls";
import "./Search.css";

type Stop = {
    stop_id: string;
    stop_name: string;
    location_type?: string;
    stop_lat?: number;
    stop_lon?: number;
};

type Props = {
    onHamburger?: () => void;
    onStopSelect?: (stop: Stop) => void;
    onAvatarClick?: () => void;
};

const typeIcons: Record<string, string> = {
    train: "🚆",
    bus: "🚌",
    metro: "🚇",
    boat: "⛴️",
};

export default function Search({ onHamburger, onStopSelect, onAvatarClick }: Props) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<Stop[]>([]);
    const [type, setType] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);

    useEffect(() => {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length < 2) {
            setSuggestions([]);
            setIsLoading(false);
            setActiveIndex(-1);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        const timer = setTimeout(() => {
            searchProcessedStops(normalizedQuery, type)
            .then(data => {
                if (!cancelled) {
                    setSuggestions(Array.isArray(data) ? data : []);
                    setActiveIndex(-1);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSuggestions([]);
                    setActiveIndex(-1);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });
        }, 220);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, type]);

    const handleSelect = (stop: Stop) => {
        setQuery("");
        setSuggestions([]);
        setActiveIndex(-1);
        if (onStopSelect) onStopSelect(stop);
        try {
            window.dispatchEvent(new CustomEvent("app:stop-select", { detail: stop }));
        } catch {}
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!suggestions.length) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((previous) => (previous + 1) % suggestions.length);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((previous) => (previous <= 0 ? suggestions.length - 1 : previous - 1));
            return;
        }

        if (event.key === "Enter") {
            if (activeIndex < 0 || activeIndex >= suggestions.length) return;
            event.preventDefault();
            handleSelect(suggestions[activeIndex]);
            return;
        }

        if (event.key === "Escape") {
            setSuggestions([]);
            setActiveIndex(-1);
        }
    };

    const showSuggestions = suggestions.length > 0;
    const showNoResults = query.trim().length >= 2 && !isLoading && suggestions.length === 0;

    return (
        <div className="search-bar">
            <button
                onClick={onHamburger}
                aria-label="Menu"
                className="search-hamburger"
            >
                <div className="search-hamburger-icon">
                    <div />
                    <div />
                    <div />
                </div>
            </button>
            <input
                placeholder="search for a station"
                className="search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="search-station-suggestions"
                aria-activedescendant={activeIndex >= 0 ? `search-stop-${activeIndex}` : undefined}
            />
            {!!query && (
                <button
                    type="button"
                    className="search-clear"
                    onClick={() => {
                        setQuery("");
                        setSuggestions([]);
                        setActiveIndex(-1);
                    }}
                    aria-label="Clear search"
                >
                    Clear
                </button>
            )}
            <select
                className="search-type-select"
                value={type}
                onChange={e => setType(e.target.value)}
            >
                <option value="">All</option>
                <option value="train">Train</option>
                <option value="bus">Bus</option>
                <option value="metro">Metro</option>
                <option value="boat">Boat</option>
            </select>
            <div className="search-magnifier">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </div>
            <button
                aria-label="Fastest path search"
                className="search-avatar"
                type="button"
                onClick={onAvatarClick}
            >
                <img src="/fastest_path.png" alt="Fastest path" className="h-4 w-4 object-contain" draggable={false} />
            </button>
            {isLoading && (
                <div className="search-loading" aria-live="polite">Searching stations...</div>
            )}
            {showSuggestions && (
                <ul className="search-suggestions" id="search-station-suggestions" role="listbox">
                    {suggestions.map((stop, index) => (
                        <li
                            key={stop.stop_id}
                            id={`search-stop-${index}`}
                            role="option"
                            aria-selected={activeIndex === index}
                            className={`search-suggestion-item ${activeIndex === index ? "active" : ""}`}
                        >
                            <button
                                type="button"
                                className="search-suggestion-button"
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => handleSelect(stop)}
                            >
                                <span className="suggestion-icon">
                                    {typeIcons[stop.location_type ?? ""] ?? "📍"}
                                </span>
                                <span className="suggestion-name">{stop.stop_name}</span>
                                {stop.location_type && (
                                    <span className="suggestion-type">{stop.location_type}</span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {showNoResults && (
                <div className="search-no-results">No stations found. Try another name.</div>
            )}
        </div>
    );
}