import { requireAuth } from "@/lib/auth-utils";
import { SafetyLabView } from "@/features/safety-lab/components/safety-lab-view";

const SafetyLabPage = async () => {
  await requireAuth();

  return (
    <div className="flex flex-col gap-y-6 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
      <SafetyLabView />
    </div>
  );
};

export default SafetyLabPage;
