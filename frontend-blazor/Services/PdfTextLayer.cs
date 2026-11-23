using System.Text;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;

namespace BlazorFrontend.Services;

internal record TextRun(string Text, double Left, double Top, double FontSizeInPageWidths, double WidthInEm, int Rotation);

internal static class PdfTextLayer
{
    private record LetterPosition(Letter Letter, double Start, double End, double Baseline, double EndBaseline);

    public static IReadOnlyList<TextRun> Create(Page page)
    {
        var rotation = page.Rotation.Value;
        var letters = page.Letters.Where(letter => letter.Value.Length > 0).Select(letter =>
        {
            var (start, baseline) = ReadingPoint(letter.StartBaseLine, rotation);
            var (end, endBaseline) = ReadingPoint(letter.EndBaseLine, rotation);
            return new LetterPosition(letter, start, end, baseline, endBaseline);
        }).Where(letter => letter.End >= letter.Start - 0.1 && Math.Abs(letter.Baseline - letter.EndBaseline) < 0.1)
            .OrderByDescending(letter => letter.Baseline).ThenBy(letter => letter.Start);

        var runs = new List<TextRun>();
        var line = new List<LetterPosition>();
        foreach (var letter in letters)
        {
            if (line.Count > 0 && Math.Abs(line[0].Baseline - letter.Baseline) > 1.5)
            {
                AddRuns(page, line, runs);
                line.Clear();
            }
            line.Add(letter);
        }
        AddRuns(page, line, runs);
        return runs;
    }

    private static void AddRuns(Page page, List<LetterPosition> line, List<TextRun> runs)
    {
        var text = new StringBuilder();
        LetterPosition? first = null;
        LetterPosition? previous = null;
        foreach (var current in line.OrderBy(letter => letter.Start))
        {
            if (previous is not null)
            {
                var gap = current.Start - previous.End;
                var em = Math.Max(1, Math.Max(previous.Letter.PointSize, current.Letter.PointSize));
                if (gap > em * 1.5 || Math.Abs(previous.Letter.PointSize - current.Letter.PointSize) > 1)
                    Flush();
                else if (gap > em * 0.19 && !char.IsWhiteSpace(current.Letter.Value[0]) &&
                    text.Length > 0 && !char.IsWhiteSpace(text[^1]))
                    text.Append(' ');
            }

            first ??= current;
            text.Append(current.Letter.Value);
            previous = current;
        }
        Flush();

        void Flush()
        {
            if (first is not null && previous is not null && previous.End > first.Start && first.Letter.PointSize > 0)
            {
                var em = first.Letter.PointSize;
                var value = text.ToString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    var baseline = first.Baseline + em * 0.93;
                    var rotation = page.Rotation.Value;
                    var (x, y) = rotation switch
                    {
                        90 => (baseline, -first.Start),
                        180 => (-first.Start, -baseline),
                        270 => (-baseline, first.Start),
                        _ => (first.Start, baseline)
                    };
                    runs.Add(new TextRun(value, x / page.Width, 1 - y / page.Height,
                        em / page.Width, (previous.End - first.Start) / em, rotation));
                }
            }
            first = null;
            previous = null;
            text.Clear();
        }
    }

    private static (double Along, double Baseline) ReadingPoint(PdfPoint point, int rotation) => rotation switch
    {
        90 => (-point.Y, point.X),
        180 => (-point.X, -point.Y),
        270 => (point.Y, -point.X),
        _ => (point.X, point.Y)
    };
}
