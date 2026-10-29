import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Globe2,
  SlidersHorizontal,
  KeyRound,
  Download,
  Link,
  Play,
  Check,
  Info,
  RotateCcw,
} from "lucide-react";
import Map from "./Map";
import {
  EnvironmentSchema,
  InputSchema,
  Name,
  ProfileSchema,
  type County,
  type Environment,
  type Input,
  type Profile,
  type Result,
  type VoteResult,
} from "../shared/schema";
import { DEFAULT_ENV, STATES } from "../shared/states";
import { hash } from "../shared/engine";
import {
  authorize,
  exchange,
  readKey,
  saveKey,
  validateKey,
  MOCK,
} from "./openrouter";
import { decode, shareUrl } from "./share";
import { token } from "./turnstile";
import "./style.css";
import {
  candidateColor,
  Swatch,
  initialTheme,
  applyTheme,
  THEMES,
  type Theme,
} from "./appearance";
const sample = (name: string, party: Profile["party"]): Profile => ({
  name,
  party,
  label: "",
  bio: "Hypothetical adult candidate for an educational scenario. No claims about a real person.",
  ideology:
    party === "Democratic"
      ? [-0.45, -0.45, 0, -0.1]
      : party === "Republican"
        ? [0.45, 0.45, 0.1, 0.2]
        : [0, 0, 0.2, 0],
  appeal: { education: 0, urban: 0, young: 0 },
  recognition: 0.9,
  favorability: 0,
  controversy: 0,
  homeState: "",
  isRealPublicFigure: false,
  sources: [],
});
function App() {
  const [candidates, setCandidates] = useState<Profile[]>([
      sample("Jordan Ellis", "Democratic"),
      sample("Casey Reed", "Republican"),
    ]),
    [env, setEnv] = useState<Environment>(DEFAULT_ENV),
    [key, setKey] = useState(readKey),
    [remember, setRemember] = useState(!!localStorage.getItem("atlas-key")),
    [keyStatus, setKeyStatus] = useState(""),
    [models, setModels] = useState<string[]>(["openrouter/free"]),
    [model, setModel] = useState("openrouter/free"),
    [profilesReady, setProfilesReady] = useState(true),
    [result, setResult] = useState<Result | null>(null),
    [input, setInput] = useState<Input | null>(null),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [panel, setPanel] = useState("setup"),
    [selected, setSelected] = useState<VoteResult | null>(null),
    [sort, setSort] = useState("margin"),
    [counties, setCounties] = useState<County[]>([]),
    [theme, setTheme] = useState<Theme>(initialTheme),
    [calls, setCalls] = useState(0),
    [newSeed, setNewSeed] = useState(0),
    [live, setLive] = useState(false);
  const worker = useRef<Worker | null>(null),
    bot = useRef<HTMLDivElement>(null),
    importFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(theme, system.matches);
    update();
    try {
      localStorage.setItem("atlas-theme", theme);
    } catch {
      /* Theme works without storage. */
    }
    system.addEventListener("change", update);
    return () => system.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    const w = new Worker(new URL("./pipeline.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.type === "progress") setProgress(data.value);
      else if (data.type === "profiles") {
        setCandidates(data.profiles);
        setCalls(data.calls);
        setProfilesReady(true);
        setBusy("");
        setMessage(
          "Profiles are ready to review. AI-generated, may be inaccurate.",
        );
      } else if (data.type === "result") {
        setResult(data.result);
        setInput(data.input);
        setCandidates(data.input.candidates);
        setEnv(data.input.environment);
        setBusy("");
        setSelected(null);
        setMessage(
          data.warning ||
            "Simulation complete. This is one possible outcome, not a prediction.",
        );
      } else {
        setBusy("");
        setMessage(data.message);
      }
    };
    w.onerror = () => {
      setBusy("");
      setMessage("Worker failed. Reload the app to retry.");
    };
    fetch("/data/counties.json")
      .then((r) => r.json())
      .then((d) => setCounties(d as County[]))
      .catch(() =>
        setMessage("County data unavailable. Check your local build."),
      );
    fetch("/data/models.json")
      .then((r) => r.json())
      .then((d: any) => setModels([...d.models, "openrouter/free"]))
      .catch(() => {});
    fetch(MOCK ? "/data/environment-fallback.json" : "/api/environment", {
      signal: AbortSignal.timeout(6000),
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setEnv(EnvironmentSchema.parse(d)))
      .catch(() =>
        fetch("/data/environment-fallback.json")
          .then((r) => r.json())
          .then((d) => setEnv(EnvironmentSchema.parse(d)))
          .catch(() => setEnv({ ...DEFAULT_ENV, mode: "neutral" })),
      );
    const url = new URL(location.href);
    if (url.searchParams.has("code")) {
      const code = url.searchParams.get("code")!,
        state = url.searchParams.get("state");
      history.replaceState(null, "", url.pathname + url.hash);
      exchange(code, state)
        .then(async (k) => {
          await validateKey(k);
          saveKey(k);
          setKey(k);
          setKeyStatus("Connected · key stays in this browser");
        })
        .catch(() =>
          setMessage("OpenRouter sign-in failed or expired. Please try again."),
        );
    }
    if (location.hash.startsWith("#result=")) {
      setBusy("Opening shared scenario");
      decode(location.hash.slice(8))
        .then((i) => w.postMessage({ type: "run", input: i, trials: 1000 }))
        .catch(() => {
          setBusy("");
          setMessage("This shared scenario is invalid or incompatible.");
        });
    }
    return () => w.terminate();
  }, []);
  function update(i: number, patch: Partial<Profile>) {
    setCandidates((c) => c.map((x, j) => (i === j ? { ...x, ...patch } : x)));
  }
  function updateColor(i: number, color: string) {
    update(i, { color });
    setInput((current) =>
      current
        ? {
            ...current,
            candidates: current.candidates.map((c) =>
              c.name === candidates[i].name ? { ...c, color } : c,
            ),
          }
        : current,
    );
  }
  async function generate() {
    try {
      candidates.forEach((c) => Name.parse(c.name));
      if (
        new Set(candidates.map((c) => c.name.toLowerCase())).size !==
        candidates.length
      )
        throw Error("Use distinct candidate names.");
      setBusy("Retrieving candidate sources");
      setProgress(0);
      const items = [];
      for (const c of candidates) {
        let signals = null;
        if (live && !MOCK) {
          const t = await token(bot.current!);
          const res = await fetch(
            "/api/candidate-signals?name=" + encodeURIComponent(c.name),
            {
              headers: { "X-Turnstile-Token": t },
              signal: AbortSignal.timeout(40000),
            },
          );
          if (res.ok) {
            const retrieved = await res.json() as { publicFigure?: boolean; persona?: boolean; statuses?: { wikipedia?: string } };
            signals = retrieved;
            if (!retrieved.publicFigure && !retrieved.persona)
              setMessage(`Could not verify ${c.name}: ${retrieved.statuses?.wikipedia || "No identity source found"}. Try a full name or a specific Wikipedia title.`);
          }
          else
            setMessage(
              `Live lookup failed for ${c.name} (HTTP ${res.status}). Check the Turnstile keys and hostname, then generate profiles again. Unverified profiles use simulation assumptions.`,
            );
        }
        items.push({ ...c, signals });
      }
      setBusy("Preparing profiles");
      worker.current!.postMessage({
        type: "profiles",
        items,
        key,
        models: [model, ...models.filter((m) => m !== model)],
      });
    } catch (e) {
      setBusy("");
      setMessage(
        e instanceof Error ? e.message : "Could not generate profiles",
      );
    }
  }
  function run(imported?: Input) {
    try {
      const parsed = InputSchema.parse(
        imported || {
          version: 1,
          dataVersion: "2024-v1",
          candidates,
          environment: env,
          seed: hash(
            JSON.stringify(
              candidates.map(({ color, ...candidate }) => candidate),
            ) +
              JSON.stringify(env) +
              newSeed,
          ),
          narrative: "",
        },
      );
      setBusy("Simulating election paths");
      setProgress(0);
      const trials = (navigator.hardwareConcurrency || 4) < 4 ? 250 : 1000;
      worker.current!.postMessage({
        type: "run",
        input: parsed,
        key: imported ? "" : key,
        models: [model, ...models.filter((m) => m !== model)],
        remainingCalls: 10 - calls,
        trials,
      });
    } catch {
      setMessage(
        "Check all candidate profiles and environment values before running.",
      );
    }
  }
  async function connect() {
    try {
      await validateKey(key);
      saveKey(key, remember);
      setKeyStatus("Connected · key stays in this browser");
    } catch {
      setKeyStatus(
        "Could not validate this key. Check OpenRouter and try again.",
      );
    }
  }
  async function share() {
    if (!input) return;
    try {
      const url = await shareUrl(input);
      await navigator.clipboard.writeText(url);
      setMessage("Share link copied. No API key is included.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not copy the link");
    }
  }
  function download() {
    if (!input) return;
    const blob = new Blob([JSON.stringify(InputSchema.parse(input), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "civic-atlas-result.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const ordered = result
    ? [...result.states].sort((a, b) =>
        sort === "margin"
          ? a.margin - b.margin
          : sort === "turnout"
            ? b.turnout - a.turnout
            : a.id.localeCompare(b.id),
      )
    : [];
  const displayCandidates = input && result ? input.candidates : candidates;
  return (
    <>
      <header>
        <a className="brand" href="/" aria-label="Civic Atlas home">
          <span className="brand-symbol">
            c<span>✦</span>
          </span>
          <span>
            Civic Atlas<small>THE ELECTION SANDBOX</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            onClick={() => setPanel("setup")}
            className={panel === "setup" ? "active" : ""}
          >
            Simulator
          </button>
          <button
            onClick={() => setPanel("signals")}
            className={panel === "signals" ? "active" : ""}
          >
            Signals & sources
          </button>
          <button
            onClick={() => setPanel("about")}
            className={panel === "about" ? "active" : ""}
          >
            Methodology
          </button>
        </nav>
        <label className="theme-picker">
          <span>Theme</span>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> INDEPENDENT · OPEN ·
              BROWSER-POWERED
            </div>
            <h1>
              Every election starts
              <br />
              with <em>what if.</em>
            </h1>
            <p>
              Build your ballot. Explore the country. See how a different
              <br className="desktop" /> race could unfold—one county at a time.
            </p>
          </div>
          <div className="intro-note">
            <Globe2 size={30} strokeWidth={1} />
            <strong>
              50 states. 538 votes.
              <br />A world of possibilities.
            </strong>
            <span>Your candidates. Your key. Your scenario.</span>
          </div>
        </section>
        <div className="notice">
          <Info size={16} />
          <span>
            {env.mode === "manual"
              ? "Manual environment overrides are active."
              : env.mode === "bundled" || env.mode === "neutral"
                ? "Live data unavailable · using a neutral bundled scenario."
                : "Cached source snapshots · national polling values remain a neutral baseline."}{" "}
            <button onClick={() => setPanel("signals")}>
              Review signals <ArrowUpRight size={12} />
            </button>
          </span>
        </div>
        {message && (
          <div className="message" role="status">
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {panel === "about" ? (
          <section className="card about">
            <div className="eyebrow">UNDER THE HOOD</div>
            <h2>A sandbox, with its assumptions in the open.</h2>
            <p>
              County returns from 2016, 2020 and 2024 form coalition priors. A
              seeded multinomial-logit model adds candidate ideology,
              recognition, favorability, home-state appeal, turnout and
              correlated national, regional, demographic, state and local
              uncertainty. The displayed map is the first draw from the same
              distribution used for the win probabilities.
            </p>
            <p>
              Congressional district priors determine Maine and Nebraska's split
              electors. A candidate needs 270 electoral votes; otherwise the
              election goes to a contingent House election, which this model
              does not resolve. State margins below 0.5% are labeled
              recount-range; this label does not assert any state's legal
              recount rule.
            </p>
            <p>
              Alaska is a statewide aggregate. Connecticut uses the eight legacy
              county boundaries. Some counties use older returns and unmatched
              demographic fields use neutral defaults. District results are
              statewide-swing estimates, not precinct allocations. Probabilities
              are model sensitivity summaries, not calibrated forecasts.
            </p>
            <p>
              AI writes profiles and recaps; it never assigns votes. Profiles of
              unverified names are fictional scenarios, not biographies. Review
              every generated profile before running.
            </p>
            <a href="/data/provenance.json" target="_blank" rel="noreferrer">
              Read dataset provenance ↗
            </a>
          </section>
        ) : panel === "signals" ? (
          <section className="card signals">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE NATIONAL ENVIRONMENT</div>
                <h2>Choose the conditions.</h2>
              </div>
              <button onClick={() => setEnv(DEFAULT_ENV)}>
                <RotateCcw size={15} /> Reset
              </button>
            </div>
            <p>
              These are scenario assumptions, not current polling. News
              attention never changes approval, the generic ballot, or economic
              sentiment.
            </p>
            <div className="signal-grid">
              {(
                [
                  ["approval", "Presidential approval", 20, 80, 1, "%"],
                  [
                    "genericBallot",
                    "Generic ballot · D minus R",
                    -15,
                    15,
                    0.5,
                    " pts",
                  ],
                  ["economy", "Economic sentiment", -1, 1, 0.05, ""],
                  ["attention", "News attention index", 0, 1, 0.05, ""],
                ] as const
              ).map(([field, label, min, max, step, suffix]) => (
                <label className="signal" key={field}>
                  <span>{label}</span>
                  <strong>
                    {env[field]}
                    {suffix}
                  </strong>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={env[field]}
                    onChange={(e) =>
                      setEnv({
                        ...env,
                        [field]: +e.target.value,
                        mode: "manual",
                      })
                    }
                  />
                  <small>
                    Data as of {new Date(env.timestamp).toLocaleDateString()} ·{" "}
                    {env.mode}
                  </small>
                </label>
              ))}
            </div>
            <h3>Issue salience</h3>
            <div className="signal-grid">
              {[
                "Economy",
                "Social policy",
                "Establishment",
                "Foreign policy",
              ].map((label, i) => (
                <label key={label}>
                  {label} · {env.salience[i].toFixed(2)}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={env.salience[i]}
                    onChange={(e) => {
                      const salience = [
                        ...env.salience,
                      ] as Environment["salience"];
                      salience[i] = +e.target.value;
                      setEnv({ ...env, salience, mode: "manual" });
                    }}
                  />
                </label>
              ))}
            </div>
            {env.sources.map((s, i) => (
              <div className="source" key={i}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name} ↗
                </a>
                <span>
                  {s.status} · {new Date(s.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </section>
        ) : (
          <div className="workspace">
            <aside>
              <section className="card ballot">
                <div className="section-heading">
                  <h2>Your ballot</h2>
                  <span className="step">01 / SET UP</span>
                </div>
                <p className="muted">
                  Start with two candidates. Make it your race.
                </p>
                {candidates.map((c, i) => (
                  <div className="candidate" key={i}>
                    <div className="candidate-top">
                      <span className="candidate-letter">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect
                            width="24"
                            height="24"
                            rx="4"
                            fill={candidateColor(c, i)}
                          />
                        </svg>
                        <span>{String.fromCharCode(65 + i)}</span>
                      </span>
                      <strong>Candidate {i + 1}</strong>
                      <label className="color-picker">
                        <input
                          type="color"
                          aria-label={"Color for " + c.name}
                          value={candidateColor(c, i)}
                          disabled={!!busy}
                          onInput={(e) => updateColor(i, e.currentTarget.value)}
                          onChange={(e) => updateColor(i, e.target.value)}
                        />
                        <span>Color</span>
                      </label>
                      {candidates.length > 2 && (
                        <button
                          aria-label={"Remove " + c.name}
                          onClick={() => {
                            setCandidates(candidates.filter((_, j) => i !== j));
                            setProfilesReady(false);
                          }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <label className="sr-only" htmlFor={"name" + i}>
                      Candidate {i + 1} name
                    </label>
                    <input
                      id={"name" + i}
                      maxLength={70}
                      value={c.name}
                      onChange={(e) => {
                        update(i, { name: e.target.value });
                        setProfilesReady(false);
                      }}
                    />
                    <div className="two-fields">
                      <select
                        aria-label={"Party for " + c.name}
                        value={c.party}
                        onChange={(e) => {
                          update(i, {
                            party: e.target.value as Profile["party"],
                          });
                          setProfilesReady(false);
                        }}
                      >
                        <option>Democratic</option>
                        <option>Republican</option>
                        <option>Independent</option>
                      </select>
                      <input
                        aria-label={"Optional label for " + c.name}
                        placeholder="Label (optional)"
                        maxLength={60}
                        value={c.label}
                        onChange={(e) => update(i, { label: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
                <button
                  className="add"
                  disabled={candidates.length >= 6 || !!busy}
                  onClick={() => {
                    setCandidates([
                      ...candidates,
                      sample("New candidate", "Independent"),
                    ]);
                    setProfilesReady(false);
                  }}
                >
                  <Plus size={16} /> Add a candidate{" "}
                  <span>{candidates.length}/6</span>
                </button>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={live}
                    onChange={(e) => setLive(e.target.checked)}
                  />{" "}
                  Retrieve live public-figure sources
                </label>
                <button
                  className="secondary full"
                  disabled={!!busy}
                  onClick={generate}
                >
                  Generate profiles <ArrowRight size={16} />
                </button>
                <small className="muted">
                  Enable live sources to verify public figures. Without retrieved evidence, profiles remain unverified simulation assumptions.
                </small>
                <div ref={bot} />
              </section>
              <section className="card key-card">
                <div className="section-heading">
                  <h3>
                    <KeyRound size={16} /> Your AI connection
                  </h3>
                  <span className="pill">BYOK</span>
                </div>
                <p>
                  Optional for the sandbox. Required for grounded AI profiles
                  and recaps. Your key stays in this browser; our server never
                  sees it.
                </p>
                <button
                  className="primary full"
                  onClick={async () => {
                    location.href = await authorize(
                      location.origin + location.pathname,
                    );
                  }}
                >
                  Sign in with OpenRouter <ArrowUpRight size={15} />
                </button>
                <details>
                  <summary>Or paste an API key</summary>
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label="OpenRouter API key"
                    placeholder="sk-or-…"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                  <button onClick={connect}>Validate & save key</button>
                </details>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => {
                      setRemember(e.target.checked);
                      if (keyStatus.startsWith("Connected"))
                        saveKey(key, e.target.checked);
                    }}
                  />{" "}
                  Remember on this device
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    saveKey("");
                    setKey("");
                    setKeyStatus("Key forgotten");
                  }}
                >
                  Forget my key
                </button>
                <small role="status">
                  {keyStatus || "Session-only storage by default. No trackers."}
                </small>
                <label className="model">
                  Free model
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {[...new Set([model, ...models])].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </section>
            </aside>
            <div className="results-column">
              <section className="card overview">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">
                      {result
                        ? "ONE POSSIBLE OUTCOME"
                        : "YOUR ELECTORAL LANDSCAPE"}
                    </div>
                    <h2>
                      {result
                        ? result.winner === null
                          ? "No electoral majority"
                          : displayCandidates[result.winner].name +
                            " takes the path"
                        : "The road to 270"}
                    </h2>
                  </div>
                  <span className="pill">
                    <span className="status-dot" />
                    {result ? "SIMULATED" : "READY TO EXPLORE"}
                  </span>
                </div>
                <div className="ev-numbers">
                  {displayCandidates.slice(0, 2).map((c, i) => (
                    <div key={i}>
                      <span>
                        <Swatch color={candidateColor(c, i)} />
                        {c.name}
                      </span>
                      <strong>
                        {result ? result.ev[i] : "—"}
                        <small> electoral votes</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="electoral-bar">
                  <svg
                    preserveAspectRatio="none"
                    viewBox="0 0 538 20"
                    role="img"
                    aria-label="Electoral votes: 270 required"
                  >
                    <rect width="538" height="20" fill="#e8eae4" />
                    {result &&
                      result.ev.map((ev, i) => (
                        <rect
                          key={i}
                          x={result.ev.slice(0, i).reduce((a, b) => a + b, 0)}
                          y="0"
                          width={ev}
                          height="20"
                          fill={candidateColor(displayCandidates[i], i)}
                        />
                      ))}
                    <path
                      d="M270 0V20"
                      stroke="#102e35"
                      strokeWidth="2"
                      strokeDasharray="2 2"
                    />
                  </svg>
                  <span>0</span>
                  <span>270 TO WIN</span>
                  <span>538</span>
                </div>
                <Map
                  result={result}
                  candidates={displayCandidates}
                  counties={counties}
                  onSelect={setSelected}
                />
              </section>
              <section className="run-strip">
                <div>
                  <strong>
                    {busy || "Ready to explore a different outcome?"}
                  </strong>
                  <span>
                    {busy
                      ? `${Math.round(progress * 100)}% complete`
                      : `${MOCK ? "Offline fixture mode" : key ? "AI connected" : "No key needed for a hypothetical scenario"} · ${key ? Math.min(10, candidates.length + 2) : 0} estimated AI calls, 10 maximum with retries`}
                  </span>
                  {busy && (
                    <progress
                      max="1"
                      value={progress}
                      aria-label="Simulation progress"
                    />
                  )}
                </div>
                <button
                  className="primary"
                  disabled={!!busy || !profilesReady}
                  onClick={() => run()}
                >
                  <Play size={15} />
                  {busy ? "Working…" : "Run election"}
                </button>
              </section>
              {profilesReady && (
                <details className="card profiles">
                  <summary>
                    Review & edit candidate profiles <span>02 / REVIEW</span>
                  </summary>
                  <p className="muted">
                    AI-generated, may be inaccurate. These assumptions influence
                    the simulation.
                  </p>
                  {candidates.map((c, i) => (
                    <div className="profile" key={i}>
                      <h3>
                        {c.name}{" "}
                        <span className="pill">
                          {c.isRealPublicFigure
                            ? "Public figure"
                            : c.isPublicPersona ? "Public persona" : "Unverified"}
                        </span>
                      </h3>
                      <label>
                        Biography
                        <textarea
                          value={c.bio}
                          maxLength={1200}
                          onChange={(e) => update(i, { bio: e.target.value })}
                        />
                      </label>
                      {!c.isRealPublicFigure && !c.isPublicPersona && c.lookupStatus && <p role="status">Identity lookup: {c.lookupStatus}. Source links below may be news, social results, or pageview statistics.</p>}
                      {c.politicalSummary && <div className="political-summary">
                        <h4>Political ideals · {c.politicalConfidence || "low"} confidence</h4>
                        <p>{c.politicalSummary}</p>
                        <small className="muted">Ideology sliders are editable simulation estimates, not measured facts. Zero may mean insufficient evidence. Party is your scenario choice.</small>
                      </div>}
                      <div className="profile-grid">
                        {["Economic", "Social", "Populism", "Hawkishness"].map(
                          (label, k) => (
                            <label key={label}>
                              {label} · {c.ideology[k].toFixed(2)}
                              <input
                                type="range"
                                min="-1"
                                max="1"
                                step=".05"
                                value={c.ideology[k]}
                                onChange={(e) => {
                                  const v = [
                                    ...c.ideology,
                                  ] as Profile["ideology"];
                                  v[k] = +e.target.value;
                                  update(i, { ideology: v });
                                }}
                              />
                            </label>
                          ),
                        )}
                        {(["education", "urban", "young"] as const).map(
                          (field) => (
                            <label key={field}>
                              {field} appeal · {c.appeal[field].toFixed(2)}
                              <input
                                type="range"
                                min="-1"
                                max="1"
                                step=".05"
                                value={c.appeal[field]}
                                onChange={(e) =>
                                  update(i, {
                                    appeal: {
                                      ...c.appeal,
                                      [field]: +e.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          ),
                        )}
                        {(
                          [
                            "recognition",
                            "favorability",
                            "controversy",
                          ] as const
                        ).map((field) => (
                          <label key={field}>
                            {field} · {c[field].toFixed(2)}
                            <input
                              type="range"
                              min={field === "favorability" ? -1 : 0}
                              max="1"
                              step=".05"
                              value={c[field]}
                              onChange={(e) =>
                                update(i, { [field]: +e.target.value })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Home state
                          <select
                            value={c.homeState}
                            onChange={(e) =>
                              update(i, { homeState: e.target.value })
                            }
                          >
                            <option value="">None</option>
                            {STATES.map((s) => (
                              <option key={s.abbr} value={s.abbr}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {c.sources.map((s, k) => (
                        <a
                          className="source-link"
                          key={s}
                          href={s}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source {k + 1} ↗
                        </a>
                      ))}
                    </div>
                  ))}
                </details>
              )}
              {result && (
                <>
                  <div className="result-pair">
                    <section className="card probabilities">
                      <div className="eyebrow">
                        ACROSS {result.trials.toLocaleString()} TRIALS
                      </div>
                      <h2>Paths to a majority</h2>
                      {displayCandidates.map((c, i) => (
                        <div className="probability" key={i}>
                          <span>
                            <Swatch color={candidateColor(c, i)} />
                            {c.name}
                          </span>
                          <strong>
                            {(result.probabilities[i] * 100).toFixed(1)}%
                          </strong>
                          <svg
                            preserveAspectRatio="none"
                            viewBox="0 0 100 4"
                            aria-hidden="true"
                          >
                            <rect width="100" height="4" fill="#e5e8e1" />
                            <rect
                              width={result.probabilities[i] * 100}
                              height="4"
                              fill={candidateColor(displayCandidates[i], i)}
                            />
                          </svg>
                          <small>
                            {result.ev[i]} EV ·{" "}
                            {(
                              (result.popular[i] /
                                result.popular.reduce((a, b) => a + b, 0)) *
                              100
                            ).toFixed(1)}
                            % popular vote
                          </small>
                        </div>
                      ))}
                      <p className="muted">
                        No majority:{" "}
                        {(result.contingentProbability * 100).toFixed(1)}%.
                        Model uncertainty, not a forecast.
                      </p>
                    </section>
                    <section className="card recap">
                      <div className="eyebrow">THE STORY OF THIS DRAW</div>
                      <h2>Election notebook</h2>
                      <p className="narrative">{input?.narrative}</p>
                      <div className="mini-stat">
                        <span>
                          Tipping-point state
                          <strong>
                            {result.tippingPoint || "No majority"}
                          </strong>
                        </span>
                        <span>
                          County-unit flips<strong>{result.flips}</strong>
                        </span>
                      </div>
                    </section>
                  </div>
                  <label className="county-picker">
                    Inspect a county or statewide unit
                    <select
                      aria-label="Inspect county"
                      defaultValue=""
                      onChange={(e) =>
                        setSelected(
                          result.counties.find(
                            (c) => c.id === e.target.value,
                          ) || null,
                        )
                      }
                    >
                      <option value="">Choose a county…</option>
                      {counties.map((c) => (
                        <option key={c.fips} value={c.fips}>
                          {c.state} · {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected && (
                    <section className="card detail">
                      <div className="section-heading">
                        <h2>
                          {STATES.find((s) => s.abbr === selected.id)?.name ||
                            counties.find((c) => c.fips === selected.id)
                              ?.name ||
                            selected.id}
                        </h2>
                        <button
                          aria-label="Close details"
                          onClick={() => setSelected(null)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {displayCandidates.map((c, i) => (
                        <p key={i}>
                          <Swatch color={candidateColor(c, i)} />
                          {c.name}: {selected.votes[i].toLocaleString()} votes (
                          {(
                            (selected.votes[i] / selected.turnout) *
                            100
                          ).toFixed(1)}
                          %)
                        </p>
                      ))}
                      <p>
                        Total modeled votes: {selected.turnout.toLocaleString()}
                        . Margin: {(selected.margin * 100).toFixed(2)}%.{" "}
                        {selected.margin < 0.005 ? "Recount-range." : ""}
                      </p>
                      <p className="muted">
                        Driven by historical coalition priors, candidate fit,
                        the environment and correlated error.{" "}
                        {
                          counties.find((c) => c.fips === selected.id)
                            ?.dataQuality
                        }
                      </p>
                    </section>
                  )}
                  <section className="card state-table">
                    <div className="section-heading">
                      <h2>Across the states</h2>
                      <select
                        aria-label="Sort states"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="margin">Closest first</option>
                        <option value="name">Alphabetical</option>
                        <option value="turnout">Most votes</option>
                      </select>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>State</th>
                            <th>Winner</th>
                            <th>EV</th>
                            <th>Margin</th>
                            <th>State win odds</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordered.map((s) => (
                            <tr key={s.id}>
                              <td>
                                <button onClick={() => setSelected(s)}>
                                  {STATES.find((x) => x.abbr === s.id)?.name}
                                </button>
                              </td>
                              <td>
                                <Swatch
                                  color={candidateColor(
                                    displayCandidates[s.winner],
                                    s.winner,
                                  )}
                                />
                                {displayCandidates[s.winner].name}
                              </td>
                              <td>
                                {STATES.find((x) => x.abbr === s.id)?.ev}
                                {s.id === "ME" || s.id === "NE" ? "*" : ""}
                              </td>
                              <td>
                                {(s.margin * 100).toFixed(2)}%
                                {s.margin < 0.005 ? " †" : ""}
                              </td>
                              <td>
                                {(
                                  result.stateOdds[s.id][s.winner] * 100
                                ).toFixed(1)}
                                %
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <small>
                      * ME/NE split electors:{" "}
                      {result.districts
                        .map(
                          (d) => `${d.id}: ${displayCandidates[d.winner].name}`,
                        )
                        .join(" · ")}
                      . † Recount-range.
                    </small>
                  </section>
                  <div className="export-bar">
                    <button onClick={share}>
                      <Link size={16} /> Copy share link
                    </button>
                    <button onClick={download}>
                      <Download size={16} /> Download result JSON
                    </button>
                    <button
                      onClick={() => {
                        setNewSeed(newSeed + 1);
                        setMessage(
                          "New seed selected. Click Run election for another draw.",
                        );
                      }}
                    >
                      <RotateCcw size={16} /> New seed
                    </button>
                  </div>
                </>
              )}
              <button
                className="text-button import"
                onClick={() => importFile.current?.click()}
              >
                Import a saved result JSON <ArrowUpRight size={14} />
              </button>
              <input
                className="sr-only"
                ref={importFile}
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 150000) throw Error();
                    run(InputSchema.parse(JSON.parse(await file.text())));
                  } catch {
                    setMessage(
                      "Invalid result file. Use a Civic Atlas JSON export.",
                    );
                  }
                }}
              />
            </div>
          </div>
        )}
      </main>
      <footer>
        <a className="brand small" href="/">
          Civic Atlas <span>✦</span>
        </a>
        <p>
          AI-assisted simulation for entertainment and education. Not a
          forecast.
          <br />
          Not affiliated with any campaign or media outlet.
        </p>
        <span>Built for curiosity.</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
