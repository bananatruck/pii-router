export function CoverageNote() {
  return (
    <footer className="mt-6 grid grid-cols-1 gap-4 border-t border-ink pt-4 text-xs leading-relaxed text-ink/85 md:grid-cols-2">
      <div>
        <h2 className="font-bold text-ink">What it catches</h2>
        <p className="mt-1">
          Caught by the deterministic patterns, after invisible characters are removed and look-alikes folded: email addresses, phone numbers in common North American and international formats, payment card numbers that pass the Luhn check, IBANs that pass the mod-97 check, US Social Security numbers in AAA-GG-SSSS form with invalid ranges excluded, IPv4 addresses. Caught by Gemini Nano, best effort: personal names, street addresses, and other identifiers the model recognises.
        </p>
      </div>
      <div>
        <h2 className="font-bold text-ink">What it can miss</h2>
        <p className="mt-1">
          Not guaranteed: names and addresses the on-device model misses (including when text in the input talks it into reporting nothing), identifiers in formats the patterns do not cover, personal data implied by context (for example &quot;my neighbour, the only dentist in town&quot;), and anything inside images or attachments, which are not accepted.
        </p>
      </div>
    </footer>
  );
}