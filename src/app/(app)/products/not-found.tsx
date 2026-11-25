import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        Product not found
      </h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or the link is wrong.
      </p>
      <Link className="underline" href="/products">
        Back to products
      </Link>
    </div>
  );
}
