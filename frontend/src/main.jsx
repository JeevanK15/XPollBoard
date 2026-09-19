import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FiArrowLeft,
  FiCheck,
  FiCopy,
  FiDownload,
  FiEdit3,
  FiEye,
  FiEyeOff,
  FiHome,
  FiLink,
  FiLogOut,
  FiLogIn,
  FiMessageCircle,
  FiMoon,
  FiPlus,
  FiSave,
  FiShare2,
  FiSun,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiX,
  FiUser,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import "./styles.css";

const API = (
  import.meta.env.VITE_API_URL || "http://localhost:8080/api"
).replace(/\/$/, "");
async function request(path, options = {}) {
  const token = localStorage.getItem("pulseboard_token") || "";
  const r = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "Something went wrong");
  return body;
}

function navigateTo(path) {
  const target = path || "/";
  history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function redirectToAuth(route = "/login") {
  const currentPath = location.pathname + location.search + location.hash;
  if (currentPath !== "/login" && currentPath !== "/signup") {
    sessionStorage.setItem("xpoll_redirect", currentPath);
  }
  navigateTo(route);
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem("pulseboard_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  if (!user) {
    localStorage.removeItem("pulseboard_user");
    return;
  }
  localStorage.setItem("pulseboard_user", JSON.stringify(user));
}

function App() {
  const [route, setRoute] = useState(location.pathname),
    [token, setToken] = useState(
      localStorage.getItem("pulseboard_token") || "",
    );

  const handleAuthSuccess = () => {
    const redirectTarget = sessionStorage.getItem("xpoll_redirect") || "/";
    sessionStorage.removeItem("xpoll_redirect");
    const nextToken = localStorage.getItem("pulseboard_token") || "";
    setToken(nextToken);
    navigateTo(redirectTarget === "/login" || redirectTarget === "/signup" ? "/" : redirectTarget);
  };

  const handleLogout = () => {
    localStorage.removeItem("pulseboard_token");
    localStorage.removeItem("pulseboard_user");
    setToken("");
    navigateTo("/");
  };

  useEffect(() => {
    const f = () => setRoute(location.pathname);
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  if (route.startsWith("/p/"))
    return <PollPageClean shareID={route.split("/").pop()} logout={handleLogout} />;
  if (route === "/profile")
    return token ? <ProfilePage logout={handleLogout} /> : <LandingPage />;
  if (route === "/create")
    return token ? <CreatePollPage logout={handleLogout} /> : <AuthPage mode="signup" done={handleAuthSuccess} />;
  if (!token && (route === "/login" || route === "/signup"))
    return <AuthPage mode={route === "/signup" ? "signup" : "login"} done={handleAuthSuccess} />;
  return token ? <Dashboard logout={handleLogout} /> : <LandingPage />;
}
const TEMPLATE_PRESETS = {
  custom: { label: "Custom", question: "", options: ["", ""] },
  "multiple-choice": { label: "Multiple choice", question: "Which option should we prioritize next?", options: ["Design", "Development", "Marketing", "Support"] },
  "yes-no": { label: "Yes / No", question: "Should we move ahead with this plan?", options: ["Yes", "No"] },
  "rating": { label: "Rating", question: "How satisfied were you with today’s experience?", options: ["Very happy", "Happy", "Neutral", "Needs work"] },
  "anonymous-feedback": { label: "Anonymous feedback", question: "What should we improve before the next release?", options: ["Process", "Communication", "Features", "Documentation"] },
};

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("xpoll_theme") !== "light");
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("xpoll_theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <button className="theme-toggle" type="button" aria-label={`Switch to ${dark ? "light" : "dark"} theme`} onClick={() => setDark((value) => !value)}>
      {dark ? <FiSun size={14} /> : <FiMoon size={14} />}
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
function DeleteConfirm({ question, busy, onCancel, onConfirm }) {
  return (
    <div className="confirm-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
        <p className="eyebrow">IRREVERSIBLE ACTION</p>
        <h2 id="delete-title">Delete this poll?</h2>
        <p id="delete-description">&ldquo;{question}&rdquo; will be permanently removed. Its public link will stop working.</p>
        <div className="confirm-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}><FiArrowLeft size={14} /> Keep poll</button>
          <button className="confirm-delete" onClick={onConfirm} disabled={busy}><FiTrash2 size={14} /> {busy ? "Deleting..." : "Delete poll"}</button>
        </div>
      </section>
    </div>
  );
}

function Notice({ message, tone = "info" }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return undefined;
    const timer = setTimeout(() => setVisible(false), 3600);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || !visible) return null;
  return (
    <div className={`app-notice app-notice-${tone}`} role={tone === "error" || tone === "warning" ? "alert" : "status"} aria-live="polite">
      <span>{tone === "success" ? <FiCheck size={16} /> : tone === "warning" ? <FiZap size={16} /> : <FiLink size={16} />}</span>
      <strong>{message}</strong>
    </div>
  );
}

function ProfileNavButton({ user, onViewProfile, onSignOut }) {
  const initials = (user?.name || "U").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".profile-trigger")) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div className="profile-menu-wrap">
      <button type="button" className="profile-trigger" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} aria-label="Open profile menu" title="Profile">
        <span className="profile-letter">{initials}</span>
      </button>

      {open && (
        <div className="profile-dropdown" role="menu" aria-label="Profile menu">
          <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setOpen(false); onViewProfile?.(); }}>
            <FiUser size={14} /> View profile
          </button>
          <button type="button" role="menuitem" className="profile-menu-item danger" onClick={() => { setOpen(false); onSignOut?.(); }}>
            <FiLogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function ProfilePage({ logout }) {
  const [user, setUser] = useState(readStoredUser() || { name: "Guest", email: "" });
  const [nameDraft, setNameDraft] = useState(user.name || "Guest");
  const [stats, setStats] = useState({ created: 0, active: 0, deactivated: 0, totalVotes: 0 });
  const [polls, setPolls] = useState([]);
  const [votes, setVotes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [mine, summary] = await Promise.all([
          request("/polls/mine"),
          request("/polls/stats"),
        ]);
        if (!mounted) return;
        setPolls(mine || []);
        setStats(summary || { created: 0, active: 0, deactivated: 0, totalVotes: 0 });
      } catch {
        setPolls([]);
        setStats({ created: 0, active: 0, deactivated: 0, totalVotes: 0 });
      }
    };
    load();
    const recoverVoteHistory = async () => {
      const existingHistory = JSON.parse(localStorage.getItem("pulseboard_vote_history") || "[]");
      const votedPolls = Object.keys(localStorage)
        .filter((key) => key.startsWith("voted_"))
        .map((key) => ({ shareId: key.slice(6), optionId: localStorage.getItem(key) }))
        .filter((vote) => vote.shareId && vote.optionId);
      const recovered = await Promise.all(votedPolls.map(async ({ shareId, optionId }) => {
        try {
          const poll = await request(`/polls/${shareId}`);
          const option = poll.options?.find((item) => item.id === optionId);
          return option ? { label: poll.question, pollId: shareId, option: option.text, createdAt: Date.now() } : null;
        } catch {
          return null;
        }
      }));
      const merged = [...recovered.filter(Boolean), ...existingHistory]
        .filter((entry, index, entries) => entries.findIndex((item) => item.pollId === entry.pollId) === index)
        .slice(0, 20);
      if (mounted) setVotes(merged);
      localStorage.setItem("pulseboard_vote_history", JSON.stringify(merged));
    };
    recoverVoteHistory();
    return () => { mounted = false; };
  }, []);

  const handleSaveName = () => {
    const nextName = nameDraft.trim();
    if (!nextName) return;
    setSaving(true);
    const nextUser = { ...user, name: nextName };
    saveStoredUser(nextUser);
    setUser(nextUser);
    setSaving(false);
    setNotice("Profile saved");
  };

  const totalPollVotes = polls.reduce((sum, poll) => sum + (poll.options || []).reduce((pollTotal, option) => pollTotal + Number(option.votes || 0), 0), 0);

  return (
    <main className="profile-page">
      <Notice message={notice} tone="success" />
      <nav className="topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools">
          <ThemeToggle />
          <a className="ghost" href="/"><FiHome size={14} /> Dashboard</a>
          <a className="primary small" href="/create"><FiPlus size={14} /> Create poll</a>
          <ProfileNavButton user={user} onViewProfile={() => navigateTo("/profile")} onSignOut={logout} />
        </div>
      </nav>

      <section className="profile-shell">
        <aside className="profile-card profile-summary-card">
          <div className="profile-banner">
            <div className="profile-avatar large">{(user.name || "U").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
            <div>
              <p className="eyebrow">PROFILE</p>
              <h1>{user.name || "Guest"}</h1>
              <p className="muted">{user.email || "No email stored"}</p>
            </div>
          </div>

          <div className="profile-meta-list">
            <div className="profile-meta-item">
              <span>Polls created</span>
              <strong>{stats.created}</strong>
            </div>
            <div className="profile-meta-item">
              <span>Votes received</span>
              <strong>{totalPollVotes}</strong>
            </div>
          </div>

          <label className="profile-field">
            <span>Display name</span>
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength="40" />
          </label>

          <button type="button" className="primary" onClick={handleSaveName} disabled={saving}>
            <FiSave size={14} /> {saving ? "Saving..." : "Save profile"}
          </button>
        </aside>

        <div className="profile-content">
          <section className="profile-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">STATS</p>
                <h2>Overview</h2>
              </div>
            </div>
            <div className="stats-grid profile-grid">
              <div className="stat-card"><span>Polls created</span><strong>{stats.created}</strong></div>
              <div className="stat-card"><span>Active</span><strong>{stats.active}</strong></div>
              <div className="stat-card"><span>Total votes</span><strong>{stats.totalVotes}</strong></div>
              <div className="stat-card"><span>Paused</span><strong>{stats.deactivated}</strong></div>
            </div>
          </section>

          <section className="profile-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">MY POLLS</p>
                <h2>Created polls</h2>
              </div>
            </div>
            {polls.length === 0 ? (
              <p className="muted">You have not created any polls yet.</p>
            ) : (
              <div className="profile-list">
                {polls.map((poll) => (
                  <div key={poll.shareId} className="profile-item">
                    <div>
                      <strong>{poll.question}</strong>
                      <small>{poll.options.length} choices · {poll.options.reduce((sum, option) => sum + option.votes, 0)} votes</small>
                    </div>
                    <a href={`/p/${poll.shareId}`} className="ghost small-link">Open</a>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">ACTIVITY</p>
                <h2>My votes</h2>
              </div>
            </div>
            {votes.length === 0 ? (
              <p className="muted">No saved votes yet.</p>
            ) : (
              <div className="profile-list">
                {votes.map((vote, index) => (
                  <div key={`${vote.pollId}-${index}`} className="profile-item">
                    <div>
                      <strong>{vote.label || "Vote"}</strong>
                      
                    </div>
                    <span className="tag">{vote.option || "selected"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function EditPollDialog({ poll, busy, onCancel, onSaved }) {
  const [question, setQuestion] = useState(poll.question);
  const [options, setOptions] = useState(poll.options.map((option) => option.text));
  const [optionIds, setOptionIds] = useState(poll.options.map((option) => option.id));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const updated = await request(`/polls/${poll.shareId}`, { method: "PUT", body: JSON.stringify({ question, options: options.map((text, index) => ({ id: optionIds[index] || "", text })) }) });
      onSaved(updated);
    } catch (e) {
      setError(e.message);
      setNotice(e.message);
      setNotice(e.message);
    }
  };
  const addOption = () => {
    if (options.length >= 10) {
      const message = "A poll can have up to 10 choices.";
      setError(message);
      setNotice(message);
      return;
    }
    setOptions([...options, ""]);
    setOptionIds([...optionIds, ""]);
  };
  return (
    <div className="confirm-backdrop">
      <Notice message={notice} tone="error" />
      <section className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-poll-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">POLL STUDIO</p>
            <h2 id="edit-poll-title">Edit your poll</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onCancel} aria-label="Close editor"><FiX size={18} /></button>
        </div>

        <form onSubmit={submit} className="editor-form">
          <label>
            Question
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength="5" maxLength="280" required />
          </label>

          <div className="option-head">
            <span>Choices</span>
            <button className="text-button" type="button" onClick={addOption}><FiPlus size={14} /> Add choice</button>
          </div>

          {options.map((option, index) => (
            <div className="option-input" key={index}>
              <span>{index + 1}</span>
              <input
                value={option}
                onChange={(event) => setOptions(options.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                required
              />
              {options.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove choice ${index + 1}`}
                  onClick={() => {
                    setOptions(options.filter((_, itemIndex) => itemIndex !== index));
                    setOptionIds(optionIds.filter((_, itemIndex) => itemIndex !== index));
                  }}
                >
                  <FiTrash2 size={14} />
                </button>
              )}
            </div>
          ))}

          {error && <p className="error" role="alert">{error}</p>}

          <div className="confirm-actions">
            <button className="ghost" type="button" onClick={onCancel}><FiArrowLeft size={14} /> Cancel</button>
            <button className="primary" type="submit" disabled={busy}><FiSave size={14} /> {busy ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);

  return (
    <div className="password-field">
      <input
        value={value}
        onChange={onChange}
        type={show ? "text" : "password"}
        minLength="8"
        required
        placeholder={placeholder}
      />
      <button type="button" className="password-toggle" onClick={() => setShow((current) => !current)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <FiEyeOff size={14} /> : <FiEye size={14} />}
      </button>
    </div>
  );
}

function AuthPage({ mode, done }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const isSignup = mode === "signup";

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await request(`/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      localStorage.setItem("pulseboard_token", data.token);
      saveStoredUser(data.user);
      done();
    } catch (e) {
      setError(e.message);
      setNotice(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <Notice message={notice} tone="error" />
      <nav className="topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools">
          <ThemeToggle />
          <a className="ghost" href={isSignup ? "/login" : "/signup"}><FiLogIn size={14} /> {isSignup ? "Sign in" : "Create account"}</a>
        </div>
      </nav>

      <section className="auth-layout">
        <div className="auth-visual">
          <p className="eyebrow">KEEP THE ROOM IN SYNC</p>
          <h1>Your audience is already talking.</h1>
          <p>
            Capture the answer quickly, share it widely, and turn a simple question into a clear signal.
          </p>
          <ul>
            <li>Fast setup with one question and a few choices</li>
            <li>Live updates as people vote</li>
            <li>Shareable links for teams, classes, and communities</li>
          </ul>
        </div>

        <div className="auth-card">
          <p className="eyebrow">{isSignup ? "JOIN XPOLLBOARD" : "WELCOME BACK"}</p>
          <h2>{isSignup ? "Create your account" : "Sign in to your workspace"}</h2>
          <form onSubmit={submit} className="auth-form">
            {isSignup && (
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} minLength="2" required placeholder="Your name" />
              </label>
            )}
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" />
            </label>
            <label>
              Password
              <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="primary" disabled={loading}>
              <FiLogIn size={14} /> {loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "Need an account?"} <a href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create one"}</a>
          </p>
        </div>
      </section>
    </main>
  );
}
function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools">
          <ThemeToggle />
          <a className="ghost" href="/login"><FiLogIn size={14} /> Sign in</a>
          <a className="primary small" href="/signup"><FiPlus size={14} /> Create a poll</a>
        </div>
      </nav>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">CREATE. VOTE. DISCOVER THE PULSE.</p>
          <h1>Turn every quick opinion into a decisive signal.</h1>
          <p className="subhead">
            XPollBoard brings live voting, private access controls, discussion, notifications, and clear analytics into one focused workspace for teams, classrooms, communities, and product feedback.
          </p>
          <div className="cta-row">
            <a className="primary" href="/create"><FiPlus size={14} /> Start a live poll</a>
            <a className="ghost" href="/login"><FiHome size={14} /> Open your workspace</a>
          </div>
          <div className="trust-row">
            <span>Live voting</span>
            <span>Private polls</span>
            <span>Discussion threads</span>
            <span>Clear analytics</span>
          </div>
        </div>

        <div className="hero-demo">
          <div className="demo-window">
            <div className="window-bar">
              <span className="dot red" />
              <span className="dot amber" />
              <span className="dot green" />
            </div>
            <p className="demo-title">Which feature deserves the next release?</p>
            <DemoBar label="AI search" percent="58%" />
            <DemoBar label="New dashboard" percent="27%" />
            <DemoBar label="Automation" percent="15%" />
            <div className="demo-footer">128 responses · updating live</div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <span className="feature-icon">⚡</span>
          <h3>Real-time responses</h3>
          <p>Watch responses move live through WebSocket updates while voters can change their selection during an active poll.</p>
        </article>
        <article className="feature-card">
          <span className="feature-icon">🔒</span>
          <h3>Private and public polls</h3>
          <p>Share an open link or protect a poll with a password and a clear unlock flow when access needs to stay controlled.</p>
        </article>
        <article className="feature-card">
          <span className="feature-icon">📊</span>
          <h3>Meaningful analytics</h3>
          <p>Use dashboard analytics, owner insights, profile activity, and notifications to turn responses into the next decision.</p>
        </article>
      </section>

      <section className="steps-panel">
        <div className="section-head">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>From idea to insight in three easy steps.</h2>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">01</div>
            <h3>Draft</h3>
            <p>Open the studio, choose a template, write a sharp question, and add two to ten options.</p>
          </div>
          <div className="step-card">
            <div className="step-number">02</div>
            <h3>Publish</h3>
            <p>Publish a public or private poll, share one link, and keep the audience conversation focused.</p>
          </div>
          <div className="step-card">
            <div className="step-number">03</div>
            <h3>Learn</h3>
            <p>Monitor live responses, comments, owner insights, and poll health to understand what the room really wants.</p>
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <div>
          <p className="eyebrow">START TODAY</p>
          <h2>Launch a better decision-making loop in minutes.</h2>
        </div>
        <a className="primary" href="/create"><FiPlus size={14} /> Create a poll</a>
      </section>
    </main>
  );
}

function DemoBar({ label, percent }) {
  return (
    <div className="demo-bar">
      <span>{label}</span>
      <i style={{ width: percent }} />
      <b>{percent}</b>
    </div>
  );
}

function CreatePollPage({ logout }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState("custom");
  const [visibility, setVisibility] = useState("public");
  const [privatePassword, setPrivatePassword] = useState("");
  const [allowComments, setAllowComments] = useState(false);
  const [notice, setNotice] = useState("");

  const applyTemplate = (nextTemplate) => {
    const preset = TEMPLATE_PRESETS[nextTemplate] || TEMPLATE_PRESETS.custom;
    setTemplate(nextTemplate);
    setQuestion(preset.question);
    setOptions(preset.options.map((value) => value));
  };

  const addOption = () => {
    if (options.length >= 10) {
      setError("A poll can have up to 10 choices.");
      setNotice("Maximum of 10 choices reached");
      return;
    }
    setOptions([...options, ""]);
  };

  const create = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const poll = await request("/polls", {
        method: "POST",
        body: JSON.stringify({
          question,
          options,
          template,
          visibility,
          password: visibility === "private" ? privatePassword : "",
          allowComments,
        }),
      });
      navigateTo(`/p/${poll.shareId}`);
    } catch (e) {
      setError(e.message);
      setNotice(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="create-shell">
      <Notice message={notice} tone={error ? "error" : "warning"} />
      <nav className="topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools">
          <ThemeToggle />
          <a className="ghost" href="/"><FiHome size={14} /> Dashboard</a>
          <ProfileNavButton user={readStoredUser()} onViewProfile={() => navigateTo("/profile")} onSignOut={logout} />
        </div>
      </nav>

      <div className="create-layout">
        <aside className="create-hero">
          <div className="create-badge">Live polling studio</div>
          <h1>Turn a quick question into a live decision.</h1>
          <p>Design a clean, shareable poll in seconds. Choose a template, set the access level, and launch it with a polished experience your audience will trust.</p>

          <div className="create-metrics">
            <div className="mini-stat">
              <strong>2 min</strong>
              <span>setup time</span>
            </div>
            <div className="mini-stat">
              <strong>Live</strong>
              <span>vote updates</span>
            </div>
            <div className="mini-stat">
              <strong>1 link</strong>
              <span>share anywhere</span>
            </div>
          </div>

          <div className="floating-stack">
            <div className="float-card accent">Instant engagement</div>
            <div className="float-card">Private audience</div>
            <div className="float-card">Clear results</div>
          </div>
        </aside>

        <section className="create-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">NEW POLL</p>
              <h2>Create a live signal</h2>
            </div>
            <span className="mini-tag">2-10 options</span>
          </div>

          <div className="template-grid" aria-label="Poll templates">
            {[
              ["custom", "Custom"],
              ["multiple-choice", "Multiple choice"],
              ["yes-no", "Yes / No"],
              ["rating", "Rating"],
              ["anonymous-feedback", "Anonymous feedback"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`template-card ${template === value ? "selected" : ""}`}
                onClick={() => applyTemplate(value)}
              >
                <span>{label}</span>
                <small>{value === "multiple-choice" ? "Flexible" : value === "yes-no" ? "Fast" : value === "rating" ? "Feedback" : "Private input"}</small>
              </button>
            ))}
          </div>

          <form onSubmit={create} className="create-form">
            <div className="form-grid two-up">
              <label className="field-card">
                <span>Access</span>
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>

              {visibility === "private" && (
                <label className="field-card">
                  <span>Private password</span>
                  <input
                    value={privatePassword}
                    onChange={(event) => setPrivatePassword(event.target.value)}
                    type="password"
                    minLength="4"
                    placeholder="At least 4 characters"
                    required
                  />
                </label>
              )}
            </div>

            <label className="field-card checkbox-card">
              <span>Audience interaction</span>
              <div className="toggle-row">
                <span className="toggle-copy">Allow voters to comment on this poll</span>
                <button type="button" className={`toggle-switch ${allowComments ? "enabled" : ""}`} onClick={() => setAllowComments((value) => !value)} aria-label="Toggle comments for this poll" aria-pressed={allowComments}>
                  <span className="toggle-knob" />
                </button>
              </div>
            </label>

            <label className="field-card question-box">
              <span>Question</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength="280"
                rows="4"
                required
                placeholder="What do you want to know?"
              />
            </label>

            <div className="option-block">
              <div className="section-row">
                <span>Choices</span>
                <button type="button" className="text-button" onClick={addOption}><FiPlus size={14} /> Add option</button>
              </div>

              {options.map((option, index) => (
                <div className="option-input" key={index}>
                  <span>{index + 1}</span>
                  <input
                    value={option}
                    onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                    placeholder={`Option ${index + 1}`}
                    required
                  />
                  {options.length > 2 && (
                    <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="error" role="alert">{error}</p>}

            <div className="action-row">
              <a className="ghost" href="/"><FiArrowLeft size={14} /> Cancel</a>
              <button type="submit" className="primary" disabled={loading}><FiShare2 size={14} /> {loading ? "Publishing..." : "Publish poll"}</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Dashboard({ logout }) {
  const [polls, setPolls] = useState([]);
  const [stats, setStats] = useState({ created: 0, active: 0, deactivated: 0, totalVotes: 0 });
  const [profileOpen, setProfileOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingPoll, setEditingPoll] = useState(null);
  const [copiedShareId, setCopiedShareId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [template, setTemplate] = useState("multiple-choice");
  const [visibility, setVisibility] = useState("public");
  const [privatePassword, setPrivatePassword] = useState("");
  const defaultTemplate = TEMPLATE_PRESETS[template] || TEMPLATE_PRESETS["multiple-choice"];
  useEffect(() => {
    const pendingNotice = sessionStorage.getItem("pulseboard_notice");
    if (pendingNotice) {
      try {
        setNotice(JSON.parse(pendingNotice));
      } catch {
        setNotice({ message: pendingNotice, tone: "success" });
      }
      sessionStorage.removeItem("pulseboard_notice");
      setTimeout(() => setNotice(null), 2400);
    }
    let mounted = true;
    const refresh = async () => {
      try {
        const [loadedPolls, loadedStats] = await Promise.all([
          request("/polls/mine"),
          request("/polls/stats"),
        ]);
        if (!mounted) return;
        setPolls(loadedPolls);
        setStats(loadedStats);
        setLastSynced(new Date());
      } catch (e) {
        if (mounted) setError(e.message);
      }
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);
  const activePolls = polls.filter((poll) => poll.active);
  const topPoll = [...polls].sort((a, b) => {
    const votes = (poll) => poll.options.reduce((sum, option) => sum + option.votes, 0);
    return votes(b) - votes(a);
  })[0];
  const showNotice = (message, tone = "success") => {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 2400);
  };
  const applyTemplate = (nextTemplate) => {
    setTemplate(nextTemplate);
    setQuestion("");
    setOptions(["", ""]);
  };

  const exportAnalytics = () => {
    const rows = [
      ["poll_id", "poll_link", "question", "template", "visibility", "created_at", "status", "total_votes", "winner", "winner_votes", "option_count", "option_1", "option_1_votes", "option_2", "option_2_votes", "option_3", "option_3_votes", "option_4", "option_4_votes", "option_5", "option_5_votes", "option_6", "option_6_votes", "option_7", "option_7_votes", "option_8", "option_8_votes", "option_9", "option_9_votes", "option_10", "option_10_votes"],
    ];

    polls.forEach((poll) => {
      const totalVotes = poll.options.reduce((sum, option) => sum + Number(option.votes || 0), 0);
      const winner = [...poll.options].sort((a, b) => Number(b.votes) - Number(a.votes))[0];
      const row = [
        poll.shareId,
        `${location.origin}/p/${poll.shareId}`,
        poll.question,
        poll.template || "multiple-choice",
        poll.visibility || "public",
        poll.createdAt ? new Date(poll.createdAt * 1000).toISOString() : "",
        poll.active ? "active" : "paused",
        String(totalVotes),
        winner ? winner.text : "",
        winner ? String(winner.votes) : "0",
        String(poll.options.length),
      ];

      for (let index = 0; index < 10; index += 1) {
        const option = poll.options[index];
        row.push(option ? option.text : "");
        row.push(option ? String(option.votes) : "0");
      }

      rows.push(row);
    });

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "xpollboard-analytics.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("Analytics exported", "success");
  };

  const create = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const poll = await request("/polls", {
        method: "POST",
        body: JSON.stringify({ question, options, template, visibility, password: visibility === "private" ? privatePassword : "" }),
      });
      navigateTo(`/p/${poll.shareId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const sharePoll = async (event, shareId, question) => {
    event.preventDefault();
    event.stopPropagation();
    const url = `${location.origin}/p/${shareId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: question, text: "Vote in this XPollBoard poll", url });
        showNotice("Poll shared", "info");
      } else {
        await navigator.clipboard.writeText(url);
        showNotice("Poll link copied to clipboard", "info");
      }
    } catch {
      setError("Could not copy the poll link");
    }
  };
  const copyPollLink = async (event, shareId) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${location.origin}/p/${shareId}`);
      setCopiedShareId(shareId);
      setTimeout(() => setCopiedShareId((current) => (current === shareId ? null : current)), 1500);
    } catch {
      setError("Could not copy the poll link");
    }
  };
  const openEditPoll = (event, poll) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingPoll(poll);
  };
  const deletePoll = async (event, poll) => {
    event.preventDefault();
    event.stopPropagation();
    setPendingDelete(poll);
  };
  const confirmDelete = async () => {
    const poll = pendingDelete;
    if (!poll) return;
    setDeleting(poll.shareId);
    setError("");
    try {
      await request(`/polls/${poll.shareId}`, { method: "DELETE" });
      setPolls((current) => current.filter((item) => item.shareId !== poll.shareId));
      setStats((current) => ({ ...current, active: poll.active ? current.active - 1 : current.active, deactivated: poll.active ? current.deactivated : current.deactivated - 1 }));
      showNotice("Poll deleted", "danger");
      setPendingDelete(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting("");
    }
  };
  const togglePoll = async (event, poll) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const nextActive = !poll.active;
      await request(`/polls/${poll.shareId}/${nextActive ? "activate" : "close"}`, { method: "POST" });
      setPolls((current) => current.map((item) => item.shareId === poll.shareId ? { ...item, active: nextActive } : item));
      setStats((current) => ({ ...current, active: current.active + (nextActive ? 1 : -1), deactivated: current.deactivated + (nextActive ? -1 : 1) }));
      showNotice(nextActive ? "Poll activated" : "Poll deactivated", nextActive ? "success" : "danger");
    } catch (e) {
      setError(e.message);
    }
  };
  const saveEditedPoll = (updated) => {
    setPolls((current) => current.map((item) => item.shareId === updated.shareId ? updated : item));
    setEditingPoll(null);
    showNotice("Poll updated", "success");
  };
  const addOption = () => {
    if (options.length >= 10) {
      showNotice("A poll can have up to 10 choices.", "warning");
      return;
    }
    setOptions([...options, ""]);
  };
  const user = readStoredUser();

  return (
    <main className="dashboard-shell">
      <nav className="topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools">
          <ThemeToggle />
          <a className="primary small" href="/create"><FiPlus size={14} /> Create poll</a>
          {user && <ProfileNavButton user={user} onViewProfile={() => navigateTo("/profile")} onSignOut={logout} />}
        </div>
      </nav>

      <div className="dashboard-notices" aria-live="polite">
        {error && <p className="toast toast-error" role="alert">{error}</p>}
        {notice && (
          <p className={`toast toast-${notice.tone}`} role={notice.tone === "danger" || notice.tone === "warning" ? "alert" : "status"}>
            {notice.message}
          </p>
        )}
      </div>

      <header className="dashboard-hero">
        <p className="eyebrow">YOUR CONTROL ROOM / {activePolls.length ? "SIGNALS ACTIVE" : "READY TO LISTEN"}</p>
        <h1>Ask something worth <em>answering.</em></h1>
        <p className="dashboard-intro">Shape the room, then watch the signal move.</p>
      </header>

      <section className="stats-grid" aria-label="Poll overview">
        <div className="stat-card"><span>Polls created</span><strong>{stats.created}</strong></div>
        <div className="stat-card"><span>Total responses</span><strong>{stats.totalVotes}</strong></div>
        <div className="stat-card"><span>Active polls</span><strong>{stats.active}</strong></div>
        <div className="stat-card"><span>Deactivated</span><strong>{stats.deactivated}</strong></div>
      </section>

      <section className="analytics-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANALYTICS</p>
            <h2>Poll performance</h2>
          </div>
          <button type="button" className="text-button" onClick={exportAnalytics}><FiDownload size={14} /> Export CSV</button>
        </div>
        <div className="analytics-grid">
          <div className="analytics-panel">
            <span className="metric-label">Top poll</span>
            <strong>{topPoll ? topPoll.question : "No polls yet"}</strong>
            <small>{topPoll ? `${topPoll.options.reduce((sum, option) => sum + option.votes, 0)} responses` : "Create your first poll"}</small>
          </div>
          <div className="analytics-panel">
            <span className="metric-label">Engagement</span>
            <strong>{polls.length ? `${Math.round((activePolls.length / Math.max(polls.length, 1)) * 100)}%` : "0%"}</strong>
            <small>{activePolls.length} active poll{activePolls.length === 1 ? "" : "s"}</small>
          </div>
          <div className="analytics-panel wide">
            <span className="metric-label">Response trend</span>
            <div className="sparkline" aria-label="Poll response overview">
              {polls.length ? polls.slice(0, 6).map((poll, index) => {
                const votes = poll.options.reduce((sum, option) => sum + option.votes, 0);
                return <i key={poll.shareId} style={{ height: `${Math.max(18, (votes / Math.max(1, stats.totalVotes || 1)) * 100)}%` }} title={`${poll.question}: ${votes}`} />;
              }) : <i style={{ height: "18%" }} />}
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-card">
        <div className="workspace-copy">
          <p className="eyebrow">POLL STUDIO</p>
          <h2>Launch your next opinion snapshot from a polished workspace.</h2>
          <p>Use the separate create page to design a poll, choose a template, set access rules, and launch it with a clean, guided flow built for quick publishing.</p>
        </div>
        <div className="workspace-actions">
          <a className="primary" href="/create"><FiPlus size={14} /> Open create workspace</a>
        </div>
      </section>

      <section className="poll-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR SIGNALS</p>
            <h2>Poll library</h2>
          </div>
          <span className="sync-status">
            <i /> LIVE {lastSynced ? `· ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>

        {topPoll && <p className="featured-poll">Most participated: <strong>{topPoll.question}</strong></p>}

        {polls.length === 0 ? (
          <p className="muted">No polls yet. Your first question is waiting.</p>
        ) : (
          <div className="poll-gallery">
            {polls.map((poll) => (
              <div
                className="poll-tile"
                key={poll.shareId}
                role="link"
                tabIndex={0}
                onClick={() => navigateTo(`/p/${poll.shareId}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigateTo(`/p/${poll.shareId}`);
                  }
                }}
              >
                <div className="poll-tile-top">
                  <span className={`status-mark ${poll.active ? "active" : "closed"}`} />
                  <span>{poll.active ? "LIVE" : "PAUSED"}</span>
                  <div className="poll-tile-actions">
                    <button type="button" className="icon-button" title="Edit poll" onClick={(event) => openEditPoll(event, poll)} aria-label={`Edit ${poll.question}`}>
                      <FiEdit3 size={14} />
                    </button>
                    <button type="button" className="icon-button" title={poll.active ? "Deactivate poll" : "Activate poll"} onClick={(event) => { event.preventDefault(); event.stopPropagation(); togglePoll(event, poll); }} aria-label={poll.active ? `Deactivate ${poll.question}` : `Activate ${poll.question}`}>
                      {poll.active ? <FiToggleRight size={14} /> : <FiToggleLeft size={14} />}
                    </button>
                    <button type="button" className="icon-button" title="Copy link" onClick={(event) => { event.preventDefault(); event.stopPropagation(); copyPollLink(event, poll.shareId); }} aria-label={`Copy link for ${poll.question}`}>
                      {copiedShareId === poll.shareId ? <FiCheck size={14} /> : <FiCopy size={14} />}
                    </button>
                    <button type="button" className="icon-button danger" title="Delete poll" onClick={(event) => { event.preventDefault(); event.stopPropagation(); deletePoll(event, poll); }} aria-label={`Delete ${poll.question}`}><FiTrash2 size={14} /></button>
                  </div>
                </div>
                <div className="poll-link-wrap">
                  <h3>{poll.question}</h3>
                  <div className="poll-tile-meta">
                    <span>{poll.options.reduce((sum, option) => sum + option.votes, 0)} responses</span>
                    <span>{poll.options.length} choices</span>
                    <b>Open pulse →</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingPoll && (
        <EditPollDialog
          poll={editingPoll}
          busy={false}
          onCancel={() => setEditingPoll(null)}
          onSaved={saveEditedPoll}
        />
      )}

      {pendingDelete && (
        <DeleteConfirm
          question={pendingDelete.question}
          busy={deleting === pendingDelete.shareId}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {profileOpen && <ProfilePanel user={user} stats={stats} onClose={() => setProfileOpen(false)} />}

      <a className="dashboard-create-fab" href="/create" aria-label="Create a poll" title="Create a poll">
        <FiPlus size={24} strokeWidth={2.5} />
      </a>
    </main>
  );
}

function PollInsights({ poll, activity, editing, onEdit, onCloseEdit, onSaved }) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  const sorted = [...poll.options].sort((a, b) => b.votes - a.votes);
  const topVotes = sorted[0]?.votes ?? 0;
  const leaders = sorted.filter((option) => option.votes === topVotes);
  const leader = leaders[0] || null;
  const second = sorted.find((option) => option.id !== leader?.id) || null;
  const leaderPercent = leader && total ? Math.round((leader.votes / total) * 100) : 0;
  const leadGap = leader && second && leader.votes - second.votes > 0 ? leader.votes - second.votes : 0;
  const close = leader && second && total > 0 && leader.votes - second.votes <= Math.max(3, Math.ceil(total * 0.05));

  const leadingNames = leaders.map((option) => option.text).join(" / ");
  const insightText = total === 0
    ? "No responses yet — this poll is waiting for its first vote."
    : leaders.length > 1
      ? `${leadingNames} are tied at ${topVotes} vote${topVotes === 1 ? "" : "s"} and ${leaderPercent}% of all votes.`
      : leader && leaderPercent >= 50
        ? `${leader.text} is leading with ${leaderPercent}% of all votes.`
        : leader && second
          ? `${leader.text} is ahead by ${leadGap} vote${leadGap === 1 ? "" : "s"}, and the race is still close.`
          : leader
            ? `${leader.text} is the current front-runner with ${leaderPercent}% of the votes.`
            : "The poll is active and gathering responses.";

  return (
    <aside className="insights">
      <div className="section-heading">
        <div>
          <p className="eyebrow">POLL INSIGHTS</p>
          <h2>What the room is saying</h2>
        </div>
        <span className="insight-badge">{activity} this minute</span>
      </div>

      <div className="insight-copy">
        <p><strong>{leader ? leader.text : "Waiting for votes"}</strong> {total === 0 ? "has not received a response yet." : `is leading with ${leaderPercent}% of the votes.`}</p>
        <p>{insightText}</p>
        <p>{total} total vote{total === 1 ? "" : "s"} · {activity} interaction{activity === 1 ? "" : "s"} in the last minute.</p>
      </div>

      {poll.isOwner && <button className="insight-edit" type="button" onClick={onEdit}><FiEdit3 size={14} /> Edit poll details</button>}
      {editing && <EditPollDialog poll={poll} busy={false} onCancel={onCloseEdit} onSaved={onSaved} />}
    </aside>
  );
}

function PollPage({ shareID }) {
  const [poll, setPoll] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState(localStorage.getItem(`voted_${shareID}`) || "");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [editingPoll, setEditingPoll] = useState(false);
  const [toggling, setToggling] = useState(false);
  useEffect(() => {
    let active = true;
    request(`/polls/${shareID}`).then((loadedPoll) => {
      if (!active) return;
      setPoll(loadedPoll);
      if (loadedPoll.isOwner) request(`/polls/${shareID}/insights`).then(setInsights).catch(() => setInsights(null));
    }).catch((e) => setError(e.message));
    const ws = new WebSocket(API.replace(/^http/, "ws") + `/polls/${shareID}/live`);
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setPoll((current) => current ? { ...current, options: current.options.map((option) => option.id === update.optionId ? { ...option, votes: update.votes } : option) } : current);
    };
    return () => { active = false; ws.close(); };
  }, [shareID]);
  const total = useMemo(() => poll?.options.reduce((sum, option) => sum + option.votes, 0) || 0, [poll]);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: poll.question, text: "Vote in this XPollBoard poll", url: location.href });
      else await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) { if (e.name !== "AbortError") setError("Could not share this poll"); }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy the poll link");
    }
  };
  const vote = async (optionId) => {
    if (optionId === voted) return;
    try {
      await request(`/polls/${shareID}/votes`, {
        method: "POST",
        body: JSON.stringify({ optionId, previousOptionId: voted }),
      });
      localStorage.setItem(`voted_${shareID}`, optionId);
      setVoted(optionId);
    } catch (e) {
      setError(e.message);
    }
  };
  const deletePoll = async () => {
    setPendingDelete(true);
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await request(`/polls/${shareID}`, { method: "DELETE" });
      sessionStorage.setItem("pulseboard_notice", JSON.stringify({ message: "Poll deleted", tone: "danger" }));
      navigateTo("/");
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };
  const togglePoll = async () => {
    setToggling(true);
    try {
      const nextActive = !poll.active;
      await request(`/polls/${shareID}/${nextActive ? "activate" : "close"}`, { method: "POST" });
      setPoll((current) => ({ ...current, active: nextActive }));
    } catch (e) {
      setError(e.message);
    } finally {
      setToggling(false);
    }
  };
  const saveEdit = (updated) => {
    setPoll(updated);
    setEditingPoll(false);
  };
  if (error) return <main className="poll-page"><a className="brand" href="/">XPoll<span>Board</span></a><p className="error" role="alert">{error}</p></main>;
  if (!poll) return <main className="poll-page loading">Loading live poll...</main>;
  return <main className="poll-page"><nav><a className="brand" href="/">XPoll<span>Board</span></a><div className="poll-nav-actions"><ThemeToggle /><a className="ghost back-link" href="/">Ã¢â€ Â Back to dashboard</a><button className="ghost" onClick={share}>Share poll Ã¢â€ â€”</button><button className="ghost" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>{poll.isOwner && <><button className="ghost" onClick={() => setEditingPoll(true)}>Edit poll</button><button className="ghost" disabled={toggling} onClick={togglePoll}>{toggling ? "Updating..." : poll.active ? "Deactivate poll" : "Activate poll"}</button><button className="ghost danger-button" disabled={deleting} onClick={deletePoll}>{deleting ? "Deleting..." : "Delete poll"}</button></>}</div></nav><div className="poll-layout"><section className="poll-card"><p className="eyebrow"><i className="live-indicator" /> {poll.active ? "LIVE POLL" : "POLL DEACTIVATED"}</p><h1>{poll.question}</h1><p className="muted">{total} {total === 1 ? "response" : "responses"} Ã‚Â· updates instantly</p><div className="choices">{poll.options.map((option) => { const percent = total ? Math.round((option.votes / total) * 100) : 0; return <button key={option.id} className={`choice ${voted === option.id ? "selected" : ""}`} disabled={!poll.active} onClick={() => vote(option.id)}><span>{option.text}</span>{(voted || poll.isOwner) && <><i style={{ width: `${percent}%` }} /><b>{percent}%</b></>}</button>; })}</div>{voted && <p className="thanks">Your vote is in. Choose another option anytime to change your response.</p>}</section>{poll.isOwner && <div className="results-column"><section className="live-results"><div className="section-heading"><div><p className="eyebrow">LIVE RESULTS</p><h2>Response pulse</h2></div><strong>{total} <small>total votes</small></strong></div>{poll.options.map((option) => { const percent = total ? Math.round((option.votes / total) * 100) : 0; return <div className="result-row" key={option.id}><div><span>{option.text}</span><b>{option.votes} votes Ã‚Â· {percent}%</b></div><div className="result-track"><i style={{ width: `${percent}%` }} /></div></div>})}</section><PollInsights poll={poll} activity={insights?.responsesLastMinute || 0} editing={editingPoll} onEdit={() => setEditingPoll(true)} onCloseEdit={() => setEditingPoll(false)} onSaved={saveEdit} /></div>}</div>{pendingDelete && <DeleteConfirm question={poll.question} busy={deleting} onCancel={() => setPendingDelete(false)} onConfirm={confirmDelete} />}</main>;
}
function PollPageClean({ shareID, logout }) {
  const [poll, setPoll] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState(localStorage.getItem(`voted_${shareID}`) || "");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [accessRequired, setAccessRequired] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [notice, setNotice] = useState("");
  const loadPollAndMeta = async () => {
    try {
      const loaded = await request(`/polls/${shareID}`);
      const accessGranted = sessionStorage.getItem(`private_access_${shareID}`) === "granted";
      if (loaded.visibility === "private" && !loaded.isOwner && !accessGranted) {
        setAccessRequired(true);
        setPoll(loaded);
        return;
      }
      setPoll(loaded);
      setAccessRequired(false);
      const storedVote = localStorage.getItem(`voted_${shareID}`);
      const selectedOption = loaded.options?.find((option) => option.id === storedVote);
      if (selectedOption) {
        const history = JSON.parse(localStorage.getItem("pulseboard_vote_history") || "[]");
        const entry = { label: loaded.question, pollId: shareID, option: selectedOption.text, createdAt: Date.now() };
        const withoutPoll = history.filter((vote) => vote.pollId !== shareID);
        localStorage.setItem("pulseboard_vote_history", JSON.stringify([entry, ...withoutPoll].slice(0, 20)));
      }
      if (loaded.isOwner) request(`/polls/${shareID}/insights`).then(setInsights).catch(() => {});
      const commentsData = await request(`/polls/${shareID}/comments`);
      setComments(commentsData.comments || []);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    let active = true;
    const start = async () => {
      if (!active) return;
      await loadPollAndMeta();
    };
    start();
    const socket = new WebSocket(API.replace(/^http/, "ws") + `/polls/${shareID}/live`);
    socket.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (!update || !update.optionId) return;
        setPoll((current) => {
          if (!current) return current;
          return {
            ...current,
            options: current.options.map((option) => {
              if (option.id !== update.optionId) return option;
              return { ...option, votes: Number(update.votes ?? option.votes) };
            }),
          };
        });
      } catch {
        // Ignore malformed live updates.
      }
    };
    return () => { active = false; socket.close(); };
  }, [shareID]);
  const total = useMemo(() => poll?.options.reduce((sum, option) => sum + option.votes, 0) || 0, [poll]);
  const insightSummary = useMemo(() => {
    if (!poll) return "Loading poll insights...";
    if (total === 0) return "No responses yet — this poll is waiting for its first vote.";
    if (insights?.summary) return insights.summary;
    const ordered = [...poll.options].sort((a, b) => Number(b.votes) - Number(a.votes));
    const leader = ordered[0];
    const second = ordered[1];
    if (!leader) return "The poll is active and gathering responses.";
    const leaderPercent = Math.round((leader.votes / total) * 100);
    if (leaderPercent >= 50) return `${leader.text} is leading with ${leaderPercent}% of all votes.`;
    if (second) return `${leader.text} is ahead by ${leader.votes - second.votes} vote${leader.votes - second.votes === 1 ? "" : "s"}, and the race is still close.`;
    return `${leader.text} is the current front-runner with ${leaderPercent}% of the votes.`;
  }, [poll, total, insights]);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: poll.question, text: "Vote in this XPollBoard poll", url: location.href });
      else await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) { if (e.name !== "AbortError") setError("Could not share this poll"); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setError("Could not copy the poll link"); }
  };
  const vote = async (optionId) => {
    if (optionId === voted) return;
    if (poll?.allowComments && !localStorage.getItem("pulseboard_token")) {
      redirectToAuth("/login");
      return;
    }
    const previousOptionId = voted;
    setPoll((current) => {
      if (!current) return current;
      return {
        ...current,
        options: current.options.map((option) => {
          let nextVotes = option.votes;
          if (option.id === optionId) nextVotes += 1;
          if (previousOptionId && option.id === previousOptionId) nextVotes = Math.max(0, nextVotes - 1);
          return { ...option, votes: nextVotes };
        }),
      };
    });
    try {
      await request(`/polls/${shareID}/votes`, { method: "POST", body: JSON.stringify({ optionId, previousOptionId }) });
      localStorage.setItem(`voted_${shareID}`, optionId);
      const selectedOption = poll?.options.find((option) => option.id === optionId);
      const voteHistory = JSON.parse(localStorage.getItem("pulseboard_vote_history") || "[]");
      const nextVote = {
        label: poll?.question || "Vote",
        pollId: shareID,
        option: selectedOption?.text || "selected",
        createdAt: Date.now(),
      };
      const withoutPoll = voteHistory.filter((entry) => entry.pollId !== shareID);
      localStorage.setItem("pulseboard_vote_history", JSON.stringify([nextVote, ...withoutPoll].slice(0, 20)));
      setVoted(optionId);
      setNotice("Your vote was recorded");
    } catch (e) {
      setPoll((current) => current ? { ...current, options: current.options.map((option) => {
        if (option.id === optionId && previousOptionId) return { ...option, votes: Math.max(0, Number(option.votes) - 1) };
        if (previousOptionId && option.id === previousOptionId) return { ...option, votes: Number(option.votes) + 1 };
        return option;
      }) } : current);
      setError(e.message);
    }
  };
  const unlockPoll = async (event) => {
    event.preventDefault();
    setAccessError("");
    try {
      await request(`/polls/${shareID}/access`, { method: "POST", body: JSON.stringify({ password: accessPassword }) });
      sessionStorage.setItem(`private_access_${shareID}`, "granted");
      setAccessRequired(false);
      setNotice("Poll unlocked");
      await loadPollAndMeta();
    } catch (e) {
      setAccessError(e.message);
    }
  };
  const submitComment = async (event) => {
    event.preventDefault();
    if (!commentDraft.trim()) return;
    if (poll?.allowComments && !localStorage.getItem("pulseboard_token")) {
      redirectToAuth();
      return;
    }
    try {
      const currentUser = readStoredUser();
      const name = currentUser?.name || "Guest";
      const result = await request(`/polls/${shareID}/comments`, {
        method: "POST",
        body: JSON.stringify({ userName: name, message: commentDraft }),
      });
      const history = JSON.parse(localStorage.getItem("pulseboard_comment_history") || "[]");
      history.unshift({ userName: name, message: commentDraft, pollId: shareID, createdAt: Date.now() });
      localStorage.setItem("pulseboard_comment_history", JSON.stringify(history.slice(0, 20)));
      setComments((current) => [...current, result]);
      setCommentDraft("");
    } catch (e) {
      setError(e.message);
    }
  };
  const deletePoll = () => setPendingDelete(true);
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await request(`/polls/${shareID}`, { method: "DELETE" });
      sessionStorage.setItem("pulseboard_notice", JSON.stringify({ message: "Poll deleted", tone: "danger" }));
      navigateTo("/");
    } catch (e) { setError(e.message); setDeleting(false); }
  };
  const togglePoll = async () => {
    setToggling(true);
    try {
      const active = !poll.active;
      await request(`/polls/${shareID}/${active ? "activate" : "close"}`, { method: "POST" });
      setPoll((current) => ({ ...current, active }));
    } catch (e) { setError(e.message); }
    finally { setToggling(false); }
  };
  if (error) return <main className="poll-page"><a className="brand" href="/">XPoll<span>Board</span></a><p className="error" role="alert">{error}</p></main>;
  if (accessRequired) {
    return (
      <main className="poll-page">
        <Notice message={notice} tone="success" />
        <nav className="topbar poll-topbar">
          <a className="brand" href="/">XPoll<span>Board</span></a>
          <div className="nav-tools poll-nav-actions">
            <ThemeToggle />
          </div>
        </nav>
        <section className="private-gate">
          <p className="eyebrow">PRIVATE POLL</p>
          <h1>This poll is protected</h1>
          <p>Enter the password to continue.</p>
          <form onSubmit={unlockPoll} className="private-form">
            <input type="password" value={accessPassword} onChange={(event) => setAccessPassword(event.target.value)} placeholder="Poll password" required />
            {accessError && <p className="error" role="alert">{accessError}</p>}
            <button type="submit" className="primary"><FiLink size={14} /> Unlock poll</button>
          </form>
        </section>
      </main>
    );
  }
  if (!poll) return <main className="poll-page loading">Loading live poll...</main>;

  const sorted = [...poll.options].sort((a, b) => Number(b.votes) - Number(a.votes));
  const topVotes = sorted[0]?.votes ?? 0;
  const leaders = sorted.filter((option) => Number(option.votes) === Number(topVotes));
  const leader = leaders[0] || null;
  const runnerUp = sorted.find((option) => option.id !== leader?.id) || null;
  const leadGap = leader && runnerUp ? leader.votes - runnerUp.votes : 0;
  const leaderPct = total ? Math.round((leader?.votes || 0) / total * 100) : 0;
  const leadingLabel = leaders.length > 1 ? leaders.map((option) => option.text).join(" / ") : (leader ? leader.text : "—");

  const showAudienceView = !poll.isOwner;

  return (
    <main className="poll-page">
      <Notice message={notice} tone="success" />
      <nav className="topbar poll-topbar">
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <div className="nav-tools poll-nav-actions">
          <ThemeToggle />
          {poll.isOwner && <a className="ghost" href="/" aria-label="Back to dashboard"><FiHome size={14} /> Dashboard</a>}
          {readStoredUser() && <ProfileNavButton user={readStoredUser()} onViewProfile={() => navigateTo("/profile")} onSignOut={logout} />}
        </div>
      </nav>

      <div className={`poll-layout ${showAudienceView ? "poll-layout-full" : "poll-layout-standard"}`}>
        {!showAudienceView && (
          <aside className="poll-insights-panel">
            <div className="insight-header">
              <p className="eyebrow">POLL INSIGHTS</p>
              <h2>Live snapshot</h2>
            </div>

            <div className="insight-chip-row">
              <div className="insight-metric">
                <span>Total votes</span>
                <strong>{total}</strong>
              </div>
              <div className="insight-metric">
                <span>Leading</span>
                <strong>{leadingLabel}</strong>
              </div>
            </div>

            <div className="insight-summary-box">
              <p>{leaders.length > 0 ? (leaders.length > 1 ? `${leaders.map((option) => option.text).join(" / ")} are tied at ${topVotes} vote${topVotes === 1 ? "" : "s"} and ${leaderPct}%` : `${leader.text} leads with ${leaderPct}%`) : "Waiting for the first vote."}</p>
              <small>{leaders.length > 1 ? "Tied for the lead right now." : (leader && runnerUp ? `${leadGap} vote${leadGap === 1 ? "" : "s"} ahead of ${runnerUp.text}` : "The result is still open.")}</small>
            </div>

            <div className="insight-list">
              {poll.options.map((option) => {
                const optionPercent = total ? Math.round((option.votes / total) * 100) : 0;
                const isLeader = leaders.some((leaderOption) => leaderOption.id === option.id);
                return (
                  <div key={option.id} className={`insight-option ${isLeader ? "leader" : ""}`}>
                    <div className="insight-rowline">
                      <span>{option.text}</span>
                      <b>{option.votes}</b>
                    </div>
                    <div className="insight-bar">
                      <i style={{ width: `${optionPercent}%` }} />
                    </div>
                    <small>{optionPercent}% of votes</small>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        <div className="poll-main-column">
          <section className="poll-card">
          {poll.isOwner && (
            <nav className="poll-card-actions" aria-label="Poll actions">
              <button className="ghost" onClick={share} aria-label="Share poll"><FiShare2 size={14} /> Share</button>
              <button className="ghost" onClick={copyLink} aria-label="Copy poll link">{copied ? <><FiCheck size={14} /> Copied</> : <><FiCopy size={14} /> Copy link</>}</button>
              <button className="ghost" onClick={() => setEditing(true)} aria-label="Edit poll"><FiEdit3 size={14} /> Edit</button>
              <button className="ghost" disabled={toggling} onClick={togglePoll} aria-label={poll.active ? "Deactivate poll" : "Activate poll"}>{toggling ? <><FiToggleLeft size={14} /> Updating...</> : poll.active ? <><FiToggleRight size={14} /> Deactivate</> : <><FiToggleLeft size={14} /> Activate</>}</button>
              <button className="ghost danger-button" disabled={deleting} onClick={deletePoll} aria-label="Delete poll"><FiTrash2 size={14} /> {deleting ? "Deleting..." : "Delete"}</button>
            </nav>
          )}

          <p className="eyebrow">{poll.active ? "LIVE POLL" : "POLL DEACTIVATED"}</p>
          <h1>{poll.question}</h1>
          <p className="muted">{total} responses · live updates</p>

          <div className="choices">
            {poll.options.map((option, index) => {
              const percent = total ? Math.round((option.votes / total) * 100) : 0;
              return (
                <button key={option.id} className={`choice ${voted === option.id ? "selected" : ""}`} disabled={!poll.active} onClick={() => vote(option.id)}>
                  <span className="choice-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="choice-body">
                    <span className="choice-label">{option.text}</span>
                    <small>{voted === option.id ? "Your selection" : "Select option"}</small>
                  </div>
                  <b>{percent}%</b>
                  <i style={{ width: `${percent}%` }} />
                </button>
              );
            })}
          </div>

          {voted && <p className="thanks">Your vote is in. Choose another option anytime to change your response.</p>}

          {poll.allowComments && (
            <div className="comment-thread">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">DISCUSSION</p>
                  <h2>Comments</h2>
                </div>
              </div>
              <form onSubmit={submitComment} className="comment-form">
                <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength="280" placeholder="Add a comment or feedback" />
                <button type="submit" className="primary small"><FiMessageCircle size={14} /> Post</button>
              </form>
              <div className="comment-list">
                {comments.length === 0 ? <p className="muted">No comments yet. Start the conversation.</p> : comments.map((comment) => (
                  <article key={comment.id || `${comment.userName}-${comment.createdAt}`} className="comment-item">
                    <strong>{comment.userName}</strong>
                    <p>{comment.message}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
          </section>
        </div>
      </div>

      {editing && (
        <EditPollDialog
          poll={poll}
          busy={false}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setPoll(updated);
            setEditing(false);
          }}
        />
      )}

      {pendingDelete && (
        <DeleteConfirm
          question={poll.question}
          busy={deleting}
          onCancel={() => setPendingDelete(false)}
          onConfirm={confirmDelete}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
