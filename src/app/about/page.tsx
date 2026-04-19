import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="text-center mb-14">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">About</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-4">Built for mineral rights owners</h1>
        <p className="text-muted-foreground text-lg">
          Not auditors. Not attorneys. The people who actually own the land.
        </p>
      </div>

      <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
        <p>
          12 million Americans own mineral rights. Most inherited them from grandparents who worked
          the land. They receive monthly royalty checks they can&apos;t verify, from operators they&apos;ve
          never met, covering production data they can&apos;t access.
        </p>
        <p>
          Professional royalty audits cost $1,500 or more and require hiring a specialist. Most
          owners never bother — even when underpayments are systematic and recoverable.
        </p>
        <p>
          True Barrel exists to level the information playing field. The data is all public. The math
          isn&apos;t complicated. What was missing was a tool that could read a check stub, fetch the
          right production records, and explain the difference in plain English.
        </p>
        <p>
          We built that tool.
        </p>
      </div>

      <Card className="my-12 bg-card border-primary/30">
        <CardContent className="pt-6">
          <h2 className="text-lg font-bold mb-3 text-foreground">Legal disclaimer</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            True Barrel is an informational tool only. Nothing on this site constitutes legal, financial,
            or accounting advice. Audit results are estimates based on public data and industry
            averages — they are not a formal determination of underpayment and should not be
            represented as such in any legal proceeding. If you believe you have been materially
            underpaid, consult a qualified petroleum landman, royalty auditor, or attorney licensed
            in your state. State production data may lag by 30–90 days. Deductions vary by lease.
          </p>
        </CardContent>
      </Card>

      <div className="text-center">
        <p className="text-muted-foreground mb-6">
          Questions or feedback? We&apos;re in beta and we want to hear from you.
        </p>
        <Link
          href="/upload"
          className="bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-md hover:opacity-90 transition-opacity"
        >
          Try a free audit
        </Link>
      </div>
    </div>
  );
}
