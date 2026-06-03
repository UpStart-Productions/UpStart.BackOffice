/**
 * Resolve AWS access keys from env. Supports common aliases; otherwise the AWS SDK
 * default chain applies (~/.aws/credentials, IAM role, standard AWS_* vars).
 */
export function resolveExplicitAwsCredentials():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const accessKeyId =
    trimEnv('AWS_ACCESS_KEY_ID') ||
    trimEnv('ACCESS_KEY_ID') ||
    trimEnv('ACCESS_KEY');
  const secretAccessKey =
    trimEnv('AWS_SECRET_ACCESS_KEY') ||
    trimEnv('SECRET_ACCESS_KEY') ||
    trimEnv('SECRET_KEY');
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }
  return undefined;
}

function trimEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}
