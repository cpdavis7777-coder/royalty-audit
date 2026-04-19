import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    n: "01",
    title: "Upload your check stub",
    body: "Drop a PDF or photo of your royalty check stub. We never store your file after extraction.",
  },
  {
    n: "02",
    title: "We pull the public data",
    body: "We fetch production volumes from the Texas Railroad Commission and commodity prices from the EIA for your exact well and month.",
  },
  {
    n: "03",
    title: "Plain-English audit report",
    body: "We tell you what you should have been paid, what you actually received, and why there's a gap — in language anyone can understand.",
  },
];

const sampleFields = [
  { label: "Operator", value: "Permian Basin Resources LLC" },
  { label: "Well", value: "Collins Trust 14H" },
  { label: "API Number", value: "42-317-40812-00" },
  { label: "Production Month", value: "August 2024" },
  { label: "Product", value: "Oil" },
  { label: "Net Volume", value: "18.42 bbl" },
  { label: "Gross Value", value: "$1,473.10" },
  { label: "Total Deductions", value: "$147.31" },
  { label: "Net Check", value: "$1,325.79" },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto mb-20">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">Texas · v1 Beta</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
          Are you getting paid{" "}
          <span className="text-primary">what you&apos;re owed</span> on your mineral rights?
        </h1>
        <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
          Operators underpay royalty owners by 5–20% through errors and deliberate deductions.
          Upload your check stub and we&apos;ll tell you exactly where you stand — in plain English.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/upload"
            className="bg-primary text-primary-foreground font-semibold px-8 py-4 rounded-md hover:opacity-90 transition-opacity text-lg"
          >
            Audit My Check — Free
          </Link>
          <Link
            href="/how-it-works"
            className="border border-border text-foreground font-medium px-8 py-4 rounded-md hover:bg-secondary transition-colors text-lg"
          >
            See How It Works
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mt-4">No account required · Results in under 60 seconds</p>
      </div>

      {/* How it works */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-10">Three steps to your audit</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <Card key={s.n} className="bg-card border-border">
              <CardHeader>
                <span className="text-4xl font-bold text-primary/40">{s.n}</span>
                <CardTitle className="text-lg mt-2">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Sample output */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-4">Sample extracted fields</h2>
        <p className="text-muted-foreground text-center mb-8">
          This is what True Barrel reads from your check stub automatically.
        </p>
        <Card className="max-w-2xl mx-auto bg-card border-border">
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {sampleFields.map(({ label, value }, i) => (
                  <tr key={label} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="px-6 py-3 text-sm text-muted-foreground font-medium w-48">{label}</td>
                    <td className="px-6 py-3 text-sm font-mono">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Pricing teaser */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Straightforward pricing</h2>
        <div className="flex flex-col sm:flex-row gap-6 justify-center max-w-2xl mx-auto">
          <Card className="flex-1 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-primary">$49</CardTitle>
              <p className="text-muted-foreground text-sm">One-time audit</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Single check stub · Full variance report · PDF export</p>
            </CardContent>
          </Card>
          <Card className="flex-1 bg-card border-primary/30 border-2">
            <CardHeader>
              <Badge className="w-fit mb-2 bg-primary/20 text-primary border-primary/30">Best value</Badge>
              <CardTitle className="text-3xl font-bold text-primary">
                $19<span className="text-lg text-muted-foreground">/mo</span>
              </CardTitle>
              <p className="text-muted-foreground text-sm">Monthly tracking</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Unlimited audits · Month-over-month alerts · Audit history dashboard</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground mt-6">Payments coming soon · Beta audits are free</p>
      </div>
    </div>
  );
}
