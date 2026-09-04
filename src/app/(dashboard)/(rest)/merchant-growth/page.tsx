import { requireAuth } from "@/lib/auth-utils";
import { MerchantGrowthView } from "@/features/merchant-growth/components/merchant-growth-view";

const MerchantGrowthPage = async () => {
  await requireAuth();

  return (
    <div className="flex flex-col gap-y-6 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
      <MerchantGrowthView />
    </div>
  );
};

export default MerchantGrowthPage;
