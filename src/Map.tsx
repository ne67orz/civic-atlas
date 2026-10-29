import { useEffect, useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { STATES } from "../shared/states";
import type { County, Profile, Result, VoteResult } from "../shared/schema";
import { candidateColor, Swatch } from "./appearance";
export default function ElectionMap({
  result,
  candidates,
  counties,
  onSelect,
}: {
  result: Result | null;
  candidates: Profile[];
  counties: County[];
  onSelect: (r: VoteResult) => void;
}) {
  const [topology, setTopology] = useState<any>(null),
    [layer, setLayer] = useState("county"),
    [mode, setMode] = useState("winner"),
    [zoom, setZoom] = useState(1),
    [hover, setHover] = useState("Explore the map · select a state or county");
  useEffect(() => {
    fetch("/data/counties-10m.json")
      .then((r) => r.json())
      .then(setTopology)
      .catch(() =>
        setHover(
          "Map unavailable. Results remain available in the state table.",
        ),
      );
  }, []);
  const path = useMemo(
    () => geoPath(geoAlbersUsa().scale(1170).translate([490, 300])),
    [],
  );
  const geo = useMemo(
    () =>
      topology
        ? (
            feature(
              topology,
              topology.objects[layer === "county" ? "counties" : "states"],
            ) as any
          ).features
        : [],
    [topology, layer],
  );
  const rows = useMemo(
    () =>
      new Map(
        (layer === "county" ? result?.counties : result?.states)?.map((r) => [
          r.id,
          r,
        ]),
      ),
    [result, layer],
  );
  const label = (id: string) =>
    layer === "county"
      ? counties.find((c) => c.fips === id)?.name || "No county-level data"
      : STATES.find((s) => s.fips === id)?.name || id;
  const getRow = (id: string) =>
    rows.get(
      layer === "county" ? id : STATES.find((s) => s.fips === id)?.abbr || "",
    );
  return (
    <div className="map-wrap">
      <div className="map-controls">
        <div className="segmented" aria-label="Map geography">
          {["county", "state"].map((x) => (
            <button
              key={x}
              aria-pressed={layer === x}
              onClick={() => setLayer(x)}
            >
              {x === "county" ? "Counties" : "States"}
            </button>
          ))}
        </div>
        <select
          aria-label="Map color measure"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="winner">Winning candidate</option>
          <option value="margin">Victory margin</option>
        </select>
        <div className="zoom">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          >
            −
          </button>
          <button aria-label="Reset zoom" onClick={() => setZoom(1)}>
            Reset
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(Math.min(3, zoom + 0.5))}
          >
            +
          </button>
        </div>
      </div>
      <div className="map-scroll">
        <svg
          className={"zoom" + zoom * 10}
          viewBox="0 0 980 590"
          role="img"
          aria-label="Interactive United States election map. All state results also available in the table."
        >
          <g>
            {geo.map((f: any) => {
              const id = String(f.id).padStart(layer === "county" ? 5 : 2, "0"),
                row = getRow(id),
                color = row
                  ? candidateColor(candidates[row.winner], row.winner)
                  : "#dce4df";
              const title =
                label(id) +
                (row
                  ? ` · ${candidates[row.winner]?.name} +${(row.margin * 100).toFixed(1)}%`
                  : " · no simulated result");
              return (
                <path
                  key={id}
                  d={path(f) || ""}
                  fill={color}
                  fillOpacity={
                    mode === "margin" && row?.margin !== undefined
                      ? 0.25 + Math.min(row.margin * 2, 0.75)
                      : 1
                  }
                  stroke={layer === "county" ? "#f7f6f0" : "#fff"}
                  strokeWidth={layer === "county" ? 0.22 : 0.7}
                  tabIndex={layer === "state" ? 0 : undefined}
                  role="button"
                  aria-label={title}
                  onMouseEnter={() => setHover(title)}
                  onFocus={() => setHover(title)}
                  onClick={() => row && onSelect(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && row) onSelect(row);
                  }}
                >
                  <title>{title}</title>
                </path>
              );
            })}
            {topology && (
              <path
                d={
                  path(
                    mesh(topology, topology.objects.states, (a, b) => a !== b),
                  ) || ""
                }
                fill="none"
                stroke="#f7f6f0"
                strokeWidth="1.1"
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      </div>
      <div className="map-caption" aria-live="polite">
        {hover}
      </div>
      <div className="legend">
        {candidates.map((c, i) => (
          <span key={i}>
            <Swatch color={candidateColor(c, i)} />
            {String.fromCharCode(65 + i)} · {c.name}
          </span>
        ))}
        <span>AK: statewide aggregate</span>
      </div>
    </div>
  );
}
