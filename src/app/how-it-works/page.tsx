import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const steps = [
  {
    n: "01",
    title: "You upload a check stub",
    detail:
      "We accept PDF or image files (JPG, PNG, HEIC). The file is sent directly to our extraction engine — we don't store it on our servers.",
  },
  {
    n: "02",
    title: "Our engine extracts the fields",
    detail:
      "Our extraction engine reads your check stub and pulls out: operator name, well name, API number, production month, decimal interest, net volume, product type, gross value, deductions, and net check amount.",
  },
  {
    n: "03",
    title: "We fetch Texas RRC production data",
    detail:
      "Using your well's API number and production month, we query the Texas Railroad Commission's public production database to get the reported gross production volumes.",
  },
  {
    n: "04",
    title: "We fetch commodity prices",
    detail:
      "We pull WTI crude oil or Henry Hub natural gas spot prices from the U.S. Energy Information Administration (EIA) for your production month.",
  },
  {
    n: "05",
    title: "We calculate what you should have received",
    detail:
      "Expected royalty = (Gross Production × Your Decimal Interest × Commodity Price) − Industry-Average Deductions. We compare this to what you actually received.",
  },
  {
    n: "06",
    title: "You get a plain-English report",
    detail:
      "The report shows the variance (over/underpayment), the likely explanations, and suggested next steps — including when to contact your operator and when a discrepancy is within normal range.",
  },
];

const caveats = [
  "Texas Railroad Commission data may lag 30–90 days. If your production month is recent, the public data may not yet reflect it.",
  "Deductions (transportation, processing, compression) vary by lease. We use industry averages in v1 — your lease may have different terms.",
  "v1 handles oil and natural gas only. NGL and condensate are not covered yet.",
  "This tool is informational only. It is not legal or financial advice. Consult a qualified attorney or CPA for formal disputes.",
];

export default function HowItWorks() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="text-center mb-14">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">Methodology</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-4">How True Barrel works</h1>
        <p className="text-muted-foreground text-lg">
          Every step is grounded in public data. No black boxes.
        </p>
      </div>

      <div className="space-y-4 mb-16">
        {steps.map((s) => (
          <Card key={s.n} className="bg-card border-border">
            <CardHeader className="flex flex-row items-start gap-4 pb-2">
              <span className="text-2xl font-bold text-primary/50 w-10 shrink-0">{s.n}</span>
              <CardTitle className="text-lg leading-snug">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="pl-14">
              <p className="text-muted-foreground text-sm leading-relaxed">{s.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-6">Important caveats</h2>
        <ul className="space-y-3">
          {caveats.map((c, i) => (
            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
              <span className="text-primary mt-0.5 shrink-0">⚠</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
