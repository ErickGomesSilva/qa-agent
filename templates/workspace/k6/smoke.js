import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS || 1),
  duration: __ENV.K6_DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
    checks: ["rate>0.95"],
  },
};

const BASE = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const extra = __ENV.K6_ROUTES ? JSON.parse(__ENV.K6_ROUTES) : [];

export default function () {
  if (!BASE) {
    throw new Error("BASE_URL ausente — configure a URL no QA Agent");
  }
  const paths = ["", ...extra.filter((p) => typeof p === "string" && p.startsWith("/"))];
  const seen = new Set();
  for (const path of paths) {
    const url = path ? `${BASE}${path}` : `${BASE}/`;
    if (seen.has(url)) continue;
    seen.add(url);
    const res = http.get(url, { tags: { name: path || "/" } });
    check(res, {
      [`${path || "/"} status 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
    });
  }
  sleep(0.3);
}
