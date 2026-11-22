using System.Text;
using PdfHighlightDemo.Business;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class PdfProofreadingReader : IPdfProofreadingReader
{
    public IProofreadingDocument Open(Stream stream) => new TextDocument(PdfDocument.Open(stream));

    private sealed class TextDocument(PdfDocument pdf) : IProofreadingDocument
    {
        public IReadOnlyList<ProofreadingSegment> ReadPage(int pageNumber)
        {
            var page = pdf.GetPage(pageNumber);
            var rotation = page.Rotation.Value;
            var letters = page.Letters.Where(letter => letter.Value.Length > 0).Select(letter =>
            {
                var (start, baseline) = ReadingPoint(letter.StartBaseLine, rotation);
                var (end, endBaseline) = ReadingPoint(letter.EndBaseLine, rotation);
                return new PositionedLetter(letter, start, end, baseline, endBaseline);
            }).Where(letter => letter.End >= letter.Start - 0.1 && Math.Abs(letter.EndBaseline - letter.Baseline) < 0.1)
                .OrderByDescending(letter => letter.Baseline).ThenBy(letter => letter.Start);

            var segments = new List<ProofreadingSegment>();
            var line = new List<PositionedLetter>();
            foreach (var letter in letters)
            {
                if (line.Count > 0 && Math.Abs(line[0].Baseline - letter.Baseline) > 1.5)
                {
                    AddLine(page, line, segments);
                    line.Clear();
                }
                line.Add(letter);
            }
            AddLine(page, line, segments);
            return segments;
        }

        public void Dispose() => pdf.Dispose();
    }

    private sealed record PositionedLetter(Letter Glyph, double Start, double End, double Baseline, double EndBaseline);

    // PdfPig applies CropBox and page rotation to glyphs. Use unrotated axes only to group lines.
    private static (double Along, double Baseline) ReadingPoint(PdfPoint point, int rotation) => rotation switch
    {
        90 => (-point.Y, point.X),
        180 => (-point.X, -point.Y),
        270 => (point.Y, -point.X),
        _ => (point.X, point.Y)
    };

    private static void AddLine(Page page, List<PositionedLetter> line, List<ProofreadingSegment> segments)
    {
        var text = new StringBuilder();
        var glyphs = new List<ProofreadingGlyph>();
        PositionedLetter? previous = null;
        foreach (var letter in line.OrderBy(letter => letter.Start))
        {
            var value = letter.Glyph.Value;
            if (previous is not null)
            {
                var gap = letter.Start - previous.End;
                var em = Math.Max(1, Math.Max(previous.Glyph.PointSize, letter.Glyph.PointSize));
                if (gap > em * 2)
                    Flush();
                else if (gap > em * 0.19 && !char.IsWhiteSpace(value[0]) && text.Length > 0 &&
                    !char.IsWhiteSpace(text[^1]))
                    text.Append(' ');
            }

            var rectangle = Normalize(letter.Glyph.BoundingBox, page.Width, page.Height);
            if (rectangle.IsValid())
                glyphs.Add(new ProofreadingGlyph(text.Length, value.Length, rectangle));
            text.Append(value);
            previous = letter;
        }
        Flush();

        void Flush()
        {
            var lineText = text.ToString();
            if (glyphs.Count > 0 && !string.IsNullOrWhiteSpace(lineText))
                segments.Add(new ProofreadingSegment($"s{segments.Count + 1}", lineText, glyphs.ToArray()));
            text.Clear();
            glyphs.Clear();
        }
    }

    private static PageRectangle Normalize(PdfRectangle bounds, double width, double height)
    {
        var corners = new[] { bounds.BottomLeft, bounds.BottomRight, bounds.TopLeft, bounds.TopRight };
        return new PageRectangle(
            Math.Clamp(corners.Min(point => point.X) / width, 0, 1),
            Math.Clamp(1 - corners.Max(point => point.Y) / height, 0, 1),
            Math.Clamp(corners.Max(point => point.X) / width, 0, 1),
            Math.Clamp(1 - corners.Min(point => point.Y) / height, 0, 1));
    }
}
