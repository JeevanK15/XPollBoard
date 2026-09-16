import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
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
function App() {
  const [route, setRoute] = useState(location.pathname),
    [token, setToken] = useState(
      localStorage.getItem("pulseboard_token") || "",
    );
  useEffect(() => {
    const f = () => setRoute(location.pathname);
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  if (route.startsWith("/p/"))
    return <PollPage shareID={route.split("/").pop()} />;
  if (!token && (route === "/login" || route === "/signup"))
    return (
      <AuthPage
        mode={route === "/signup" ? "signup" : "login"}
        done={() => setToken(localStorage.getItem("pulseboard_token"))}
      />
    );
  return token ? (
    <Dashboard
      logout={() => {
        localStorage.removeItem("pulseboard_token");
        setToken("");
      }}
    />
  ) : (
    <Landing
      initialMode={route === "/signup" ? "signup" : "login"}
      done={() => setToken(localStorage.getItem("pulseboard_token"))}
    />
  );
}
function Demo({ label, percent }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <i style={{ width: percent }}></i>
      <b>{percent}</b>
    </div>
  );
}
function DeleteConfirm({ question, busy, onCancel, onConfirm }) {
  return (
    <div className="confirm-backdrop">
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
        <p className="eyebrow">IRREVERSIBLE ACTION</p>
        <h2 id="delete-title">Delete this poll?</h2>
        <p id="delete-description">“{question}” will be permanently removed. Its public link will stop working.</p>
        <div className="confirm-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>Keep poll</button>
          <button className="confirm-delete" onClick={onConfirm} disabled={busy}>{busy ? "Deleting..." : "Delete poll"}</button>
        </div>
      </section>
    </div>
  );
}
function AuthPage({ mode, done }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await request(`/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      localStorage.setItem("pulseboard_token", data.token);
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="auth-page">
      <nav>
        <a className="brand" href="/">XPoll<span>Board</span></a>
        <a className="ghost auth-nav-link" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create account"}
        </a>
      </nav>
      <section className="auth-panel">
        <p className="eyebrow">{isSignup ? "CREATE YOUR SPACE" : "WELCOME BACK"}</p>
        <h1>{isSignup ? "Your next question starts here." : "Sign in to create a poll."}</h1>
        <p className="muted">{isSignup ? "Bring your next conversation into focus." : "Pick up where your audience left off."}</p>
        <form onSubmit={submit}>
          {isSignup && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} minLength="2" required placeholder="Your name" /></label>}
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength="8" required placeholder="At least 8 characters" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}<span>→</span></button>
        </form>
        <p className="auth-switch">{isSignup ? "Already have an account?" : "New here?"} <a href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create an account"}</a></p>
      </section>
    </main>
  );
}
function Landing() {
  return (
    <main className="landing">
      <nav>
        <a className="brand" href="/">
          XPoll<span>Board</span>
        </a>
        <div className="landing-actions"><a className="ghost" href="/login">Sign in</a><a className="landing-join" href="/signup">Create a poll <span>↗</span></a></div>
      </nav>
      <div className="landing-kicker"><span>PUBLIC ROOM</span><i /> <span>CREATE. VOTE. DISCOVER THE PULSE.</span></div>
      <section className="hero">
        <div>
          <p className="eyebrow">CREATE. VOTE. DISCOVER THE PULSE.</p>
          <h1>
            Create. Vote.
            <br />
            <em>Discover the Pulse.</em>
          </h1>
          <p className="subhead">
            Create a question, share one link, and watch the conversation take
            shape in real time.
          </p>
          <a className="primary" href="/signup">
            Start a live poll <span>→</span>
          </a>
          <div className="proof">
            <b>WebSocket live</b>
            <b>Redis-powered</b>
            <b>No refresh</b>
          </div>
        </div>
        <div className="demo-card">
          <div className="live-dot">● LIVE NOW</div>
          <h3>Which skill should we learn next?</h3>
          <Demo label="TypeScript" percent="62%" />
          <Demo label="Go" percent="25%" />
          <Demo label="Rust" percent="13%" />
          <p className="responses">128 responses · updating live</p>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ logout }) {
  const [polls, setPolls] = useState([]);
  const [stats, setStats] = useState({ created: 0, active: 0, deactivated: 0, totalVotes: 0 });
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
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
  const create = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const poll = await request("/polls", {
        method: "POST",
        body: JSON.stringify({ question, options }),
      });
      location.assign(`/p/${poll.shareId}`);
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
      showNotice("Poll link copied to clipboard", "info");
    } catch {
      setError("Could not copy the poll link");
    }
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
  const addOption = () => {
    if (options.length >= 10) {
      showNotice("A poll can have up to 10 choices.", "warning");
      return;
    }
    setOptions([...options, ""]);
  };
  return (
    <main className="dashboard">
      <nav><a className="brand" href="/">XPoll<span>Board</span></a><button className="ghost" onClick={logout}>Sign out</button></nav>
      <div className="dashboard-notices" aria-live="polite">{error && <p className="toast toast-error" role="alert">{error}</p>}{notice && <p className={`toast toast-${notice.tone}`} role={notice.tone === "danger" || notice.tone === "warning" ? "alert" : "status"}>{notice.message}</p>}</div>
      <header className="dashboard-hero"><div><p className="eyebrow">YOUR CONTROL ROOM / {activePolls.length ? "SIGNALS ACTIVE" : "READY TO LISTEN"}</p><h1>Ask something worth<br /><em>answering.</em></h1><p className="dashboard-intro">Shape the room, then watch the signal move.</p></div></header>
      <section className="stats-grid" aria-label="Poll overview">
        <div className="stat"><span>Polls created</span><strong>{stats.created}</strong></div>
        <div className="stat"><span>Total responses</span><strong>{stats.totalVotes}</strong></div>
        <div className="stat"><span>Active polls</span><strong>{stats.active}</strong></div>
        <div className="stat"><span>Deactivated polls</span><strong>{stats.deactivated}</strong></div>
      </section>
      <section className="composer"><form onSubmit={create}>
        <div className="section-heading"><div><p className="eyebrow">NEW SIGNAL</p><h2>Open a question</h2></div><span className="composer-note">2-10 choices</span></div>
        <label>Your question<textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength="280" required placeholder="What do you want to know?" /></label>
        <div className="option-head"><span>Response options</span><button type="button" className="text-button" onClick={addOption}>+ Add option</button></div>
        {options.map((option, index) => <div className="option-input" key={index}><span>{index + 1}</span><input value={option} onChange={(e) => setOptions(options.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} required placeholder={`Option ${index + 1}`} />{options.length > 2 && <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions(options.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}
        <button className="primary" disabled={loading}>{loading ? "Creating..." : "Publish poll"} <span>→</span></button>
      </form></section>
      <section className="poll-list"><div className="section-heading"><div><p className="eyebrow">YOUR SIGNALS</p><h2>Poll library</h2></div><span className="sync-status"><i /> LIVE {lastSynced ? `· ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>{topPoll && <p className="featured-poll">Most participated: <strong>{topPoll.question}</strong></p>}{polls.length === 0 ? <p className="muted">No polls yet. Your first question is waiting.</p> : polls.map((poll) => <article className="poll-row" key={poll.shareId}><div className="poll-row-main"><span className={`status-mark ${poll.active ? "active" : "closed"}`} aria-label={poll.active ? "Live poll" : "Closed poll"} /><div><a className="poll-title" href={`/p/${poll.shareId}`}>{poll.question}</a><small>{poll.active ? "Live now" : "Deactivated"} · {poll.options.reduce((sum, option) => sum + option.votes, 0)} responses</small></div></div><div className="poll-actions"><a href={`/p/${poll.shareId}`}>View <span>→</span></a><button type="button" onClick={(event) => sharePoll(event, poll.shareId, poll.question)}>Share</button><button type="button" onClick={(event) => copyPollLink(event, poll.shareId)}>Copy link</button><button type="button" onClick={(event) => togglePoll(event, poll)}>{poll.active ? "Deactivate" : "Activate"}</button><button type="button" className="danger-button" disabled={deleting === poll.shareId} onClick={(event) => deletePoll(event, poll)}>{deleting === poll.shareId ? "Deleting..." : "Delete"}</button></div></article>)}</section>
      {pendingDelete && <DeleteConfirm question={pendingDelete.question} busy={deleting === pendingDelete.shareId} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
    </main>
  );
}

function PollInsights({ poll, activity }) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  const sorted = [...poll.options].sort((a, b) => b.votes - a.votes);
  const leader = sorted[0];
  const second = sorted[1];
  const leaderPercent = total ? Math.round((leader.votes / total) * 100) : 0;
  const close = total > 0 && second && leader.votes - second.votes <= Math.max(3, Math.ceil(total * 0.05));
  return <aside className="insights"><div className="section-heading"><div><p className="eyebrow">POLL INSIGHTS</p><h2>What the room is saying</h2></div><span className="insight-badge">{activity} this minute</span></div>{total === 0 ? <p className="muted">Insights will appear after the first response.</p> : <div className="insight-copy"><p><strong>{leader.text}</strong> is leading with {leaderPercent}% of the votes.</p><p>{close ? `The top two choices are separated by only ${leader.votes - second.votes} vote${leader.votes - second.votes === 1 ? "" : "s"} - this poll is closely contested.` : leaderPercent > 50 ? `${leader.text} has received more than half of all votes.` : "No option has a majority yet."}</p><p>{total} {total === 1 ? "person has" : "people have"} participated in this poll.</p></div>}</aside>;
}

function PollPage({ shareID }) {
  const [poll, setPoll] = useState(null);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState(localStorage.getItem(`voted_${shareID}`) || "");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
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
      location.assign("/");
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
  if (error) return <main className="poll-page"><a className="brand" href="/">pulse<span>board</span></a><p className="error" role="alert">{error}</p></main>;
  if (!poll) return <main className="poll-page loading">Loading live poll...</main>;
  return <main className="poll-page"><nav><a className="brand" href="/">pulse<span>board</span></a><div className="poll-nav-actions"><a className="ghost back-link" href="/">← Back to dashboard</a><button className="ghost" onClick={share}>Share poll ↗</button><button className="ghost" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>{poll.isOwner && <><button className="ghost" disabled={toggling} onClick={togglePoll}>{toggling ? "Updating..." : poll.active ? "Deactivate poll" : "Activate poll"}</button><button className="ghost danger-button" disabled={deleting} onClick={deletePoll}>{deleting ? "Deleting..." : "Delete poll"}</button></>}</div></nav><div className="poll-layout"><section className="poll-card"><p className="eyebrow"><i className="live-indicator" /> {poll.active ? "LIVE POLL" : "POLL DEACTIVATED"}</p><h1>{poll.question}</h1><p className="muted">{total} {total === 1 ? "response" : "responses"} · updates instantly</p><div className="choices">{poll.options.map((option) => { const percent = total ? Math.round((option.votes / total) * 100) : 0; return <button key={option.id} className={`choice ${voted === option.id ? "selected" : ""}`} disabled={!poll.active} onClick={() => vote(option.id)}><span>{option.text}</span>{(voted || poll.isOwner) && <><i style={{ width: `${percent}%` }} /><b>{percent}%</b></>}</button>; })}</div>{voted && <p className="thanks">Your vote is in. Choose another option anytime to change your response.</p>}</section>{poll.isOwner && <div className="results-column"><section className="live-results"><div className="section-heading"><div><p className="eyebrow">LIVE RESULTS</p><h2>Response pulse</h2></div><strong>{total} <small>total votes</small></strong></div>{poll.options.map((option) => { const percent = total ? Math.round((option.votes / total) * 100) : 0; return <div className="result-row" key={option.id}><div><span>{option.text}</span><b>{option.votes} votes · {percent}%</b></div><div className="result-track"><i style={{ width: `${percent}%` }} /></div></div>})}</section><PollInsights poll={poll} activity={insights?.responsesLastMinute || 0} /></div>}</div>{pendingDelete && <DeleteConfirm question={poll.question} busy={deleting} onCancel={() => setPendingDelete(false)} onConfirm={confirmDelete} />}</main>;
}
createRoot(document.getElementById("root")).render(<App/>);
