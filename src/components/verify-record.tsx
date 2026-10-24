"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, messageForError } from "./api-client";
import type { PublicCertificate } from "./ecodrops-types";
import { Arrow, CheckIcon, LoadingBlock, SourceLabel, StatusPill } from "./site-chrome";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

interface VerificationRequest {
  code: string;
  attempt: number;
}

export function VerifyRecord({ initialRecordId }: { initialRecordId: string }) {
  const router = useRouter();
  const normalizedInitial = initialRecordId.trim().toUpperCase();
  const [query, setQuery] = useState(normalizedInitial);
  const [request, setRequest] = useState<VerificationRequest>({ code: normalizedInitial, attempt: 0 });
  const [record, setRecord] = useState<PublicCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    apiRequest<PublicCertificate>(`/public/certificates/${encodeURIComponent(request.code)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (current) setRecord(result);
      })
      .catch((caught: unknown) => {
        if (current) setError(messageForError(caught));
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [request]);

  function verify(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setQuery(normalized);
    setLoading(true);
    setError(null);
    setRecord(null);
    // Incrementing the attempt means rechecking the current code always starts a request.
    setRequest((current) => ({ code: normalized, attempt: current.attempt + 1 }));
    router.replace(`/verify/${encodeURIComponent(normalized)}`);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verify(query);
  }

  return (
    <div className="verify-shell">
      <form className="verify-search" onSubmit={onSubmit}>
        <label htmlFor="record-code">Certified record code</label>
        <div className="verify-search__control">
          <input id="record-code" onChange={(event) => setQuery(event.target.value)} placeholder="ECD-…" spellCheck={false} value={query} />
          <button className="button button--accent" disabled={loading} type="submit">Verify <Arrow /></button>
        </div>
        <p>Try the seeded code: <button className="text-button" disabled={loading} onClick={() => verify("ECD-SYNTHETIC-0001")} type="button">ECD-SYNTHETIC-0001</button></p>
      </form>

      <div aria-live="polite">
        {loading ? <LoadingBlock label="Checking the public record…" /> : null}
        {!loading && error ? (
          <div className="verify-result verify-result--error" role="alert">
            <span className="verify-result__symbol">×</span>
            <p className="eyebrow">No public match</p>
            <h2>Record not found.</h2>
            <p>{error} Check every character or ask the record holder for the certified code.</p>
          </div>
        ) : null}
        {!loading && record ? (
          <article className="verify-result verify-result--valid">
            <div className="verify-result__header">
              <div className="verify-result__seal"><CheckIcon /></div>
              <div><p className="eyebrow">Public projection</p><h2>Certified record found.</h2></div>
              <StatusPill value={record.status} />
            </div>
            <p className="verify-result__summary">This five-field response exists in the EcoDrops public certificate projection. It confirms the record metadata below—not the underlying invoice or a third-party climate audit.</p>
            <dl className="verification-fields">
              <div><dt>Record ID</dt><dd>{record.recordId}</dd></div>
              <div><dt>Issue date · UTC</dt><dd>{formatDate(record.issueDate)}</dd></div>
              <div><dt>Status</dt><dd>{record.status}</dd></div>
              <div><dt>Methodology version</dt><dd>{record.methodologyVersion}</dd></div>
              <div className="verification-fields__hash"><dt>Audit hash</dt><dd><code>{record.auditHash}</code></dd></div>
            </dl>
            <div className="verify-result__foot">
              <SourceLabel kind="sourced">Five allowlisted fields</SourceLabel>
              {record.recordId.includes("SYNTHETIC") ? <SourceLabel kind="simulated">Synthetic demo record</SourceLabel> : null}
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
