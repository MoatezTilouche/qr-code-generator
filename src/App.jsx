import { useEffect, useRef, useState } from "react";

const layerTimings = [[0, 25], [0.15, 15.9], [0.53, 26.4], [0.45, 17.8], [1.6, 19.2], [1.6, 29.2], [1.6, 20.2]];
const apiBaseUrl = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL || "https://qr-code-api-ce0a.onrender.com").replace(/\/+$/, "")
  : "";

function Icon({ name }) {
  const paths = {
    qr: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2",
    upload: "M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5",
    download: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
    lock: "M6 10h12v10H6zM8 10V7a4 4 0 0 1 8 0v3",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function GenerateButton({ disabled, busy }) {
  const label = busy ? "Generating…" : "Generate QR Code";
  return (
    // Button adapted from Uiverse.io by dexter-st.
    <div className={`btn-wrapper${busy ? " is-loading" : ""}`}>
      <div className="light" aria-hidden="true" />
      {layerTimings.map(([delay, duration], index) => <div key={index} className="gradient-layer" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }} aria-hidden="true" />)}
      <button type="submit" className="gradient-btn" disabled={disabled}>{label}</button>
      <div className="text-overlay" aria-hidden="true">{label}</div>
    </div>
  );
}

function CubeLoader() {
  return (
    // Loader adapted from Uiverse.io by andrew-demchenk0.
    <div className="loading-state" role="status">
      <div className="cube-loader" aria-hidden="true">
        <div className="cube-top" />
        <div className="cube-wrapper">{[0, 1, 2, 3].map(index => <span key={index} style={{ "--i": index }} className="cube-span" />)}</div>
      </div>
      <p>Creating your QR code…</p>
    </div>
  );
}

function Placeholder() {
  return <div className="empty-state">
    <div className="placeholder-qr" aria-hidden="true"><svg viewBox="0 0 120 120" fill="currentColor"><path fillRule="evenodd" d="M8 8h38v38H8zm8 8v22h22V16zm58-8h38v38H74zm8 8v22h22V16zM8 74h38v38H8zm8 8v22h22V82z" /><path d="M22 22h10v10H22zm66 0h10v10H88zM22 88h10v10H22zM56 8h8v16h-8zm0 28h8v20h16v8H56zM8 56h16v8H8zm28 0h8v8h-8zm38-2h20v10H74zm30 0h8v24h-8zM56 76h8v20h16v16H56zm18-2h20v20H74zm20 28h18v10H94z" /></svg></div>
    <p>Your next connection<br />starts here.</p><span>Add your content and hit generate.</span>
  </div>;
}

function useObjectUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

export default function App() {
  const [content, setContent] = useState("");
  const [logo, setLogo] = useState(null);
  const [result, setResult] = useState(null);
  const [dimensions, setDimensions] = useState("");
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validatingLogo, setValidatingLogo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [invalidContent, setInvalidContent] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const fileInput = useRef(null);
  const contentInput = useRef(null);
  const request = useRef(null);
  const selectionVersion = useRef(0);
  const submitting = useRef(false);
  const logoUrl = useObjectUrl(logo);
  const qrUrl = useObjectUrl(result);

  useEffect(() => () => { request.current?.abort(); selectionVersion.current += 1; }, []);

  function removeLogo() {
    selectionVersion.current += 1;
    setValidatingLogo(false);
    setLogo(null);
    setLogoError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function selectLogo(file) {
    if (!file || submitting.current) return;
    const version = ++selectionVersion.current;
    setValidatingLogo(true);
    setLogoError("");
    let candidateUrl;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WEBP image for your logo.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Your logo must be smaller than 5 MB.");
      candidateUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = candidateUrl;
      try { await image.decode(); } catch { throw new Error("This image could not be opened. Try a different logo."); }
      if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error("Choose a logo with fewer than 16 million pixels.");
      if (selectionVersion.current === version) setLogo(file);
    } catch (issue) {
      if (selectionVersion.current === version) setLogoError(issue.message);
    } finally {
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
      if (selectionVersion.current === version) {
        setValidatingLogo(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  }

  async function generate(event) {
    event.preventDefault();
    if (submitting.current || validatingLogo) return;
    setError("");
    if (!content.trim()) {
      setError("Enter some text or a URL to generate your QR code.");
      setInvalidContent(true);
      contentInput.current.focus();
      return;
    }
    const body = new FormData();
    body.append("data", content);
    if (logo) body.append("logo", logo);
    submitting.current = true;
    setBusy(true);
    setAnnouncement("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 30000);
    let candidateUrl;
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate-qr`, { method: "POST", body, signal: controller.signal });
      if (!response.ok) {
        const issue = await response.json().catch(() => ({}));
        throw new Error(typeof issue.detail === "string" ? issue.detail : "We couldn't generate your QR code. Please try again.");
      }
      if (!response.headers.get("content-type")?.includes("image/png")) throw new Error("The server returned an unexpected response. Please try again.");
      const blob = await response.blob();
      candidateUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = candidateUrl;
      await image.decode();
      if (controller.signal.aborted) throw new Error("The request took too long. Please try again.");
      setResult(blob);
      setDimensions(`${image.naturalWidth} × ${image.naturalHeight} px · PNG`);
      setAnnouncement("Your QR code is ready. Download PNG is available.");
    } catch (issue) {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setError(controller.signal.reason === "timeout" ? "The request took too long. Please try again." : issue instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : issue.message);
    } finally {
      clearTimeout(timeout);
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
      request.current = null;
      submitting.current = false;
      setBusy(false);
    }
  }

  function reset() {
    if (submitting.current) return;
    setContent("");
    setResult(null);
    setDimensions("");
    setError("");
    setInvalidContent(false);
    setAnnouncement("Ready to create another QR code.");
    removeLogo();
    contentInput.current.focus();
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark"><Icon name="qr" /></div>
        <p className="eyebrow">A LITTLE CODE. ENDLESS POSSIBILITIES.</p>
        <h1>QR Code Generator</h1>
        <p className="subtitle">Create and customize your QR code instantly.</p>
      </header>
      <div className="generator-grid">
        <section className="card editor-card" aria-labelledby="editor-title">
          <div className="section-heading"><span className="step">01</span><h2 id="editor-title">Make it yours</h2></div>
          <form onSubmit={generate} noValidate>
            <div className="field-heading"><label htmlFor="content">Content</label><span id="content-count">{content.length.toLocaleString("en-US")} / 4,000</span></div>
            <textarea ref={contentInput} id="content" name="data" rows={5} maxLength={4000} placeholder="Enter a URL, text, email, phone number..." aria-describedby="content-hint form-error" aria-invalid={invalidContent || undefined} value={content} disabled={busy} required onChange={event => { setContent(event.target.value); setInvalidContent(false); setError(""); }} />
            <p className="field-hint" id="content-hint">Anything you want to share, in one small square.</p>
            <div className="field-heading logo-heading"><label htmlFor="logo">Add logo <span className="optional">Optional</span></label></div>
            <input ref={fileInput} type="file" id="logo" accept="image/png,image/jpeg,image/webp" className="visually-hidden" tabIndex={-1} disabled={busy} onChange={event => selectLogo(event.target.files[0])} />
            {logo ? <div className="selected-logo">
              {logoUrl && <img id="logo-preview" src={logoUrl} alt="Selected logo preview" />}
              <div className="logo-details"><strong>{logo.name}</strong><span>{Math.max(1, Math.round(logo.size / 1024))} KB · Ready to use</span></div>
              <button type="button" className="icon-button" aria-label="Remove selected logo" disabled={busy} onClick={removeLogo}>×</button>
            </div> : <button type="button" className={`upload-area${dragging ? " is-dragging" : ""}`} disabled={busy || validatingLogo} onClick={() => fileInput.current.click()} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectLogo(event.dataTransfer.files[0]); }}>
              <span className="upload-icon"><Icon name="upload" /></span>
              <span>{validatingLogo ? "Checking your image…" : <><strong>Click to upload</strong> or drag and drop</>}</span>
              <span className="upload-formats">PNG, JPG or WEBP · Up to 5 MB</span>
            </button>}
            {logoError && <p className="error-message" role="alert">{logoError}</p>}
            <p id="form-error" className="error-message" role="alert" hidden={!error}>{error}</p>
            <GenerateButton busy={busy} disabled={busy || validatingLogo} />
          </form>
          <p className="privacy-note"><Icon name="lock" />Your content and logo are never stored.</p>
        </section>
        <section className="card preview-card" aria-labelledby="preview-title" aria-busy={busy}>
          <div className="section-heading"><span className="step">02</span><h2 id="preview-title">Your QR code</h2><span className={`preview-badge${!busy && result ? " is-ready" : ""}`}>{busy ? "Generating" : result ? "Ready" : "Preview"}</span></div>
          <div className="preview-stage">
            {busy ? <CubeLoader /> : qrUrl ? <div className="result-state"><div className="qr-paper"><img src={qrUrl} alt="Generated QR code" /></div><p>Ready for your next connection.</p><span>{dimensions}</span></div> : <Placeholder />}
          </div>
          <div className="preview-actions">
            <a className="download-button" href={!busy && qrUrl ? qrUrl : undefined} download="qrcode.png" aria-disabled={busy || !qrUrl} tabIndex={!busy && qrUrl ? 0 : -1}><Icon name="download" />Download PNG</a>
            {result && !busy && <button type="button" className="reset-button" onClick={reset}>Generate another <span aria-hidden="true">↗</span></button>}
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
        </section>
      </div>
      <footer>Small square. <span>Big possibilities.</span></footer>
    </main>
  );
}
