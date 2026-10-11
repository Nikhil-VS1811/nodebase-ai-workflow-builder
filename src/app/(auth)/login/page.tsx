import { LoginForm } from "@/features/auth/components/login-form";
import { requireUnauth } from "@/lib/auth-utils";
import { resolveRedirectParam } from "@/lib/redirect-utils";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const Page = async ({ searchParams }: Props) => {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectTo = resolveRedirectParam(resolvedSearchParams);
  await requireUnauth(redirectTo);

  return <LoginForm redirectTo={redirectTo} />;
};

export default Page;
