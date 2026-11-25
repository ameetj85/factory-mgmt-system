import { code128Modules } from "@/lib/barcode/code128";

/** Code 128 barcode as crisp SVG bars, with a 10-module quiet zone either side and the text below. */
export function Barcode({ value, height = 56, moduleWidth = 1.6, showText = true }: { value: string; height?: number; moduleWidth?: number; showText?: boolean }) {
  const modules = code128Modules(value);
  const quiet = 10;
  const total = modules.reduce((s, m) => s + m, 0) + quiet * 2;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  modules.forEach((m, i) => {
    if (i % 2 === 0) bars.push({ x, w: m });
    x += m;
  });
  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      viewBox={`0 0 ${total} ${height + (showText ? 14 : 0)}`}
      width={total * moduleWidth}
      height={(height + (showText ? 14 : 0)) * moduleWidth * 0.62}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={height + (showText ? 14 : 0)} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
      {showText && (
        <text x={total / 2} y={height + 11} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={10} fill="#000">
          {value}
        </text>
      )}
    </svg>
  );
}
