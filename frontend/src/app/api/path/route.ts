import { NextResponse } from "next/server";

const PY_API_BASE_URL = (process.env.PY_API_BASE_URL || process.env.NEXT_PUBLIC_PY_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${PY_API_BASE_URL}/path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const contentType = res.headers.get("content-type") || "application/json";
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

