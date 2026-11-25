import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const pipeline = [
  "Ingest",
  "Extract PKR",
  "Generate creatives",
  "Generate listings",
  "Policy check",
  "Review & approve",
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">
          POC · sandbox mode
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">D2C Autopilot</h1>
        <p className="text-muted-foreground">
          Turn a product photo set and one product document into ad creatives,
          videos and marketplace listings. Nothing publishes without your
          approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generation pipeline</CardTitle>
          <CardDescription>
            Each step is durable and resumable. Publishing is a separate
            workflow triggered only by approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-2">
            {pipeline.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button>New product</Button>
        <Button variant="outline" asChild>
          <a href="/api/health">API health check</a>
        </Button>
      </div>
    </main>
  );
}
