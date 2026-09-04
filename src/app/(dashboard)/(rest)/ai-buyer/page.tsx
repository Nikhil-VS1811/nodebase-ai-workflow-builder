import { requireAuth } from "@/lib/auth-utils";
import { AiBuyerView } from "@/features/ai-buyer/components/ai-buyer-view";

const AiBuyerPage = async () => {
  await requireAuth();

  return (
    <div className="flex flex-col gap-y-6 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
      <AiBuyerView />
    </div>
  );
};

export default AiBuyerPage;
