import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfText } from "@/lib/pdf";
import { AshokaChakra } from "@/components/AshokaChakra";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast, Toaster } from "sonner";
import {
  Upload, FileText, Download, Loader2, Scale, Gavel, Building2, Users,
  AlertCircle, Clock, FileDown,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

type ActionItem = {
  action: string;
  party: string;
  deadline: string;
  action_type: string;
  source_sentence: string;
  confidence: number;
  priority: "High" | "Medium" | "Low" | string;
};
type Summary = {
  case_title: string; court: string; case_number: string;
  judgment_date: string; case_type: string; brief_summary: string;
  total_parties: string | number;
};

function partyClasses(party: string) {
  switch (party) {
    case "Petitioner":
      return "border-l-navy bg-navy/5";
    case "Respondent":
      return "border-l-destructive bg-destructive/5";
    case "Registry":
      return "border-l-saffron bg-saffron/5";
    case "Lower Court":
      return "border-l-india-green bg-india-green/5";
    default:
      return "border-l-muted-foreground bg-muted/40";
  }
}
function partyBadge(party: string) {
  const map: Record<string, string> = {
    Petitioner: "bg-navy text-navy-foreground",
    Respondent: "bg-destructive text-destructive-foreground",
    Registry: "bg-saffron text-saffron-foreground",
    "Lower Court": "bg-india-green text-india-green-foreground",
    "Both Parties": "bg-accent text-accent-foreground",
    Other: "bg-muted text-muted-foreground",
  };
  return map[party] || "bg-muted text-muted-foreground";
}
function priorityIcon(p: string) {
  return p === "High" ? "🔴" : p === "Medium" ? "🟡" : "🟢";
}

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [judgmentText, setJudgmentText] = useState("");
  const [filter, setFilter] = useState({ party: "All", type: "All", priority: "All" });
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return actions.filter(a =>
      (filter.party === "All" || a.party === filter.party) &&
      (filter.type === "All" || a.action_type === filter.type) &&
      (filter.priority === "All" || a.priority === filter.priority)
    );
  }, [actions, filter]);

  const stats = useMemo(() => ({
    total: actions.length,
    high: actions.filter(a => a.priority === "High").length,
    parties: new Set(actions.map(a => a.party)).size,
    noDeadline: actions.filter(a => (a.deadline || "").toLowerCase().includes("not specified")).length,
  }), [actions]);

  const allParties = useMemo(() => ["All", ...Array.from(new Set(actions.map(a => a.party)))], [actions]);
  const allTypes = useMemo(() => ["All", ...Array.from(new Set(actions.map(a => a.action_type)))], [actions]);

  async function analyze() {
    if (!file) return;
    setLoading(true);
    try {
      setStage("Extracting text from PDF…");
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast.error("Could not extract text. Try a text-based PDF (not scanned).");
        return;
      }
      setJudgmentText(text);
      setStage("Analysing judgment with AI…");
      const { data, error } = await supabase.functions.invoke("analyze-judgment", {
        body: { judgmentText: text },
      });
      if (error) throw error;
      if (!data?.actionItems?.length) {
        toast.warning("No clear action items extracted from this judgment.");
      }
      setSummary(data.summary);
      setActions(data.actionItems || []);
      toast.success(`Extracted ${data.actionItems?.length || 0} action items`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Analysis failed");
    } finally {
      setLoading(false);
      setStage("");
    }
  }

  function downloadCSV() {
    const rows = [
      ["S.No", "Party", "Action", "Deadline", "Action Type", "Priority", "Confidence", "Source"],
      ...actions.map((a, i) => [
        i + 1, a.party, a.action, a.deadline, a.action_type, a.priority, a.confidence, a.source_sentence,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    download(csv, "judgeaid.csv", "text/csv");
  }
  function downloadJSON() {
    download(JSON.stringify(actions, null, 2), "judgeaid.json", "application/json");
  }
  function downloadReport() {
    if (!summary) return;
    const lines: string[] = [
      "NYAYASETU — COURT ACTION PLAN REPORT",
      `Generated : ${new Date().toLocaleString("en-IN")}`,
      `File      : ${file?.name || ""}`,
      "=".repeat(60),
      `Case      : ${summary.case_title}`,
      `Court     : ${summary.court}`,
      `Case No.  : ${summary.case_number}`,
      `Date      : ${summary.judgment_date}`,
      "",
      `SUMMARY: ${summary.brief_summary}`,
      "",
      `TOTAL ACTION ITEMS: ${actions.length}`,
      "=".repeat(60),
      "",
    ];
    actions.forEach((a, i) => {
      lines.push(
        `${i + 1}. [${a.party}] — ${a.priority} Priority`,
        `   Action  : ${a.action}`,
        `   Deadline: ${a.deadline}`,
        `   Type    : ${a.action_type}`,
        `   Source  : ${a.source_sentence}`,
        ""
      );
    });
    download(lines.join("\n"), "judgeaid_report.txt", "text/plain");
  }
  function download(content: string, name: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <Toaster richColors position="top-center" />

      {/* Tricolor top strip */}
      <div className="tricolor-bar" />

      {/* Government band */}
      <div className="gov-header-band text-white">
        <div className="mx-auto max-w-15xl px-4 py-2 text-xs flex items-center justify-between flex-wrap gap-2">
          <span className="opacity-0">भारत सरकार &nbsp;|&nbsp; Government of India</span>
          <span className="opacity-0">सत्यमेव जयते · Satyameva Jayate</span>
        </div>
      </div>

      {/* Emblem header */}
      <header className="bg-card border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-6 flex items-center gap-4">
          <div className="text-navy">
            <AshokaChakra size={64} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-navy tracking-tight">
              NyayaSetu <span className="text-saffron">·</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Court Order Action Planner · Ministry of Law &amp; Justice initiative
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Scale className="h-4 w-4" /> Assistive Tool · Not a substitute for judicial reasoning
          </div>
        </div>
        <div className="tricolor-bar" />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Notice */}
        <div className="border-l-4 border-l-saffron bg-saffron/5 p-4 rounded-md flex gap-3">
          <AlertCircle className="h-5 w-5 text-saffron flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong className="text-navy">Public Notice:</strong> Upload a text-based court judgment PDF
            (eCourts / High Courts / Supreme Court). The system extracts every directive,
            party, deadline and priority from the order.
          </div>
        </div>

        {/* Upload */}
        <Card className="p-6 border-2 border-dashed border-navy/20">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-navy" />
            <h2 className="text-lg font-semibold text-navy">Upload Court Judgment</h2>
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-saffron hover:bg-saffron/5 transition-colors p-10 text-center"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">
              {file ? file.name : "Click to choose a PDF file"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports text-based PDFs · Max 50 pages recommended
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {file && (
            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB · ready to analyse
              </div>
              <Button
                onClick={analyze}
                disabled={loading}
                className="bg-navy hover:bg-navy/90 text-navy-foreground"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {stage || "Working…"}</>
                ) : (
                  <><Gavel className="h-4 w-4 mr-2" /> Analyse Judgment</>
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* Results */}
        {summary && actions.length > 0 && (
          <>
            {/* Stats */}
            <section>
              <h2 className="text-lg font-semibold text-navy mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Case Summary
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Action Items" value={stats.total} accent="navy" icon={<FileText className="h-4 w-4" />} />
                <StatCard label="High Priority" value={stats.high} accent="destructive" icon={<AlertCircle className="h-4 w-4" />} />
                <StatCard label="Parties Involved" value={stats.parties} accent="india-green" icon={<Users className="h-4 w-4" />} />
                <StatCard label="No Deadline Set" value={stats.noDeadline} accent="saffron" icon={<Clock className="h-4 w-4" />} />
              </div>

              <Card className="p-5">
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Case:</span> <strong>{summary.case_title}</strong></div>
                  <div><span className="text-muted-foreground">Date:</span> <strong>{summary.judgment_date}</strong></div>
                  <div><span className="text-muted-foreground">Court:</span> <strong>{summary.court}</strong></div>
                  <div><span className="text-muted-foreground">Type:</span> <strong>{summary.case_type}</strong></div>
                  <div><span className="text-muted-foreground">Case No.:</span> <strong>{summary.case_number}</strong></div>
                </div>
                <div className="mt-4 p-3 rounded-md bg-navy/5 border-l-4 border-l-navy text-sm">
                  <strong className="text-navy">Brief: </strong>{summary.brief_summary}
                </div>
              </Card>
            </section>

            {/* Filters + actions */}
            <section>
              <h2 className="text-lg font-semibold text-navy mb-3 flex items-center gap-2">
                <Gavel className="h-5 w-5" /> Action Plan
              </h2>

              <Card className="p-4 mb-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <FilterSelect label="Party" value={filter.party} options={allParties}
                    onChange={(v) => setFilter(f => ({ ...f, party: v }))} />
                  <FilterSelect label="Action Type" value={filter.type} options={allTypes}
                    onChange={(v) => setFilter(f => ({ ...f, type: v }))} />
                  <FilterSelect label="Priority" value={filter.priority} options={["All", "High", "Medium", "Low"]}
                    onChange={(v) => setFilter(f => ({ ...f, priority: v }))} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Showing {filtered.length} of {actions.length} action items
                </p>
              </Card>

              <div className="grid lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 space-y-3">
                  {filtered.map((a, i) => (
                    <Card key={i} className={`border-l-4 p-4 ${partyClasses(a.party)}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${partyBadge(a.party)}`}>
                          {a.party}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          #{i + 1} · {priorityIcon(a.priority)} {a.priority}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{a.action}</p>
                      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span><Clock className="inline h-3 w-3 mr-1" /><strong className="text-foreground">Deadline:</strong> {a.deadline}</span>
                        <span><strong className="text-foreground">Type:</strong> {a.action_type}</span>
                      </div>
                      <div className="mt-3">
                        <div className="h-1 rounded bg-muted overflow-hidden">
                          <div className="h-1 bg-saffron" style={{ width: `${Math.round((a.confidence || 0.8) * 100)}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          AI confidence: {Math.round((a.confidence || 0.8) * 100)}%
                        </div>
                      </div>
                      {a.source_sentence && (
                        <p className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground italic">
                          📖 “{a.source_sentence}”
                        </p>
                      )}
                    </Card>
                  ))}
                </div>

                <div className="lg:col-span-2">
                  <Card className="p-4 sticky top-4">
                    <h3 className="text-sm font-semibold text-navy mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Original Judgment
                    </h3>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 p-3 rounded max-h-[600px] overflow-auto">
                      {judgmentText.slice(0, 6000)}
                      {judgmentText.length > 6000 && "\n\n…(truncated for preview)"}
                    </div>
                  </Card>
                </div>
              </div>
            </section>

            {/* Table */}
            <section>
              <h2 className="text-lg font-semibold text-navy mb-3">Full Action Table</h2>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-navy">
                    <TableRow>
                      <TableHead className="text-navy-foreground">No.</TableHead>
                      <TableHead className="text-navy-foreground">Party</TableHead>
                      <TableHead className="text-navy-foreground">Action</TableHead>
                      <TableHead className="text-navy-foreground">Deadline</TableHead>
                      <TableHead className="text-navy-foreground">Type</TableHead>
                      <TableHead className="text-navy-foreground">Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actions.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${partyBadge(a.party)}`}>{a.party}</span></TableCell>
                        <TableCell className="max-w-md">{a.action}</TableCell>
                        <TableCell>{a.deadline}</TableCell>
                        <TableCell>{a.action_type}</TableCell>
                        <TableCell>{priorityIcon(a.priority)} {a.priority}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>

            {/* Downloads */}
            <section>
              <h2 className="text-lg font-semibold text-navy mb-3">Download Action Plan</h2>
              <div className="grid md:grid-cols-3 gap-3">
                <Button variant="outline" onClick={downloadCSV} className="border-navy text-navy hover:bg-navy hover:text-navy-foreground">
                  <Download className="h-4 w-4 mr-2" /> Download CSV
                </Button>
                <Button variant="outline" onClick={downloadJSON} className="border-india-green text-india-green hover:bg-india-green hover:text-india-green-foreground">
                  <Download className="h-4 w-4 mr-2" /> Download JSON
                </Button>
                <Button variant="outline" onClick={downloadReport} className="border-saffron text-saffron hover:bg-saffron hover:text-saffron-foreground">
                  <FileDown className="h-4 w-4 mr-2" /> Download Full Report
                </Button>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16">
        <div className="tricolor-bar" />
        <div className="bg-navy text-navy-foreground">
          <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs space-y-1">
            <div className="flex items-center justify-center gap-2">
              <AshokaChakra size={20} />
              <strong>NyayaSetu</strong>
            </div>
            <p className="opacity-80">
              An assistive AI tool for court orders.
            </p>
            <p className="opacity-60">
              © {new Date().getFullYear()} ·Nyayasetu
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  label, value, accent, icon,
}: { label: string; value: number | string; accent: "navy" | "saffron" | "india-green" | "destructive"; icon: React.ReactNode }) {
  const accentMap: Record<string, string> = {
    navy: "border-l-navy text-navy",
    saffron: "border-l-saffron text-saffron",
    "india-green": "border-l-india-green text-india-green",
    destructive: "border-l-destructive text-destructive",
  };
  return (
    <Card className={`p-4 border-l-4 ${accentMap[accent]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {icon}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function FilterSelect({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
