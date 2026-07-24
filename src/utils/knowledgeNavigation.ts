export function navigateToKnowledgeCenter() {
  if (window.location.pathname !== "/kho-tri-thuc") {
    window.history.pushState(null, "", "/kho-tri-thuc");
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
