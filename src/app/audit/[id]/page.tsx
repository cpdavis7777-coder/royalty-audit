import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function AuditPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-8">
        <Link href="/upload" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← New audit
        </Link>
      </div>

      <div className="mb-10">
        <Badge className="mb-3 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          Coming next session
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Audit Report</h1>
        <p className="text-muted-foreground text-sm font-mono">ID: {params.id}</p>
      </div>

      {/* Variance summary — placeholder */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Expected royalty", value: "—", note: "Based on RRC + EIA data" },
          { label: "Actual received", value: "—", note: "From your check stub" },
          { label: "Variance", value: "—", note: "Over / under payment" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardHeader className="pb-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Extracted fields — placeholder */}
      <Card className="mb-6 bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Extracted fields from check stub</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Texas RRC and EIA integrations will populate this section in the next session.
            The extraction step is already live — upload a check stub on the{" "}
            <Link href="/upload" className="text-primary underline-offset-2 hover:underline">
              upload page
            </Link>{" "}
            to see extracted fields now.
          </p>
        </CardContent>
      </Card>

      {/* Narrative — placeholder */}
      <Card className="mb-6 bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Audit narrative</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            &ldquo;Plain-English explanation of variance, likely causes, and recommended next steps will
            appear here once RRC + EIA integrations are complete.&rdquo;
          </p>
        </CardContent>
      </Card>

      {/* PDF export — placeholder */}
      <div className="flex justify-end">
        <button
          disabled
          className="bg-primary/50 text-primary-foreground font-medium px-6 py-2 rounded-md text-sm cursor-not-allowed opacity-60"
        >
          Download PDF (coming soon)
        </button>
      </div>
    </div>
  );
}
