import { requireAuth } from "@/lib/auth-utils";
import { CommerceDemoView } from "@/features/commerce-demo/components/commerce-demo-view";

const CommerceDemoPage = async () => {
  await requireAuth();

  return (
    <div className="flex flex-col gap-y-6 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
      <CommerceDemoView />
    </div>
  );
};

export default CommerceDemoPage;
