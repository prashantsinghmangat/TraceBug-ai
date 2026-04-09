// ── UI Module Barrel ──────────────────────────────────────────────────────
// Re-exports all dashboard UI utilities for clean imports.

export {
  eventConfig,
  getStatusColor,
  getStatusLabel,
  getSpeedLabel,
  getErrorType,
  formatDuration,
  describeEvent,
  timeAgo,
  escapeHtml,
  smallBtnStyle,
  tabBtnStyle,
  downloadFile,
} from "./helpers";

export { showToast } from "./toast";
