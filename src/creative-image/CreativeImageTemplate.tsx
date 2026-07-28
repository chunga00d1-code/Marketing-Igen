import type { CSSProperties } from "react";
import { getCreativeImageTemplate } from "./template-registry";
import type { CreativeImageCanvas, CreativeImageProjectData } from "./types";

type Props = { templateId: string; canvas: CreativeImageCanvas; data: CreativeImageProjectData };

function safeColor(value: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function ImageOrShape({ imageUrl, color }: { imageUrl?: string; color: string }) {
  return imageUrl ? (
    <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  ) : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${color}, #111827)` }} />;
}

export function CreativeImageTemplate({ templateId, canvas, data }: Props) {
  const template = getCreativeImageTemplate(templateId);
  const values = { ...(template?.defaults || {}), ...data };
  const color = safeColor(values.primaryColor, "#2563eb");
  const root: CSSProperties = { width: canvas.width, height: canvas.height, position: "relative", overflow: "hidden", background: "#0f172a", color: "#fff", fontFamily: "Arial, Helvetica, sans-serif" };
  const brand: CSSProperties = { position: "absolute", top: "6%", left: "7%", zIndex: 3, fontSize: Math.round(canvas.width * 0.032), fontWeight: 800, letterSpacing: "0.16em" };
  const cta: CSSProperties = { position: "absolute", left: "7%", bottom: "7%", zIndex: 3, padding: `${Math.round(canvas.width * 0.018)}px ${Math.round(canvas.width * 0.032)}px`, background: "#fff", color, fontSize: Math.round(canvas.width * 0.026), fontWeight: 800, borderRadius: 999, letterSpacing: "0.06em" };

  if (["quote-card-v1", "customer-review-v1", "quick-tip-v1"].includes(templateId)) return <div style={{ ...root, background: `linear-gradient(145deg, ${color}, #111827 75%)` }}>
    <div style={{ position: "absolute", right: "-8%", top: "-8%", width: "48%", aspectRatio: "1", borderRadius: "50%", background: "rgba(255,255,255,.12)" }} />
    <div style={{ ...brand, color: "rgba(255,255,255,.82)" }}>{values.brandName}</div>
    <div style={{ position: "absolute", left: "7%", top: "22%", fontSize: Math.round(canvas.width * 0.18), fontWeight: 900, opacity: 0.5, lineHeight: 0.7 }}>{templateId === "quick-tip-v1" ? "01" : "\u201c"}</div>
    {values.imageUrl && <img src={values.imageUrl} alt="" style={{ position: "absolute", right: "9%", bottom: "11%", width: "15%", aspectRatio: "1", objectFit: "cover", borderRadius: "50%", border: `${Math.max(3, Math.round(canvas.width * 0.004))}px solid rgba(255,255,255,.8)` }} />}
    <div style={{ position: "absolute", left: "10%", right: "10%", top: "34%", fontSize: Math.round(canvas.width * 0.061), fontWeight: 800, lineHeight: 1.23, letterSpacing: "-0.035em" }}>{values.headline}</div>
    <div style={{ position: "absolute", left: "10%", right: values.imageUrl ? "28%" : "10%", bottom: "15%", fontSize: Math.round(canvas.width * 0.03), fontWeight: 600, color: "rgba(255,255,255,.78)" }}>{values.subheadline}</div>
  </div>;

  if (["product-showcase-v1", "new-arrival-v1"].includes(templateId)) return <div style={root}>
    <div style={{ position: "absolute", inset: 0, opacity: 0.86 }}><ImageOrShape imageUrl={values.imageUrl} color={color} /></div>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,6,23,.92) 0%, rgba(2,6,23,.58) 49%, rgba(2,6,23,.05) 100%)" }} />
    <div style={brand}>{values.brandName}</div>
    <div style={{ position: "absolute", left: "7%", top: "28%", width: "61%", zIndex: 3, fontSize: Math.round(canvas.width * 0.076), fontWeight: 900, lineHeight: 0.98, letterSpacing: "-0.04em" }}>{values.headline}</div>
    <div style={{ position: "absolute", left: "7%", top: "48%", width: "53%", zIndex: 3, fontSize: Math.round(canvas.width * 0.032), lineHeight: 1.45, color: "rgba(255,255,255,.84)" }}>{values.subheadline}</div>
    <div style={cta}>{values.cta}</div>
  </div>;

  if (["event-announcement-v1", "countdown-event-v1"].includes(templateId)) return <div style={root}>
    <div style={{ position: "absolute", inset: 0, opacity: 0.42 }}><ImageOrShape imageUrl={values.imageUrl} color={color} /></div>
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${color}e8, rgba(15,23,42,.9))` }} />
    <div style={brand}>{values.brandName}</div>
    <div style={{ position: "absolute", top: "26%", left: "7%", width: "86%", zIndex: 3, fontSize: Math.round(canvas.width * 0.085), fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.04em", textTransform: "uppercase" }}>{values.headline}</div>
    <div style={{ position: "absolute", top: "51%", left: "7%", width: "75%", zIndex: 3, paddingLeft: Math.round(canvas.width * 0.02), borderLeft: `${Math.round(canvas.width * 0.012)}px solid #fff`, fontSize: Math.round(canvas.width * 0.035), fontWeight: 600, lineHeight: 1.4 }}>{values.subheadline}</div>
    <div style={cta}>{values.cta}</div>
  </div>;

  if (templateId === "flash-sale-v1") return <div style={{ ...root, background: `radial-gradient(circle at 80% 20%, ${color}, #3f0a1d 55%, #111827)` }}>
    <div style={{ position: "absolute", left: "-9%", bottom: "-15%", width: "65%", aspectRatio: "1", borderRadius: "50%", background: "rgba(255,255,255,.1)" }} />
    <div style={brand}>{values.brandName}</div>
    <div style={{ position: "absolute", left: "7%", top: "23%", zIndex: 3, fontSize: Math.round(canvas.width * 0.094), fontWeight: 950, lineHeight: 0.9, letterSpacing: "-0.06em" }}>{values.headline}</div>
    <div style={{ position: "absolute", left: "7%", top: "43%", zIndex: 3, fontSize: Math.round(canvas.width * 0.033), fontWeight: 700, color: "rgba(255,255,255,.82)" }}>{values.subheadline}</div>
    <div style={{ position: "absolute", left: "7%", top: "56%", zIndex: 3, fontSize: Math.round(canvas.width * 0.085), fontWeight: 950, color: "#fef08a", letterSpacing: "-0.05em" }}>{values.price}</div>
    <div style={{ position: "absolute", right: "6%", bottom: "7%", width: "39%", height: "39%", borderRadius: Math.round(canvas.width * 0.035), overflow: "hidden", transform: "rotate(5deg)", boxShadow: "0 20px 38px rgba(0,0,0,.3)" }}><ImageOrShape imageUrl={values.imageUrl} color={color} /></div>
    <div style={cta}>{values.cta}</div>
  </div>;

  if (templateId === "recruitment-v1") return <div style={root}>
    <div style={{ position: "absolute", inset: 0, opacity: 0.46 }}><ImageOrShape imageUrl={values.imageUrl} color={color} /></div>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(15,23,42,.96), rgba(15,23,42,.3))" }} />
    <div style={brand}>{values.brandName}</div>
    <div style={{ position: "absolute", left: "7%", top: "29%", width: "80%", zIndex: 3, fontSize: Math.round(canvas.width * 0.082), lineHeight: 0.98, fontWeight: 900, letterSpacing: "-0.04em" }}>{values.headline}</div>
    <div style={{ position: "absolute", left: "7%", top: "51%", width: "68%", zIndex: 3, fontSize: Math.round(canvas.width * 0.033), lineHeight: 1.4, color: "rgba(255,255,255,.83)" }}>{values.subheadline}</div>
    <div style={cta}>{values.cta}</div>
  </div>;

  return <div style={root}>
    <div style={{ position: "absolute", right: "-10%", top: "-10%", width: "65%", height: "70%", borderRadius: "50%", background: color, opacity: 0.92 }} />
    <div style={{ position: "absolute", right: "4%", top: "13%", width: "50%", height: "52%", borderRadius: Math.round(canvas.width * 0.035), overflow: "hidden", boxShadow: "0 26px 60px rgba(15,23,42,.35)" }}><ImageOrShape imageUrl={values.imageUrl} color={color} /></div>
    <div style={brand}>{values.brandName}</div>
    <div style={{ position: "absolute", left: "7%", top: "27%", width: "57%", zIndex: 3, fontSize: Math.round(canvas.width * 0.072), fontWeight: 900, lineHeight: 0.96, letterSpacing: "-0.045em" }}>{values.headline}</div>
    <div style={{ position: "absolute", left: "7%", top: "51%", width: "49%", zIndex: 3, fontSize: Math.round(canvas.width * 0.032), lineHeight: 1.38, color: "#cbd5e1" }}>{values.subheadline}</div>
    <div style={{ position: "absolute", left: "7%", bottom: "16%", zIndex: 3, fontSize: Math.round(canvas.width * 0.056), color: "#fff", fontWeight: 900 }}>{values.price}</div>
    <div style={cta}>{values.cta}</div>
  </div>;
}
