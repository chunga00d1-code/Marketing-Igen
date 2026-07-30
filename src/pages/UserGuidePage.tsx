import React from "react";
import MarketingUserGuide from "../components/marketing/MarketingUserGuideV2";

export default function UserGuidePage() {
  return (
    <div className="h-full flex flex-col font-sans overflow-y-auto pr-2 pb-6" id="user_guide_page_container">
      <MarketingUserGuide />
    </div>
  );
}
