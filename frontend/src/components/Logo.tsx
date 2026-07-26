/**
 * LedgerMind logo mark. Single source of the icon asset path/sizing, used in
 * the sidebar, auth screens, and the landing page nav/footer.
 *
 * File to add: public/logo-mark.png (or .svg — update the src below to match).
 * Recommended: a transparent-background export of the icon glyph, roughly
 * square, at least 128x128px so it stays crisp at 2x display density.
 */
export default function Logo({
  size = 34,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src="/logo-mark.jpeg"
      alt="LedgerMind"
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block", flexShrink: 0, ...style }}
    />
  );
}
