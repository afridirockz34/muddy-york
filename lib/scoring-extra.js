export function applySourcePenalty(confidence, source) {
  if (source === "auto") return Math.min(70, Math.round(confidence * 0.7));
  return confidence;
}
export function sourceBadge(source) {
  return source === "auto" ? "Auto-discovered" : "Verified water";
}
