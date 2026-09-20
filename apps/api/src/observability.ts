/**
 * NO-OP (until Phase 11): Sentry and OpenTelemetry exporters stay dark unless the
 * corresponding env vars are set. Structured pino logs always run.
 */
export function initObservability(): void {
  const sentry = process.env.SENTRY_DSN;
  const otel = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!sentry) {
    console.info('[observability] Sentry disabled (SENTRY_DSN unset). Phase 11 wires this.');
  } else {
    console.warn(
      '[observability] SENTRY_DSN is set but Sentry is not wired yet. This is not a silent stub — it is intentionally unused until Phase 11.',
    );
  }

  if (!otel) {
    console.info(
      '[observability] OpenTelemetry exporter disabled (OTEL_EXPORTER_OTLP_ENDPOINT unset). Phase 11 wires this.',
    );
  } else {
    console.warn(
      '[observability] OTEL_EXPORTER_OTLP_ENDPOINT is set but the exporter is not wired yet. Intentionally unused until Phase 11.',
    );
  }
}
