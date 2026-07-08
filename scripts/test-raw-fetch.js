const apiKey = "sk_V2_hgu_kRy9jNpHcZH_mEuaNM4B5UrWWdoIsgxXLSpTJJ3WFwjR";

async function run() {
  const candidates = ["/v2/avatars", "/v1/avatars", "/v2/avatar.list", "/v1/avatar.list"];
  for (const path of candidates) {
    try {
      console.log("Fetching", path);
      const res = await fetch(`https://api.heygen.com${path}`, {
        headers: { "x-api-key": apiKey }
      });
      const data = await res.json();
      const list = data?.data?.avatars || data?.avatars || data?.data || data;
      if (Array.isArray(list) && list.length > 0) {
        console.log(`Success on ${path}. Total items:`, list.length);
        console.log("Sample item 0:", JSON.stringify(list[0], null, 2));
        const customCount = list.filter(item => 
          item?.is_custom_avatar ||
          item?.is_user_avatar ||
          item?.is_owner ||
          item?.owned_by_me ||
          item?.created_by_user ||
          item?.avatar_type === "custom" ||
          item?.source === "user" ||
          item?.type === "custom"
        ).length;
        console.log("Total matched as isCustom by our logic:", customCount);
        
        // Let's print some items that are public but might be matching
        const samplePublic = list.find(item => item?.name?.includes("Abigail") || item?.avatar_name?.includes("Abigail"));
        if (samplePublic) {
          console.log("Abigail item structure:", JSON.stringify(samplePublic, null, 2));
        }
        break;
      }
    } catch (e) {
      console.error("Failed on", path, e.message);
    }
  }
}

run();
