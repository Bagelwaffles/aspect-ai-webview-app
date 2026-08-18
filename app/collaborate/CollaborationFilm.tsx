const FILM_URL =
  "https://github.com/Bagelwaffles/Aspect-Marketing-Solutions-/releases/download/ams-collaboration-film-v1/ams-collaboration-system-film.mp4"

export default function CollaborationFilm() {
  return (
    <section
      aria-labelledby="collaboration-film-title"
      style={{
        width: "min(1180px, calc(100% - 36px))",
        margin: "0 auto",
        padding: "28px 0 76px",
        position: "relative",
        zIndex: 2,
      }}
    >
      <div style={{ maxWidth: 860, marginBottom: 28 }}>
        <p
          style={{
            margin: 0,
            color: "#66dbff",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontSize: "0.72rem",
            fontWeight: 850,
          }}
        >
          00 // watch the system
        </p>
        <h2
          id="collaboration-film-title"
          style={{
            margin: "12px 0 16px",
            fontSize: "clamp(2.5rem, 5vw, 5.1rem)",
            lineHeight: 0.96,
            letterSpacing: "-0.045em",
            fontWeight: 900,
          }}
        >
          See what AMS brings to a collaboration.
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: 780,
            color: "#aeb8d1",
            lineHeight: 1.72,
            fontSize: "1.04rem",
          }}
        >
          AMS is not asking collaborators to fit inside a generic agency model. We combine
          complementary expertise with a coordinated AI, automation, and product system—then
          prove the fit with one measurable pilot.
        </p>
      </div>

      <div
        style={{
          overflow: "hidden",
          borderRadius: 24,
          border: "1px solid rgba(110, 219, 255, 0.38)",
          background: "#02050b",
          boxShadow: "0 28px 90px rgba(0, 0, 0, 0.42), 0 0 70px rgba(102, 219, 255, 0.08)",
        }}
      >
        <video
          controls
          playsInline
          preload="metadata"
          poster="/collaboration/ams-collaboration-poster.webp"
          aria-label="Aspect Marketing Solutions collaboration system film"
          style={{ display: "block", width: "100%", aspectRatio: "16 / 9", background: "#02050b" }}
        >
          <source src={FILM_URL} type="video/mp4" />
          <track
            kind="captions"
            src="/collaboration/ams-collaboration-system-film.vtt"
            srcLang="en"
            label="English"
            default
          />
          Your browser does not support HTML5 video.
        </video>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a
          href="#brief"
          style={{
            color: "#07101a",
            background: "linear-gradient(90deg, #a8ff78, #66dbff)",
            padding: "12px 18px",
            borderRadius: 999,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Build a collaboration brief
        </a>
        <a
          href="/api/collaboration-profile"
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#f3f6ff",
            background: "rgba(12, 20, 38, 0.82)",
            border: "1px solid rgba(110, 219, 255, 0.38)",
            padding: "12px 18px",
            borderRadius: 999,
            fontWeight: 750,
            textDecoration: "none",
          }}
        >
          Open AI-readable profile
        </a>
      </div>
    </section>
  )
}
