// Creates the local MinIO bucket. Run with: node --env-file=.env.local scripts/dev-bootstrap.cjs
// Idempotent: an existing bucket is left alone.
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

async function main() {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("STORAGE_BUCKET is not set");
  const client = new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} already exists`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket ${bucket}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
