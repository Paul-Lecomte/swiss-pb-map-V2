"use client";

import React from "react";

type Props = {
    onClose?: () => void;
    onLayerOption?: () => void;
    onStation?: () => void;
    onOption?: () => void;
    onAbout?: () => void;
};

export default function SideMenu({ onClose, onLayerOption, onStation, onOption, onAbout }: Props) {
    const items = [
        { label: "Layer options", onClick: onLayerOption },
        { label: "Stations", onClick: onStation },
        { label: "Options", onClick: onOption },
        { label: "About", onClick: onAbout },
    ];

    return (
        <div className="polish-panel w-[188px] rounded-2xl p-3 text-slate-800 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
                <strong className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Menu</strong>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:border-slate-300"
                >
                    x
                </button>
            </div>
            <ul className="m-0 list-none p-0 text-sm">
                {items.map((item) => (
                    <li key={item.label}>
                        <button
                            onClick={item.onClick}
                            className="polish-card mt-1 w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100"
                        >
                            {item.label}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
