/**
 * The ocean behind the hero: light shafts from the surface, a few fish
 * crossing at different depths, rising bubbles, and a wave edge at the bottom.
 *
 * All of it is CSS transform/opacity animation on inline SVG — no canvas, no
 * animation library, no JavaScript running per frame — and all of it stops
 * under `prefers-reduced-motion` (see globals.css). It is decoration, so it is
 * hidden from assistive tech and never takes pointer events from the buttons
 * above it.
 */

interface Swimmer {
  /** Vertical position in the scene. */
  top: string;
  /** Seconds for one crossing — slower fish read as further away. */
  duration: number;
  /** Negative values start a fish mid-crossing, so the scene opens populated. */
  delay: number;
  scale: number;
  opacity: number;
  /** Right-to-left fish are mirrored, so a school does not look like a queue. */
  reverse?: boolean;
}

const SCHOOL: Swimmer[] = [
  { top: '22%', duration: 46, delay: -6, scale: 1.25, opacity: 0.2 },
  { top: '38%', duration: 62, delay: -30, scale: 0.75, opacity: 0.14 },
  { top: '57%', duration: 38, delay: -18, scale: 1.6, opacity: 0.24 },
  { top: '71%', duration: 54, delay: -44, scale: 0.9, opacity: 0.16 },
  { top: '46%', duration: 70, delay: -12, scale: 0.6, opacity: 0.12, reverse: true },
  { top: '84%', duration: 50, delay: -36, scale: 1.1, opacity: 0.18, reverse: true },
];

const BUBBLES = [
  { left: '12%', duration: 14, delay: -3, size: 6 },
  { left: '28%', duration: 19, delay: -11, size: 4 },
  { left: '61%', duration: 16, delay: -7, size: 5 },
  { left: '78%', duration: 22, delay: -15, size: 3 },
  { left: '89%', duration: 17, delay: -1, size: 7 },
];

function Fish({ swimmer }: { swimmer: Swimmer }) {
  return (
    <span
      className={swimmer.reverse ? 'ocean-swim ocean-swim--reverse' : 'ocean-swim'}
      style={{
        top: swimmer.top,
        animationDuration: `${swimmer.duration}s`,
        animationDelay: `${swimmer.delay}s`,
      }}
    >
      <span className="ocean-bob" style={{ animationDuration: `${swimmer.duration / 6}s` }}>
        <svg
          viewBox="-12 0 52 20"
          width={52 * swimmer.scale}
          height={20 * swimmer.scale}
          fill="currentColor"
          style={{ opacity: swimmer.opacity }}
        >
          {/* body */}
          <path d="M0 10C8 1 26 1 34 10 26 19 8 19 0 10Z" />
          {/* tail */}
          <path d="M0 10-11 3v14z" />
          {/* eye, punched out of the silhouette */}
          <circle cx="26" cy="8" r="1.4" fill="#0f172a" opacity="0.5" />
        </svg>
      </span>
    </span>
  );
}

export default function OceanScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sunlight coming through the surface. */}
      <div className="ocean-rays" />

      {SCHOOL.map((swimmer) => (
        <Fish key={`${swimmer.top}-${swimmer.duration}`} swimmer={swimmer} />
      ))}

      {BUBBLES.map((bubble) => (
        <span
          key={bubble.left}
          className="ocean-bubble"
          style={{
            left: bubble.left,
            width: bubble.size,
            height: bubble.size,
            animationDuration: `${bubble.duration}s`,
            animationDelay: `${bubble.delay}s`,
          }}
        />
      ))}

      {/* Two wave bands drifting at different speeds along the bottom edge. */}
      <svg
        className="ocean-waves"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          className="ocean-wave ocean-wave--back"
          d="M0 64c120-26 240-26 360 0s240 26 360 0 240-26 360 0 240 26 360 0v56H0z"
        />
        <path
          className="ocean-wave ocean-wave--front"
          d="M0 82c160-30 320-30 480 0s320 30 480 0 320-30 480 0v38H0z"
        />
      </svg>
    </div>
  );
}
