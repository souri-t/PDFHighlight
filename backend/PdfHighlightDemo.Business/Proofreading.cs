namespace PdfHighlightDemo.Business;

public sealed record ProofreadingGlyph(int Offset, int Length, PageRectangle Rectangle);

public sealed record ProofreadingSegment(string Id, string Text, IReadOnlyList<ProofreadingGlyph> Glyphs);

public sealed record ProofreadingText(string Id, string Text);

public sealed record ProofreadingFinding(string? SegmentId, string? Original, string? Suggestion,
    string? Reason, string? Before, string? After);

public sealed record ProofreadingCandidate(Guid Id, int PageNumber, string Original, string Suggestion,
    string Reason, PageRectangle? Rectangle);

public sealed record ProofreadingPage(int PageNumber, string Status, IReadOnlyList<ProofreadingCandidate> Candidates,
    string? Message = null);

public interface IPdfProofreadingReader
{
    IProofreadingDocument Open(Stream stream);
}

public interface IProofreadingDocument : IDisposable
{
    IReadOnlyList<ProofreadingSegment> ReadPage(int pageNumber);
}

public interface IProofreadingModel
{
    bool IsConfigured { get; }
    Task<IReadOnlyList<ProofreadingFinding>> CheckAsync(IReadOnlyList<ProofreadingText> segments, CancellationToken ct);
}

public sealed class ProofreadingModelException(string message) : Exception(message);

public sealed class ProofreadingService(IProofreadingModel model)
{
    private const int MaxPageCharacters = 20_000;

    public async Task<ProofreadingPage> CheckPageAsync(int pageNumber, IReadOnlyList<ProofreadingSegment> segments,
        CancellationToken ct)
    {
        if (segments.Count == 0)
            return new(pageNumber, "skipped", [], "校正できる文字を抽出できませんでした。");

        if (segments.Sum(segment => (long)segment.Text.Length) > MaxPageCharacters)
            return new(pageNumber, "failed", [], "1ページあたりの校正上限（20,000文字）を超えています。");

        var findings = await model.CheckAsync(segments.Select(segment => new ProofreadingText(segment.Id, segment.Text)).ToArray(), ct);
        var candidates = new List<ProofreadingCandidate>();
        var seen = new HashSet<(string? Segment, PageRectangle? Rectangle, string Original, string Suggestion)>();
        foreach (var finding in findings)
        {
            var original = finding.Original?.Trim() ?? "";
            var suggestion = finding.Suggestion?.Trim() ?? "";
            var reason = finding.Reason?.Trim() ?? "";
            if (original.Length is 0 or > 200 || suggestion.Length > 200 || reason.Length > 500 || suggestion == original)
                continue;

            var rectangle = Locate(segments, original, finding);
            if (seen.Add((rectangle is null ? finding.SegmentId : null, rectangle, original, suggestion)))
                candidates.Add(new(Guid.NewGuid(), pageNumber, original, suggestion, reason, rectangle));
        }

        return new(pageNumber, "completed", candidates);
    }

    private static PageRectangle? Locate(IReadOnlyList<ProofreadingSegment> segments, string original,
        ProofreadingFinding finding)
    {
        var matches = new List<(ProofreadingSegment Segment, int Offset)>();
        foreach (var segment in segments)
        {
            var index = segment.Text.IndexOf(original, StringComparison.Ordinal);
            while (index >= 0)
            {
                matches.Add((segment, index));
                index = segment.Text.IndexOf(original, index + 1, StringComparison.Ordinal);
            }
        }

        // A unique verbatim quote is sufficient. Hints only distinguish repeated quotes.
        if (matches.Count > 1)
        {
            matches = matches.Where(match => match.Segment.Id == finding.SegmentId &&
                match.Segment.Text.AsSpan(0, match.Offset).EndsWith(finding.Before ?? "", StringComparison.Ordinal) &&
                match.Segment.Text.AsSpan(match.Offset + original.Length).StartsWith(finding.After ?? "",
                    StringComparison.Ordinal)).Take(2).ToList();
        }
        if (matches.Count != 1)
            return null;

        var (source, offset) = matches[0];
        var regions = source.Glyphs
            .Where(glyph => glyph.Offset < offset + original.Length && glyph.Offset + glyph.Length > offset)
            .Select(glyph => glyph.Rectangle)
            .ToArray();
        if (regions.Length == 0)
            return null;

        return new PageRectangle(regions.Min(rect => rect.Left), regions.Min(rect => rect.Top),
            regions.Max(rect => rect.Right), regions.Max(rect => rect.Bottom));
    }
}
